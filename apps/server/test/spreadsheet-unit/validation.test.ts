import { describe, expect, test } from "bun:test";

import { applySpreadsheetValidation } from "../../src/documents/spreadsheets/validation";
import { readSpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import {
  descendants,
  workbookXml,
} from "../spreadsheet-runtime/runtime-fixture";
import { fixtureBindings, fixtureWorkbook, mutatePart } from "./fixture";

describe("authoritative spreadsheet validation", () => {
  test("stores full dropdown values on a protected hidden helper and maps only the editable sheet", () => {
    const bindings = fixtureBindings();
    const [agency] = bindings.fields;
    if (!agency) {
      throw new Error("Missing fixture field");
    }
    agency.type = "dropdown";
    agency.options = [
      "Comma, in value",
      "Semi;colon",
      'Quote " and & < >',
      ...Array.from({ length: 300 }, (_, index) => `ตัวเลือก ${index}`),
    ];
    const bytes = applySpreadsheetValidation(fixtureWorkbook(), bindings);
    const actual = workbookXml(bytes);
    expect(readSpreadsheetWorkbook(bytes).sheet).toBe("Form");
    const helper = descendants(actual.parse("xl/workbook.xml"), "sheet").find(
      (sheet) => sheet.attributes.name === "_folio_options"
    );
    expect(helper?.attributes.state).toBe("veryHidden");
    const helperXml = actual.parse("xl/worksheets/folio-options.xml");
    expect(descendants(helperXml, "t").map((text) => text.text)).toEqual([
      ...agency.options,
      "TRUE",
      "FALSE",
    ]);
    expect(descendants(helperXml, "sheetProtection")[0]?.attributes.sheet).toBe(
      "1"
    );
    const [formats] = descendants(actual.parse("xl/styles.xml"), "cellXfs");
    const styles = formats ? descendants(formats, "xf") : [];
    expect(
      descendants(helperXml, "c").every((cell) => {
        const style = styles[Number(cell.attributes.s)];
        return (
          style &&
          descendants(style, "protection")[0]?.attributes.locked === "1"
        );
      })
    ).toBe(true);
    const validation = descendants(actual.sheet, "dataValidation");
    const list = validation.find((rule) => rule.attributes.sqref === "A1:B1");
    expect(list?.attributes.type).toBe("list");
    const listName = list ? descendants(list, "formula1")[0]?.text : undefined;
    expect(listName).toMatch(/^_folio_options_/u);
    expect(actual.names[listName ?? ""]).toBe("'_folio_options'!$A$1:$A$303");
    expect(
      validation.find((rule) => rule.attributes.sqref === "A4:A8")?.attributes
        .type
    ).toBe("custom");
    expect(
      validation.find((rule) => rule.attributes.sqref === "D1:D1")?.attributes
        .type
    ).toBe("date");
  });
  test("a placeholder adds an Excel input message, including for plain text fields", () => {
    const bindings = fixtureBindings();
    const [agency, date] = bindings.fields;
    if (!agency || !date) {
      throw new Error("Missing fixture field");
    }
    agency.placeholder = "e.g. Department of Something";
    date.placeholder = "dd/mm/yyyy";
    const bytes = applySpreadsheetValidation(fixtureWorkbook(), bindings);
    const actual = workbookXml(bytes);
    const validation = descendants(actual.sheet, "dataValidation");
    const text = validation.find((rule) => rule.attributes.sqref === "A1:B1");
    expect(text?.attributes.type).toBeUndefined();
    expect(text?.attributes.showInputMessage).toBe("1");
    expect(text?.attributes.prompt).toBe(agency.placeholder);
    expect(text?.attributes.promptTitle).toBe(agency.label);
    const withDate = validation.find(
      (rule) => rule.attributes.sqref === "D1:D1"
    );
    expect(withDate?.attributes.type).toBe("date");
    expect(withDate?.attributes.prompt).toBe(date.placeholder);
    const [, plainDate] = fixtureBindings().fields;
    expect(plainDate?.placeholder).toBeNull();
    const noPlaceholder = applySpreadsheetValidation(
      fixtureWorkbook(),
      fixtureBindings()
    );
    const withoutPlaceholder = workbookXml(noPlaceholder);
    expect(
      descendants(withoutPlaceholder.sheet, "dataValidation").find(
        (rule) => rule.attributes.sqref === "A1:B1"
      )
    ).toBeUndefined();
  });
  test("only accepts the internal helper as a hidden standard worksheet", () => {
    const bytes = applySpreadsheetValidation(
      fixtureWorkbook(),
      fixtureBindings()
    );
    const hidden = mutatePart(bytes, "xl/workbook.xml", (xml) =>
      xml.replace('state="veryHidden"', 'state="hidden"')
    );
    expect(readSpreadsheetWorkbook(hidden).sheet).toBe("Form");
    const visible = mutatePart(bytes, "xl/workbook.xml", (xml) =>
      xml.replace('state="veryHidden"', 'state="visible"')
    );
    expect(() => readSpreadsheetWorkbook(visible)).toThrow();
    const foreign = mutatePart(bytes, "xl/workbook.xml", (xml) =>
      xml.replace('name="_folio_options"', 'name="foreign"')
    );
    expect(() => readSpreadsheetWorkbook(foreign)).toThrow();
    const unsafe = mutatePart(bytes, "xl/_rels/workbook.xml.rels", (xml) =>
      xml.replace(
        'Target="worksheets/folio-options.xml"',
        'Target="../folio-options.xml"'
      )
    );
    expect(() => readSpreadsheetWorkbook(unsafe)).toThrow();
  });
  test("rebuilds tampered validation and stale options from the contract without helper accumulation", () => {
    const bindings = fixtureBindings();
    const once = applySpreadsheetValidation(fixtureWorkbook(), bindings);
    const changed = mutatePart(once, "xl/worksheets/sheet1.xml", (xml) =>
      xml.replaceAll('showErrorMessage="1"', 'showErrorMessage="0"')
    );
    const twice = applySpreadsheetValidation(changed, bindings);
    const actual = workbookXml(twice);
    expect(descendants(actual.parse("xl/workbook.xml"), "sheet")).toHaveLength(
      2
    );
    expect(
      descendants(actual.sheet, "dataValidation").every(
        (rule) => rule.attributes.showErrorMessage === "1"
      )
    ).toBe(true);
    expect(
      descendants(actual.parse("xl/worksheets/folio-options.xml"), "t").map(
        (text) => text.text
      )
    ).toEqual(["TRUE", "FALSE"]);
  });
});
