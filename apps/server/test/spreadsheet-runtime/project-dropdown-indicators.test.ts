import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { strFromU8 } from "fflate";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  projectDropdownIndicatorTargets,
  spreadsheetProjectDropdownIndicatorCommand,
} from "../../src/documents/spreadsheets/project-dropdown-indicators";
import { readSpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";
import {
  descendants,
  SpreadsheetRuntime,
  workbookXml,
  xmlTree,
} from "./runtime-fixture";

const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_project",
      id: "folio_project",
      key: "project",
      label: "ชื่อโครงการ",
      source: "pdms-project-name",
      type: "dropdown",
    },
    {
      anchor: "folio_ordinary",
      id: "folio_ordinary",
      key: "ordinary",
      label: "Ordinary input",
      type: "text",
    },
  ],
  table: {
    anchor: "folio_table",
    columns: [
      {
        id: "folio_column",
        key: "project",
        label: "ชื่อโครงการในตาราง",
        offset: 1,
        source: "pdms-project-name",
        type: "dropdown",
      },
    ],
    id: "folio_table",
    key: "items",
    label: "รายการ",
  },
  version: 1,
});
const fixture = fixtureWorkbook({
  cells: [
    { address: "B2", value: "" },
    { address: "F2", value: "บันทึกเดิม" },
    { address: "C5", value: "โครงการเดิม" },
    { address: "C6", value: "" },
  ],
  merges: ["B2:D2"],
  names: {
    folio_ordinary: "'Form'!$F$2",
    folio_project: "'Form'!$B$2:$D$2",
    folio_table: "'Form'!$B$5:$C$6",
  },
});
const runtime = new SpreadsheetRuntime();
const input = { targets: projectDropdownIndicatorTargets(bindings) };
const drawings = (bytes: Uint8Array) => {
  const { entries } = workbookXml(bytes);
  return Object.entries(entries)
    .filter(([name]) => /^xl\/drawings\/drawing\d+\.xml$/u.test(name))
    .flatMap(([, part]) =>
      descendants(xmlTree(strFromU8(part)), "cNvPr").map(
        (node) => node.attributes
      )
    );
};

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "native project dropdown indicators",
  () => {
    beforeAll(async () => {
      await runtime.start();
      await runtime.write("input.xlsx", fixture);
    }, 120_000);
    afterAll(() => runtime.stop(), 120_000);

    test("empty and filled mapped cells get one arrow without changing answers; repeat and removal preserve foreign shapes", async () => {
      await runtime.run(`
        builder.OpenFile("/work/input.xlsx");
        var sheet = Api.GetSheet("Form");
        var foreign = sheet.AddShape("rect", 9525, 9525, Api.CreateSolidFill(Api.CreateRGBColor(0,0,0)), Api.CreateStroke(0, Api.CreateNoFill()), 0, 0, 0, 0);
        foreign.SetName("folio_pdms_dropdown_foreign");
        (${spreadsheetProjectDropdownIndicatorCommand.toString()})(${JSON.stringify(input)});
        (${spreadsheetProjectDropdownIndicatorCommand.toString()})(${JSON.stringify(input)});
        builder.SaveFile("xlsx", "/work/arrows.xlsx");
        (${spreadsheetProjectDropdownIndicatorCommand.toString()})({targets: []});
        builder.SaveFile("xlsx", "/work/removed.xlsx");
        builder.CloseFile();
      `);
      const bytes = await runtime.read("arrows.xlsx");
      const arrows = drawings(bytes);
      expect(arrows).toHaveLength(4);
      expect(
        arrows.filter((shape) =>
          shape.name?.startsWith("folio_pdms_dropdown_v1_")
        )
      ).toHaveLength(3);
      const workbook = readSpreadsheetWorkbook(bytes);
      expect(workbook.cells.get("B2")?.value ?? "").toBe("");
      expect(workbook.cells.get("F2")?.value).toBe("บันทึกเดิม");
      expect(workbook.cells.get("C5")?.value).toBe("โครงการเดิม");
      expect(workbook.cells.get("C6")?.value ?? "").toBe("");
      expect(drawings(await runtime.read("removed.xlsx"))).toEqual([
        expect.objectContaining({ name: "folio_pdms_dropdown_foreign" }),
      ]);
    }, 120_000);

    test("the production builder retains arrows after a project choice and projects one per appended table row", async () => {
      await runtime.runJob("input.xlsx", {
        projectDropdownTargets: input.targets,
        rowChange: {
          action: "insert",
          bodyName: "folio_table",
          index: 1,
          inputColumns: [1],
        },
        values: [{ address: "B2", text: true, value: "โครงการที่เลือกแล้ว" }],
      });
      const bytes = await runtime.read("canonical.xlsx");
      const names = drawings(bytes).map((shape) => shape.name);
      expect(names).toHaveLength(4);
      expect(new Set(names).size).toBe(4);
      expect(names).toContain("folio_pdms_dropdown_v1_folio_project_row_0");
      expect(names).toContain("folio_pdms_dropdown_v1_folio_column_row_2");
      const workbook = readSpreadsheetWorkbook(bytes);
      expect(workbook.cells.get("B2")?.value).toBe("โครงการที่เลือกแล้ว");
      expect(workbook.cells.get("F2")?.value).toBe("บันทึกเดิม");
      expect(workbook.cells.get("C5")?.value).toBe("โครงการเดิม");
      expect(workbook.cells.get("C6")?.value ?? "").toBe("");
      for (const [name, part] of Object.entries(workbook.archive)) {
        if (/^xl\/drawings\/drawing\d+\.xml$/u.test(name)) {
          const locks = descendants(xmlTree(strFromU8(part)), "spLocks");
          expect(locks).toHaveLength(4);
          expect(locks.every((node) => node.attributes.noSelect === "1")).toBe(
            true
          );
        }
      }
    }, 120_000);
  }
);
