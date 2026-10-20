import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { compactSpreadsheetDraftOptions } from "../../src/documents/spreadsheets/helper-storage";
import {
  descendants,
  SpreadsheetRuntime,
  workbookXml,
} from "./runtime-fixture";

const commandsUrl = new URL(
  "../../../onlyoffice-plugin/src/spreadsheet-commands.js",
  import.meta.url
);
const commands = (await import(commandsUrl.href)) as Record<
  string,
  () => unknown
>;
const scoped = (name: string) =>
  `(function(Asc) { return (${commands[name]?.toString()})(); })({scope: Asc.scope})`;
const update = (anchor: string, options: string[]) =>
  `Asc.scope.folioSpreadsheetValidation = ${JSON.stringify({ anchor, options, type: "dropdown" })}; ${scoped("spreadsheetValidationCommand")};`;
const optionNames = (bytes: Uint8Array) =>
  Object.keys(workbookXml(bytes).names)
    .filter((name) => name.startsWith("_folio_options_draft_"))
    .toSorted();
const runtime = new SpreadsheetRuntime();

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "native draft helper reuse and saved storage cleanup",
  () => {
    beforeAll(() => runtime.start(), 120_000);
    afterAll(() => runtime.stop(), 120_000);

    test("reuses identical immutable lists across bindings and reclaims only saved orphan storage for the next edit", async () => {
      const original = ["old,private", "=literal", "ก".repeat(260)];
      const active = ["current,choice", 'with "quotes"'];
      const next = ["next,choice", "next,other"];
      await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope={};
Api.AddDefName("folio_first","'Form'!$A$1",false); Api.AddDefName("folio_other","'Form'!$B$1",false);
${update("folio_first", original)}
${update("folio_first", original)}
${update("folio_other", original)}
builder.SaveFile("xlsx","/work/reused.xlsx");
${update("folio_first", active)}
Asc.scope.folioSpreadsheetValidation={anchor:"folio_other",removeAnchor:true};
${scoped("spreadsheetClearValidationCommand")};
builder.SaveFile("xlsx","/work/before-cleanup.xlsx"); builder.CloseFile();`);
      expect(optionNames(await runtime.read("reused.xlsx"))).toEqual([
        "_folio_options_draft_1",
      ]);
      const originalBytes = await runtime.read("before-cleanup.xlsx");
      expect(optionNames(originalBytes)).toHaveLength(2);
      const compacted = compactSpreadsheetDraftOptions(originalBytes);
      expect(optionNames(compacted)).toEqual(["_folio_options_draft_2"]);
      const workbook = workbookXml(compacted);
      const strings = descendants(
        workbook.parse("xl/sharedStrings.xml"),
        "t"
      ).map((node) => node.text);
      expect(strings).not.toContain("old,private");
      expect(strings).toContain("current,choice");
      expect(
        descendants(workbook.parse("xl/worksheets/sheet2.xml"), "c").map(
          (node) => node.attributes.r
        )
      ).not.toContain("A2");
      // Server cleanup edits only the saved copy; the original remains available
      // to an uncertain operation or the old editor until successful remount.
      expect(optionNames(originalBytes)).toHaveLength(2);
      await runtime.write("compacted.xlsx", compacted);
      await runtime.run(`builder.OpenFile("/work/compacted.xlsx");
Asc.scope={};
Api.AddDefName("folio_third","'Form'!$C$1",false);
${update("folio_third", next)}
${update("folio_third", next)}
builder.SaveFile("xlsx","/work/reclaimed.xlsx"); builder.CloseFile();`);
      const reclaimed = workbookXml(await runtime.read("reclaimed.xlsx"));
      expect(optionNames(await runtime.read("reclaimed.xlsx"))).toEqual([
        "_folio_options_draft_1",
        "_folio_options_draft_2",
      ]);
      expect(reclaimed.names._folio_options_draft_1).toContain("$A$2:$A$3");
      expect(reclaimed.names._folio_options_draft_2).toContain("$B$2:$B$3");
      expect(
        descendants(
          reclaimed.parse("xl/worksheets/sheet2.xml"),
          "sheetProtection"
        )[0]?.attributes.sheet
      ).toBe("1");
      expect(
        descendants(reclaimed.parse("xl/workbook.xml"), "sheet").find(
          (node) => node.attributes.name === "_folio_options"
        )?.attributes.state
      ).toMatch(/hidden/iu);
      await runtime.run(`builder.OpenFile("/work/reclaimed.xlsx");
var sheet=Api.GetSheet("Form");
sheet.GetRange("Z1").SetValue(JSON.stringify(sheet.GetRange("A1").GetValidation().validations[0].getListValues(sheet.worksheet)[0]));
sheet.GetRange("Z2").SetValue(JSON.stringify(sheet.GetRange("C1").GetValidation().validations[0].getListValues(sheet.worksheet)[0]));
builder.SaveFile("xlsx","/work/reopened.xlsx"); builder.CloseFile();`);
      const reopened = workbookXml(await runtime.read("reopened.xlsx"));
      const reopenedStrings = descendants(
        reopened.parse("xl/sharedStrings.xml"),
        "si"
      ).map((node) =>
        descendants(node, "t")
          .map((child) => child.text)
          .join("")
      );
      expect(
        JSON.parse(reopenedStrings[Number(reopened.cell("Z1").value)] ?? "null")
      ).toEqual(active);
      expect(
        JSON.parse(reopenedStrings[Number(reopened.cell("Z2").value)] ?? "null")
      ).toEqual(next);
    }, 120_000);

    test("shared-list rollback keeps both bindings intact and only sweeps the rejected replacement after a stable save", async () => {
      const options = ["shared,one", "shared,two"];
      await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope={};
Api.AddDefName("folio_first","'Form'!$A$1",false); Api.AddDefName("folio_other","'Form'!$B$1",false);
${update("folio_first", options)}
${update("folio_other", options)}
Asc.scope.folioSpreadsheetValidation={anchor:"folio_first"};
var snapshot=${scoped("spreadsheetCaptureValidationCommand")};
${update("folio_first", ["rejected,one", "rejected,two"])}
Asc.scope.folioSpreadsheetValidationSnapshot=snapshot;
${scoped("spreadsheetRestoreValidationCommand")};
builder.SaveFile("xlsx","/work/rolled-back.xlsx"); builder.CloseFile();`);
      const original = await runtime.read("rolled-back.xlsx");
      expect(optionNames(original)).toHaveLength(2);
      const compacted = compactSpreadsheetDraftOptions(original);
      expect(optionNames(compacted)).toEqual(["_folio_options_draft_1"]);
      const workbook = workbookXml(compacted);
      expect(descendants(workbook.sheet, "dataValidation")).toHaveLength(2);
      expect(
        descendants(workbook.parse("xl/sharedStrings.xml"), "t").map(
          (node) => node.text
        )
      ).not.toContain("rejected,one");
    }, 120_000);
    for (const rule of ["formula", "validation"]) {
      test(`does not reuse a reclaimed column after a helper-local ${rule} references it`, async () => {
        await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope={};
Api.AddDefName("folio_first","'Form'!$A$1",false);
${update("folio_first", ["orphan,one", "orphan,two"])}
${update("folio_first", ["active,one", "active,two"])}
builder.SaveFile("xlsx","/work/local-${rule}-original.xlsx"); builder.CloseFile();`);
        await runtime.write(
          `local-${rule}-compacted.xlsx`,
          compactSpreadsheetDraftOptions(
            await runtime.read(`local-${rule}-original.xlsx`)
          )
        );
        await runtime.run(`builder.OpenFile("/work/local-${rule}-compacted.xlsx");
Asc.scope={};
var helper=Api.GetSheet("_folio_options"); var protection=helper.worksheet.sheetProtection.clone(helper.worksheet);
helper.worksheet.setProtectedSheet(Object.assign({},protection,{sheet:false}),true);
${rule === "formula" ? 'helper.GetRange("C2").SetValue("=A2");' : 'helper.GetRange("C2").SetValue("author content"); helper.GetRange("C2").GetValidation().Add("xlValidateList","xlValidAlertStop","xlBetween","=A2:A2");'}
helper.worksheet.setProtectedSheet(protection,true);
Api.GetSheet("Form").SetActive(); Api.AddDefName("folio_new","'Form'!$B$1",false);
${update("folio_new", ["new,one", "new,two"])}
builder.SaveFile("xlsx","/work/local-${rule}-result.xlsx"); builder.CloseFile();`);
        const bytes = await runtime.read(`local-${rule}-result.xlsx`);
        const workbook = workbookXml(bytes);
        expect(workbook.names._folio_options_draft_4).toContain("$D$2:$D$3");
        expect(workbook.names._folio_options_draft_1).toBeUndefined();
        expect(compactSpreadsheetDraftOptions(bytes)).toBe(bytes);
      }, 120_000);
    }
  }
);
