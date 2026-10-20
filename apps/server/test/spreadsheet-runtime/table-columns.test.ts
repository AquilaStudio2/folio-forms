// oxlint-disable no-await-in-loop -- Reopen independent workbooks through the isolated native runtime.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  spreadsheetBindingAnchors,
  spreadsheetColumnAnchor,
  spreadsheetTableColumnsAnchor,
} from "../../src/documents/spreadsheets/columns";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { validateSpreadsheetSaveSnapshot } from "../../src/documents/spreadsheets/save-snapshot";
import { applySpreadsheetValidation } from "../../src/documents/spreadsheets/validation";
import {
  extractSpreadsheetData,
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";
import {
  SpreadsheetRuntime,
  workbookXml,
  descendants,
} from "./runtime-fixture";

const pluginUrl = new URL(
  "../../../onlyoffice-plugin/src/spreadsheet-columns.js",
  import.meta.url
);
const { spreadsheetColumnsCommand } = (await import(pluginUrl.href)) as {
  spreadsheetColumnsCommand: () => string;
};
const selectionUrl = new URL(
  "../../../onlyoffice-plugin/src/spreadsheet-selection.js",
  import.meta.url
);
const { selectedBinding } = (await import(selectionUrl.href)) as {
  selectedBinding: (
    selection: unknown,
    bindings: unknown
  ) => [string, { id: string; offset: number }] | null;
};
const runtime = new SpreadsheetRuntime();
const bindings = spreadsheetBindingSchema.parse({
  fields: [],
  table: {
    anchor: "folio_body",
    columns: ["alpha", "beta", "gamma"].map((key, offset) => ({
      id: `folio_${key}`,
      key,
      label: key,
      offset,
      type: "text",
    })),
    id: "folio_items",
    key: "items",
    label: "Items",
  },
  version: 1,
});
const command = (
  initialize = false,
  repair = false
) => `Asc.scope = {folioSpreadsheetColumns: ${JSON.stringify({ initialize, repair, table: bindings.table })}};
sheet.GetRange("A20").SetValue((${spreadsheetColumnsCommand.toString()})());`;
const values = { items: [{ alpha: "alpha", beta: "beta", gamma: "gamma" }] };

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "native table column identity in ONLYOFFICE 9.4",
  () => {
    beforeAll(async () => {
      await runtime.start();
      await runtime.write(
        "legacy.xlsx",
        fixtureWorkbook({
          cells: [
            { address: "D4", value: "alpha" },
            { address: "E4", value: "beta" },
            { address: "F4", value: "gamma" },
          ],
          merges: [],
          names: { folio_body: "'Form'!$D$4:$F$5" },
        })
      );
      await runtime.run(`builder.OpenFile("/work/legacy.xlsx");
var sheet = Api.GetActiveSheet();
${command(true)}
builder.SaveFile("xlsx", "/work/tracked.xlsx");
builder.CloseFile();`);
      const workbook = readSpreadsheetWorkbook(
        await runtime.read("tracked.xlsx")
      );
      expect(
        JSON.parse(String(workbook.cells.get("A20")?.value))
      ).toMatchObject({ changed: true, ok: true });
    }, 120_000);
    afterAll(() => runtime.stop(), 120_000);

    test("tracks a column inserted in the middle after save/reopen without losing the last answer", async () => {
      await runtime.run(`builder.OpenFile("/work/tracked.xlsx");
var sheet = Api.GetActiveSheet();
sheet.GetRange("E:E").Insert("right");
${command()}
builder.SaveFile("xlsx", "/work/inserted.xlsx");
builder.CloseFile();`);
      await runtime.runJob("inserted.xlsx", { outputName: "reopened.xlsx" });
      const bytes = await runtime.read("reopened.xlsx");
      const workbook = readSpreadsheetWorkbook(bytes);
      const contract = resolveSpreadsheetContract(bindings, workbook);
      expect(contract.table?.columns.map((column) => column.offset)).toEqual([
        0, 2, 3,
      ]);
      expect(extractSpreadsheetData(workbook, contract, true)).toEqual({
        data: values,
        errors: [],
      });
      const { names } = workbookXml(bytes);
      const anchors = spreadsheetBindingAnchors(bindings).map(
        (name) => [name, names[name] ?? null] as [string, string | null]
      );
      expect(() =>
        validateSpreadsheetSaveSnapshot(anchors, bindings, workbook)
      ).not.toThrow();
      expect(() =>
        validateSpreadsheetSaveSnapshot(anchors.slice(0, 1), bindings, workbook)
      ).toThrow();
      expect(
        selectedBinding({ address: "G4", anchors, sheet: "Form" }, bindings)
      ).toEqual([
        "column",
        expect.objectContaining({ id: "folio_gamma", offset: 3 }),
      ]);
      const dropdown = {
        ...bindings,
        table: bindings.table
          ? {
              ...bindings.table,
              columns: bindings.table.columns.map((column) =>
                column.key === "beta"
                  ? {
                      ...column,
                      options: ["beta", "other"],
                      type: "dropdown" as const,
                    }
                  : column
              ),
            }
          : null,
      };
      const published = workbookXml(
        applySpreadsheetValidation(bytes, dropdown)
      );
      expect(
        descendants(published.sheet, "dataValidation")[0]?.attributes.sqref
      ).toBe("F4:F5");
    }, 120_000);

    test("tracks native cut/paste column reordering and whole-table movement", async () => {
      for (const [name, mutation, offsets] of [
        [
          "swapped",
          'sheet.GetRange("D4:D5").Cut(sheet.GetRange("H4:H5"));\nsheet.GetRange("F4:F5").Cut(sheet.GetRange("D4:D5"));\nsheet.GetRange("H4:H5").Cut(sheet.GetRange("F4:F5"));',
          [2, 1, 0],
        ],
        [
          "moved",
          'sheet.GetRange("D4:F5").Cut(sheet.GetRange("J10:L11"));',
          [0, 1, 2],
        ],
      ] as const) {
        await runtime.run(`builder.OpenFile("/work/tracked.xlsx");
var sheet = Api.GetActiveSheet();
${mutation}
${command()}
builder.SaveFile("xlsx", "/work/${name}.xlsx");
builder.CloseFile();`);
        const workbook = readSpreadsheetWorkbook(
          await runtime.read(`${name}.xlsx`)
        );
        const contract = resolveSpreadsheetContract(bindings, workbook);
        expect(contract.table?.columns.map((column) => column.offset)).toEqual([
          ...offsets,
        ]);
        expect(extractSpreadsheetData(workbook, contract, true)).toEqual({
          data: values,
          errors: [],
        });
      }
    }, 120_000);

    test("deleted mapped columns and missing/ambiguous identities fail instead of mapping a neighbor", async () => {
      for (const [name, mutation] of [
        ["deleted", 'sheet.GetRange("E:E").Delete("left");'],
        [
          "missing",
          `Api.GetDefName(${JSON.stringify(spreadsheetColumnAnchor("folio_beta"))}).Delete();`,
        ],
        [
          "all-missing",
          bindings.table?.columns
            .map(
              (column) =>
                `Api.GetDefName(${JSON.stringify(spreadsheetColumnAnchor(column.id))}).Delete();`
            )
            .join("\n"),
        ],
        [
          "duplicate",
          `Api.GetDefName(${JSON.stringify(spreadsheetColumnAnchor("folio_beta"))}).SetRefersTo("'Form'!$D$4:$D$5");`,
        ],
      ]) {
        await runtime.run(`builder.OpenFile("/work/tracked.xlsx");
var sheet = Api.GetActiveSheet();
${mutation}
${command(true)}
builder.SaveFile("xlsx", "/work/${name}.xlsx");
builder.CloseFile();`);
        const bytes = await runtime.read(`${name}.xlsx`);
        // The command writes a shared string in native output; the normal reader
        // checks it whenever the deleted defined name still permits parsing.
        if (name !== "deleted") {
          const workbook = readSpreadsheetWorkbook(bytes);
          expect(
            JSON.parse(String(workbook.cells.get("A20")?.value))
          ).toMatchObject({ ok: false });
        }
        expect(() =>
          resolveSpreadsheetContract(bindings, readSpreadsheetWorkbook(bytes))
        ).toThrow();
      }
    }, 120_000);

    test("legacy structural edits are safely rejected before initial tracking", async () => {
      await runtime.run(`builder.OpenFile("/work/legacy.xlsx");
var sheet = Api.GetActiveSheet();
sheet.GetRange("E:E").Insert("right");
${command(true)}
builder.SaveFile("xlsx", "/work/legacy-changed.xlsx");
builder.CloseFile();`);
      const workbook = readSpreadsheetWorkbook(
        await runtime.read("legacy-changed.xlsx")
      );
      expect(
        JSON.parse(String(workbook.cells.get("A20")?.value))
      ).toMatchObject({ ok: false });
      expect(
        workbook.names.has(spreadsheetTableColumnsAnchor("folio_items"))
      ).toBe(false);
      expect(() => resolveSpreadsheetContract(bindings, workbook)).toThrow(
        "โครงสร้างคอลัมน์"
      );
    }, 120_000);

    test("an explicit table reanchor restores missing column identities only at the selected matching layout", async () => {
      await runtime.run(`builder.OpenFile("/work/tracked.xlsx");
var sheet = Api.GetActiveSheet();
sheet.GetRange("D4:F5").Cut(sheet.GetRange("J10:L11"));
Api.GetDefName("folio_body").Delete();
Api.GetDefName(${JSON.stringify(spreadsheetColumnAnchor("folio_beta"))}).Delete();
Api.AddDefName("folio_body", "'Form'!$J$10:$L$11", false);
${command(true, true)}
builder.SaveFile("xlsx", "/work/repaired.xlsx");
builder.CloseFile();`);
      const workbook = readSpreadsheetWorkbook(
        await runtime.read("repaired.xlsx")
      );
      expect(
        JSON.parse(String(workbook.cells.get("A20")?.value))
      ).toMatchObject({ changed: true, ok: true });
      expect(
        extractSpreadsheetData(
          workbook,
          resolveSpreadsheetContract(bindings, workbook),
          true
        )
      ).toEqual({ data: values, errors: [] });
    }, 120_000);

    test("tracked column identities remain usable after response row insertions/deletions", async () => {
      await runtime.runJob("tracked.xlsx", {
        outputName: "row-added.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_body",
          index: 0,
          inputColumns: [0, 1, 2],
        },
      });
      await runtime.runJob("row-added.xlsx", {
        outputName: "row-deleted.xlsx",
        rowChange: {
          action: "delete",
          bodyName: "folio_body",
          index: 0,
          inputColumns: [0, 1, 2],
        },
      });
      for (const name of ["row-added.xlsx", "row-deleted.xlsx"]) {
        const workbook = readSpreadsheetWorkbook(await runtime.read(name));
        expect(
          extractSpreadsheetData(
            workbook,
            resolveSpreadsheetContract(bindings, workbook),
            true
          )
        ).toEqual({ data: values, errors: [] });
      }
    }, 120_000);
  }
);
