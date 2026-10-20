// oxlint-disable no-await-in-loop -- The isolated runtime reopens saved drafts in order.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  descendants,
  SpreadsheetRuntime,
  workbookXml,
} from "./runtime-fixture";

const commandsUrl = new URL(
  "../../../onlyoffice-plugin/src/spreadsheet-commands.js",
  import.meta.url
);
const {
  spreadsheetValidationCommand,
  spreadsheetCaptureValidationCommand,
  spreadsheetRestoreValidationCommand,
  spreadsheetClearValidationCommand,
} = (await import(commandsUrl.href)) as Record<string, () => unknown>;
const runtime = new SpreadsheetRuntime();
// callCommand supplies Asc.scope only; constructors present in docbuilder's
// global Asc object are unavailable in the live plugin command sandbox.
const scoped = (run: (() => unknown) | undefined) =>
  `(function(Asc) { return (${run?.toString()})(); })({scope: Asc.scope})`;
const command = (input: Record<string, unknown>) =>
  `Asc.scope.folioSpreadsheetValidation = ${JSON.stringify(input)};
${scoped(spreadsheetValidationCommand)};`;
const formula = (rule: ReturnType<typeof descendants>[number] | undefined) =>
  rule &&
  (descendants(rule, "f")[0]?.text ?? descendants(rule, "formula1")[0]?.text);
