// oxlint-disable no-await-in-loop -- Reopen each saved workbook in order using the shared runtime.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  descendants,
  SpreadsheetRuntime,
  workbookXml,
} from "./runtime-fixture";

const runtime = new SpreadsheetRuntime();
const commandsUrl = new URL(
  "../../../onlyoffice-plugin/src/spreadsheet-commands.js",
  import.meta.url
);
const { spreadsheetValidationCommand } = (await import(commandsUrl.href)) as {
  spreadsheetValidationCommand: () => boolean;
};

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "spreadsheet dropdown editing in ONLYOFFICE 9.4",
  () => {
    beforeAll(() => runtime.start(), 120_000);
    afterAll(() => runtime.stop(), 120_000);

    for (const { column, options, added, language } of [
      {
        added: "test_4",
        column: false,
        language: "ascii",
        options: ["test_1", "test_2", "test_3"],
      },
      {
        added: "test_4",
        column: true,
        language: "ascii",
        options: ["test_1", "test_2", "test_3"],
      },
      {
        added: "อื่นๆ",
        column: false,
        language: "Thai",
        options: ["ชาย", "หญิง"],
      },
      { added: "อื่นๆ", column: true, language: "Thai", options: ["ชาย", "หญิง"] },
    ]) {
      test(`preserves ${language} dropdown choices after saving, reopening and extending a ${column ? "table column" : "field"}`, async () => {
        const prefix = `${language}-${column ? "column" : "field"}`;
        const input = {
          anchor: "folio_dropdown",
          options: [...options],
          type: "dropdown",
          ...(column ? { offset: 1 } : {}),
        };
        const update = () =>
          `Asc.scope = {folioSpreadsheetValidation: ${JSON.stringify(input)}};
(${spreadsheetValidationCommand.toString()})();`;
        await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet();
sheet.SetName("Form");
Api.AddDefName("folio_dropdown", "'Form'!${column ? "$D$4:$E$5" : "$A$1"}", false);
${update()}
builder.SaveFile("xlsx", "/work/${prefix}-draft.xlsx");
builder.CloseFile();`);

        input.options.push(added);
        await runtime.run(`builder.OpenFile("/work/${prefix}-draft.xlsx");
${update()}
builder.SaveFile("xlsx", "/work/${prefix}-updated.xlsx");
builder.CloseFile();`);
        await runtime.runJob(`${prefix}-updated.xlsx`, {
          outputName: `${prefix}-reopened.xlsx`,
        });

        for (const stage of ["draft", "updated", "reopened"]) {
          const workbook = workbookXml(
            await runtime.read(`${prefix}-${stage}.xlsx`)
          );
          const rules = descendants(workbook.sheet, "dataValidation");
          expect(rules).toHaveLength(1);
          const [rule] = rules;
          if (!rule) {
            throw new Error("Saved dropdown validation is missing");
          }
          expect(rule.attributes.type).toBe("list");
          expect(rule.attributes.showDropDown).toBe("0");
          const formula =
            descendants(rule, "f")[0]?.text ??
            descendants(rule, "formula1")[0]?.text;
          const expectedOptions =
            stage === "draft" ? options : [...options, added];
          expect(formula).toBe(`"${expectedOptions.join(",")}"`);
          const address =
            rule.attributes.sqref ?? descendants(rule, "sqref")[0]?.text;
          expect(address?.replaceAll("$", "")).toBe(column ? "E4:E5" : "A1");
        }
      }, 120_000);
    }
  }
);
