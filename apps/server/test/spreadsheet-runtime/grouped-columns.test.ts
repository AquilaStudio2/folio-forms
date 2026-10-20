import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  protectSpreadsheet,
  unprotectSpreadsheet,
} from "../../src/documents/spreadsheets/protection";
import { applySpreadsheetValidation } from "../../src/documents/spreadsheets/validation";
import {
  extractSpreadsheetData,
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import { fixtureWorkbook, mutatePart } from "../spreadsheet-unit/fixture";
import {
  descendants,
  SpreadsheetRuntime,
  workbookXml,
} from "./runtime-fixture";

const bindings = spreadsheetBindingSchema.parse({
  fields: [],
  table: {
    anchor: "folio_body",
    columns: ["first", "second", "third"].map((key, offset) => ({
      id: `folio_${key}`,
      key,
      label: key,
      offset,
      options: ["alpha", "beta", "gamma"],
      type: "dropdown",
    })),
    id: "folio_table",
    key: "items",
    label: "Items",
  },
  version: 1,
});

// Standard outline metadata is native spreadsheet layout, outside Folio field
// configuration. Exercise the real editor roundtrip with a compact XLSX fixture.
const groupedFixture = () =>
  mutatePart(
    fixtureWorkbook({
      cells: [
        { address: "D4", value: "alpha" },
        { address: "E4", value: "beta" },
        { address: "F4", value: "gamma" },
      ],
      merges: ["D2:F2"],
      names: { folio_body: "'Form'!$D$4:$F$5" },
    }),
    "xl/worksheets/sheet1.xml",
    (xml) =>
      xml.replace(
        "<sheetData>",
        '<sheetPr><outlinePr summaryRight="1" summaryBelow="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showOutlineSymbols="1"><pane xSplit="1" ySplit="3" topLeftCell="B4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15" outlineLevelCol="2"/><cols><col min="2" max="3" width="18" customWidth="1" outlineLevel="1" hidden="1"/><col min="4" max="5" width="22" customWidth="1" outlineLevel="2" hidden="1"/><col min="6" max="6" width="18" customWidth="1" collapsed="1"/></cols><sheetData>'
      )
  );

const layout = (bytes: Uint8Array) => {
  const { sheet } = workbookXml(bytes);
  return {
    columns: descendants(sheet, "col")
      .filter(
        (column) =>
          column.attributes.outlineLevel || column.attributes.collapsed
      )
      .map((column) => column.attributes),
    merges: descendants(sheet, "mergeCell").map(
      (merge) => merge.attributes.ref
    ),
    panes: descendants(sheet, "pane").map((pane) => pane.attributes),
  };
};

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "native grouped columns across draft and response processing",
  () => {
    const runtime = new SpreadsheetRuntime();
    beforeAll(() => runtime.start(), 120_000);
    afterAll(() => runtime.stop(), 120_000);

    test("preserves nested outlines, merged headers, freeze panes and widths through validation, protection and row edits", async () => {
      const original = groupedFixture();
      const expected = layout(original);
      const validated = applySpreadsheetValidation(original, bindings);
      expect(layout(validated)).toEqual(expected);
      await runtime.write("grouped.xlsx", validated);
      await runtime.runJob("grouped.xlsx", { outputName: "reopened.xlsx" });
      const reopened = await runtime.read("reopened.xlsx");
      expect(layout(reopened)).toEqual(expected);
      const protectedBytes = protectSpreadsheet(
        reopened,
        resolveSpreadsheetContract(bindings, readSpreadsheetWorkbook(reopened))
      );
      expect(layout(protectedBytes)).toEqual(expected);
      expect(
        descendants(workbookXml(protectedBytes).sheet, "sheetProtection")
      ).toHaveLength(1);
      await runtime.write(
        "unlocked.xlsx",
        unprotectSpreadsheet(protectedBytes)
      );
      await runtime.runJob("unlocked.xlsx", {
        outputName: "inserted.xlsx",
        restorePrototypeValidation: false,
        rowChange: {
          action: "insert",
          bodyName: "folio_body",
          index: 1,
          inputColumns: [0, 1, 2],
        },
      });
      // Match processSpreadsheet: authoritative bindings rebuild validations
      // after native row edits instead of copying interface-formatted formulas.
      const inserted = applySpreadsheetValidation(
        await runtime.read("inserted.xlsx"),
        bindings
      );
      expect(layout(inserted)).toEqual(expected);
      const workbook = readSpreadsheetWorkbook(inserted);
      expect(workbook.names.get("folio_body")).toMatchObject({
        firstRow: 3,
        lastRow: 5,
      });
      expect(
        extractSpreadsheetData(
          workbook,
          resolveSpreadsheetContract(bindings, workbook),
          true
        )
      ).toMatchObject({
        data: { items: [{ first: "alpha", second: "beta", third: "gamma" }] },
        errors: [],
      });
      await runtime.write("inserted.xlsx", inserted);
      await runtime.runJob("inserted.xlsx", {
        outputName: "deleted.xlsx",
        restorePrototypeValidation: false,
        rowChange: {
          action: "delete",
          bodyName: "folio_body",
          index: 1,
          inputColumns: [0, 1, 2],
        },
      });
      expect(layout(await runtime.read("deleted.xlsx"))).toEqual(expected);
    }, 120_000);
  }
);