const cellText = (
  workbook: ReturnType<typeof workbookXml>,
  sheetPath: string,
  address: string
) => {
  const cell = descendants(workbook.parse(sheetPath), "c").find(
    (item) => item.attributes.r === address
  );
  const value = descendants(
    cell ?? { attributes: {}, children: [], local: "", text: "", uri: "" },
    "v"
  )[0]?.text;
  if (cell?.attributes.t === "s") {
    const item = descendants(workbook.parse("xl/sharedStrings.xml"), "si")[
      Number(value)
    ];
    return item
      ? descendants(item, "t")
          .map((text) => text.text)
          .join("")
      : undefined;
  }
  return cell
    ? descendants(cell, "t")
        .map((text) => text.text)
        .join("") || value
    : undefined;
};

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "draft field validation safety in ONLYOFFICE 9.4",
  () => {
    beforeAll(() => runtime.start(), 120_000);
    afterAll(() => runtime.stop(), 120_000);

    test("keeps complete special and long lists in protected hidden helper ranges across edit and reopen", async () => {
      const options = [
        "=literal",
        'A "quoted" choice',
        "with,comma",
        "with;semicolon",
        "first\nsecond",
        "00123",
        "'apostrophe",
        " spaced ",
        "ก".repeat(260),
      ];
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form");
Asc.scope = {};
Api.AddDefName("folio_special", "'Form'!$A$1", false);
Api.AddDefName("folio_other", "'Form'!$B$1", false);
${command({ anchor: "folio_special", options, type: "dropdown" })}
${command({ anchor: "folio_other", options: ["other,one", "other,two"], type: "dropdown" })}
sheet.GetRange("Z1").SetValue(Api.GetActiveSheet().GetName());
builder.SaveFile("xlsx", "/work/special-draft.xlsx"); builder.CloseFile();`);
      await runtime.run(`builder.OpenFile("/work/special-draft.xlsx");
Asc.scope = {};
${command({ anchor: "folio_special", options: [...options, "new,choice"], type: "dropdown" })}
builder.SaveFile("xlsx", "/work/special-updated.xlsx"); builder.CloseFile();`);
      await runtime.runJob("special-updated.xlsx", {
        outputName: "special-reopened.xlsx",
      });
      await runtime.run(`builder.OpenFile("/work/special-reopened.xlsx");
var sheet = Api.GetSheet("Form");
var choices = sheet.GetRange("A1").GetValidation().validations[0].getListValues(sheet.worksheet)[0];
sheet.GetRange("Z2").SetValue(JSON.stringify(choices));
builder.SaveFile("xlsx", "/work/special-reopened.xlsx"); builder.CloseFile();`);
      for (const stage of ["draft", "updated", "reopened"]) {
        const workbook = workbookXml(
          await runtime.read(`special-${stage}.xlsx`)
        );
        const sheets = descendants(workbook.parse("xl/workbook.xml"), "sheet");
        expect(
          sheets.find((item) => item.attributes.name === "_folio_options")
            ?.attributes.state
        ).toMatch(/hidden/iu);
        const rules = descendants(workbook.sheet, "dataValidation");
        expect(rules).toHaveLength(2);
        for (const rule of rules) {
          expect(rule.attributes.showDropDown).toBe("0");
          expect(formula(rule)).toMatch(/^_folio_options_draft_/u);
        }
        const helper = workbook.parse("xl/worksheets/sheet2.xml");
        expect(
          descendants(helper, "sheetProtection")[0]?.attributes.sheet
        ).toBe("1");
        const actualOptions =
          stage === "draft" ? options : [...options, "new,choice"];
        const specialRule = rules.find(
          (rule) =>
            (
              rule.attributes.sqref ?? descendants(rule, "sqref")[0]?.text
            )?.replaceAll("$", "") === "A1"
        );
        const otherRule = rules.find((rule) => rule !== specialRule);
        const specialReference = workbook.names[formula(specialRule) ?? ""];
        const column = specialReference?.match(/!\$(?<column>[A-Z]+)\$/u)
          ?.groups?.column;
        expect(column).toBeDefined();
        expect(
          actualOptions.map((_, index) =>
            cellText(
              workbook,
              "xl/worksheets/sheet2.xml",
              `${column}${index + 2}`
            )
          )
        ).toEqual(actualOptions);
        const otherColumn = workbook.names[formula(otherRule) ?? ""]?.match(
          /!\$(?<column>[A-Z]+)\$/u
        )?.groups?.column;
        expect(
          cellText(workbook, "xl/worksheets/sheet2.xml", `${otherColumn}2`)
        ).toBe("other,one");
        expect(cellText(workbook, "xl/worksheets/sheet1.xml", "Z1")).toBe(
          "Form"
        );
        if (stage === "reopened") {
          expect(
            JSON.parse(
              cellText(workbook, "xl/worksheets/sheet1.xml", "Z2") ?? "null"
            )
          ).toEqual(actualOptions);
        }
      }
    }, 120_000);

    test("installs a numeric formula and resets only its managed date mask", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope = {};
Api.AddDefName("folio_date", "'Form'!$A$1", false);
Api.AddDefName("folio_text", "'Form'!$B$1", false);
Api.AddDefName("folio_custom", "'Form'!$C$1", false);
sheet.GetRange("C1").SetNumberFormat("#,##0.00");
sheet.GetRange("A1").SetBold(true);
${command({ anchor: "folio_date", type: "date" })}
${command({ anchor: "folio_text", type: "date" })}
${command({ anchor: "folio_date", type: "number" })}
${command({ anchor: "folio_text", type: "text" })}
${command({ anchor: "folio_custom", type: "number" })}
sheet.GetRange("A1").SetValue(123); sheet.GetRange("B1").SetValue(123);
sheet.GetRange("A1").Select();
var rule = sheet.GetRange("A1").GetValidation().validations[0];
var acceptsNumber = rule.checkValue(sheet.worksheet.getCell3(0, 0), sheet.worksheet);
sheet.GetRange("A1").SetValue("wrong");
var rejectsText = !rule.checkValue(sheet.worksheet.getCell3(0, 0), sheet.worksheet);
sheet.GetRange("A1").SetValue(123);
sheet.GetRange("Z2").SetValue(JSON.stringify([acceptsNumber, rejectsText]));
sheet.GetRange("Z1").SetValue(JSON.stringify([sheet.GetRange("A1").GetNumberFormat(), sheet.GetRange("B1").GetNumberFormat(), sheet.GetRange("C1").GetNumberFormat()]));
builder.SaveFile("xlsx", "/work/numeric.xlsx"); builder.CloseFile();`);
      const workbook = workbookXml(await runtime.read("numeric.xlsx"));
      const rules = descendants(workbook.sheet, "dataValidation");
      expect(rules).toHaveLength(2);
      expect(rules.map((rule) => formula(rule)).toSorted()).toEqual([
        "ISNUMBER(A1)",
        "ISNUMBER(C1)",
      ]);
      expect(
        JSON.parse(
          cellText(workbook, "xl/worksheets/sheet1.xml", "Z1") ?? "null"
        )
      ).toEqual(["General", "General", "#,##0.00"]);
      const styles = workbook.parse("xl/styles.xml");
      const xfs = descendants(styles, "cellXfs")[0]?.children ?? [];
      const fonts = descendants(styles, "fonts")[0]?.children ?? [];
      const font =
        fonts[
          Number(xfs[Number(workbook.cell("A1").style)]?.attributes.fontId)
        ];
      expect(font && descendants(font, "b")).toHaveLength(1);
      expect(
        JSON.parse(
          cellText(workbook, "xl/worksheets/sheet1.xml", "Z2") ?? "null"
        )
      ).toEqual([true, true]);
    }, 120_000);

    test("restores mixed table rules, formats and selected names while leaving adjacent fields intact", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope = {};
Api.AddDefName("folio_table", "'Form'!$A$2:$B$4", false);
Api.AddDefName("folio_column", "'Form'!$B$2:$B$4", false);
Api.AddDefName("folio_other", "'Form'!$D$2", false);
${command({ anchor: "folio_table", offset: 0, type: "number" })}
${command({ anchor: "folio_table", offset: 1, type: "date" })}
${command({ anchor: "folio_other", options: ["keep", "unchanged"], type: "dropdown" })}
sheet.GetRange("A3").SetNumberFormat("0.000");
sheet.GetRange("D20").Select();
Asc.scope.folioSpreadsheetValidation = {anchor:"folio_table",extraAnchorNames:["folio_column"],removeAnchor:true};
var snapshot = ${scoped(spreadsheetCaptureValidationCommand)};
${scoped(spreadsheetClearValidationCommand)};
builder.SaveFile("xlsx", "/work/cleared-table.xlsx");
Asc.scope.folioSpreadsheetValidationSnapshot = snapshot;
${scoped(spreadsheetRestoreValidationCommand)};
builder.SaveFile("xlsx", "/work/restored-table.xlsx"); builder.CloseFile();`);
      const cleared = workbookXml(await runtime.read("cleared-table.xlsx"));
      expect(cleared.names.folio_table).toBeUndefined();
      expect(cleared.names.folio_column).toBeUndefined();
      expect(descendants(cleared.sheet, "dataValidation")).toHaveLength(1);
      const restored = workbookXml(await runtime.read("restored-table.xlsx"));
      expect(restored.names.folio_table).toBe("Form!$A$2:$B$4");
      expect(restored.names.folio_column).toBe("Form!$B$2:$B$4");
      expect(restored.names.folio_other).toBe("Form!$D$2");
      expect(
        descendants(restored.sheet, "dataValidation")
          .map((rule) => formula(rule))
          .toSorted()
      ).toEqual(['"keep,unchanged"', "0", "ISNUMBER(A2)"]);
      expect(restored.cell("A3").style).not.toBe(restored.cell("A2").style);
    }, 120_000);

    test("rolls back new anchors and helper-backed list edits without changing other lists", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope = {};
Api.AddDefName("folio_existing", "'Form'!$A$1", false);
Api.AddDefName("folio_other", "'Form'!$B$1", false);
${command({ anchor: "folio_existing", options: ["old,one", "old,two"], type: "dropdown" })}
${command({ anchor: "folio_other", options: ["other,one", "other,two"], type: "dropdown" })}
Asc.scope.folioSpreadsheetValidation = {anchor:"folio_existing"};
var existingSnapshot = ${scoped(spreadsheetCaptureValidationCommand)};
${command({ anchor: "folio_existing", options: ["new,one", "new,two"], type: "dropdown" })}
Asc.scope.folioSpreadsheetValidationSnapshot = existingSnapshot;
${scoped(spreadsheetRestoreValidationCommand)};
Asc.scope.folioSpreadsheetValidation = {anchor:"folio_new",sheet:"Form",address:"C1"};
var newSnapshot = ${scoped(spreadsheetCaptureValidationCommand)};
Api.AddDefName("folio_new", "'Form'!$C$1", false);
${command({ anchor: "folio_new", type: "date" })}
Asc.scope.folioSpreadsheetValidationSnapshot = newSnapshot;
${scoped(spreadsheetRestoreValidationCommand)};
builder.SaveFile("xlsx", "/work/rollback-list.xlsx"); builder.CloseFile();`);
      const workbook = workbookXml(await runtime.read("rollback-list.xlsx"));
      expect(workbook.names.folio_new).toBeUndefined();
      const rules = descendants(workbook.sheet, "dataValidation");
      expect(rules).toHaveLength(2);
      expect(rules.map((rule) => formula(rule)).toSorted()).toEqual([
        "_folio_options_draft_1",
        "_folio_options_draft_2",
      ]);
      expect(cellText(workbook, "xl/worksheets/sheet2.xml", "A2")).toBe(
        "old,one"
      );
      expect(cellText(workbook, "xl/worksheets/sheet2.xml", "B2")).toBe(
        "other,one"
      );
    }, 120_000);

    test("retains the old native rule if Add rejects a replacement", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope = {};
Api.AddDefName("folio_existing", "'Form'!$A$1", false);
${command({ anchor: "folio_existing", options: ["old", "choice"], type: "dropdown" })}
var originalGetDefName = Api.GetDefName;
var heldName = Api.GetDefName("folio_existing");
var heldRange = heldName.GetRefersToRange();
heldRange.GetValidation().Add = function() { return null; };
Api.GetDefName = function(name) { return name === "folio_existing" ? {GetRefersToRange:function(){return heldRange;}} : originalGetDefName.call(Api,name); };
var rejected = false;
try {
${command({ anchor: "folio_existing", type: "number" })}
} catch (error) { rejected = true; }
Api.GetDefName = originalGetDefName;
sheet.GetRange("Z1").SetValue(rejected ? "rejected" : "unexpected success");
builder.SaveFile("xlsx", "/work/rejected-validation.xlsx"); builder.CloseFile();`);
      const workbook = workbookXml(
        await runtime.read("rejected-validation.xlsx")
      );
      const rules = descendants(workbook.sheet, "dataValidation");
      expect(rules).toHaveLength(1);
      expect(formula(rules[0])).toBe('"old,choice"');
      expect(cellText(workbook, "xl/worksheets/sheet1.xml", "Z1")).toBe(
        "rejected"
      );
    }, 120_000);

    test("restores only a partial rule intersection and safely removes and restores broken names", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope = {};
Api.AddDefName("folio_entire", "'Form'!$A$2:$A$4", false);
Api.AddDefName("folio_partial", "'Form'!$A$3", false);
Api.AddDefName("folio_broken", "'Form'!$B$1", false);
${command({ anchor: "folio_entire", type: "number" })}
sheet.GetRange("Z20").Select();
Asc.scope.folioSpreadsheetValidation = {anchor:"folio_partial",removeAnchor:true};
var snapshot = ${scoped(spreadsheetCaptureValidationCommand)};
${scoped(spreadsheetClearValidationCommand)};
builder.SaveFile("xlsx", "/work/partial-cleared.xlsx");
Asc.scope.folioSpreadsheetValidationSnapshot = snapshot;
${scoped(spreadsheetRestoreValidationCommand)};
Api.GetDefName("folio_broken").SetRefersTo("#REF!");
Asc.scope.folioSpreadsheetValidation = {anchor:"folio_broken",removeAnchor:true};
var brokenSnapshot = ${scoped(spreadsheetCaptureValidationCommand)};
${scoped(spreadsheetClearValidationCommand)};
sheet.GetRange("Z1").SetValue(brokenSnapshot);
Asc.scope.folioSpreadsheetValidationSnapshot = brokenSnapshot;
${scoped(spreadsheetRestoreValidationCommand)};
Asc.scope.folioSpreadsheetValidation = {anchor:"folio_missing",removeAnchor:true};
sheet.GetRange("Z2").SetValue(${scoped(spreadsheetCaptureValidationCommand)});
${scoped(spreadsheetClearValidationCommand)};
builder.SaveFile("xlsx", "/work/partial-and-broken.xlsx"); builder.CloseFile();`);
      const workbook = workbookXml(
        await runtime.read("partial-and-broken.xlsx")
      );
      const cleared = workbookXml(await runtime.read("partial-cleared.xlsx"));
      const remaining = descendants(cleared.sheet, "dataValidation");
      expect(remaining).toHaveLength(1);
      const remainingAddress =
        remaining[0]?.attributes.sqref ??
        (remaining[0] && descendants(remaining[0], "sqref")[0]?.text);
      expect(remainingAddress?.replaceAll("$", "")).toBe("A2 A4");
      expect(workbook.names.folio_broken).toBe("#REF!");
      expect(workbook.names.folio_partial).toBe("Form!$A$3");
      const broken = JSON.parse(
        cellText(workbook, "xl/worksheets/sheet1.xml", "Z1") ?? "null"
      );
      expect(broken.range).toBeNull();
      expect(broken.names).toEqual([
        { anchor: "folio_broken", reference: "#REF!" },
      ]);
      const missing = JSON.parse(
        cellText(workbook, "xl/worksheets/sheet1.xml", "Z2") ?? "null"
      );
      expect(missing.range).toBeNull();
      expect(missing.names).toEqual([
        { anchor: "folio_missing", reference: null },
      ]);
      const rules = descendants(workbook.sheet, "dataValidation");
      const partial = rules.find(
        (rule) =>
          (
            rule.attributes.sqref ?? descendants(rule, "sqref")[0]?.text
          )?.replaceAll("$", "") === "A3"
      );
      expect(formula(partial)).toBe("ISNUMBER(A3)");
      expect(rules).toHaveLength(2);
    }, 120_000);

    test("leaves the old dropdown intact when the helper reaches its capacity", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form"); Asc.scope = {};
Api.AddDefName("folio_existing", "'Form'!$A$1", false);
${command({ anchor: "folio_existing", options: ["old", "choice"], type: "dropdown" })}
var helper = Api.AddSheet("_folio_options");
helper.GetRange("XFD1").SetValue("reserved"); sheet.SetActive();
var rejected = false;
try {
${command({ anchor: "folio_existing", options: ["new,one", "new,two"], type: "dropdown" })}
} catch (error) { rejected = true; }
sheet.GetRange("Z1").SetValue(JSON.stringify([rejected,Api.GetActiveSheet().GetName(),helper.GetVisible(),helper.worksheet.getSheetProtection()]));
builder.SaveFile("xlsx", "/work/full-helper.xlsx"); builder.CloseFile();`);
      const workbook = workbookXml(await runtime.read("full-helper.xlsx"));
      const rules = descendants(workbook.sheet, "dataValidation");
      expect(rules).toHaveLength(1);
      expect(formula(rules[0])).toBe('"old,choice"');
      expect(
        JSON.parse(
          cellText(workbook, "xl/worksheets/sheet1.xml", "Z1") ?? "null"
        )
      ).toEqual([true, "Form", false, true]);
    }, 120_000);
  }
);
