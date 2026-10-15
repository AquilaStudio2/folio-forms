import { describe, expect, test } from "bun:test";

import { parseSpreadsheetRange } from "../../src/documents/spreadsheets/contract";
import {
  prepareSpreadsheetRowFormulas,
  rewriteSpreadsheetAggregates,
} from "../../src/documents/spreadsheets/formula-bindings";
import { workbookXml } from "../spreadsheet-runtime/runtime-fixture";
import { fixtureWorkbook, mutatePart } from "./fixture";

const body = parseSpreadsheetRange("Form!A4:C5");
const named = (first: number, last: number) => `_test_${first}_${last}`;

describe("full-body aggregate bindings", () => {
  test("tokenizes absolute references, spaces, nested functions and repeated aggregate arguments", () => {
    expect(
      rewriteSpreadsheetAggregates(
        'IF(TRUE,SUM( $C$4 : C$5 ),SUMIF(A4:A5,">0",C4:C5))+AVERAGE(B4:C5)',
        body,
        named
      )
    ).toBe(
      'IF(TRUE,SUM( _test_2_2 ),SUMIF(_test_0_0,">0",_test_2_2))+AVERAGE(_test_1_2)'
    );
  });
  test("does not rewrite quoted text, qualified names, partial ranges, or scalar arithmetic", () => {
    const formula =
      'IF(A1="SUM(C4:C5) ""C4:C5""",SUM(C4:C6),C4)+SUM(\'Form\'!C4:C5)+SUM(Table1[C4:C5])+INDEX(C4:C5,1)';
    expect(rewriteSpreadsheetAggregates(formula, body, named)).toBe(formula);
  });
  test("binds nested groups, arithmetic and nested conditionals throughout aggregates", () => {
    expect(
      rewriteSpreadsheetAggregates(
        "SUM((C4:C5))+SUM(C4:C5*2)+SUM(IF(C4:C5>0,C4:C5,0))+SUMPRODUCT((A4:A5+B4:B5)*C4:C5)",
        body,
        named
      )
    ).toBe(
      "SUM((_test_2_2))+SUM(_test_2_2*2)+SUM(IF(_test_2_2>0,_test_2_2,0))+SUMPRODUCT((_test_0_0+_test_1_1)*_test_2_2)"
    );
  });
  test("singleton SUM(C4) and SUM(C4:C4) expand, while per-row formulas remain per-row", () => {
    const single = parseSpreadsheetRange("Form!A4:C4");
    expect(
      rewriteSpreadsheetAggregates(
        "SUM(C4)+SUM($C$4:$C$4)+SUM((C4*2))+C4",
        single,
        named
      )
    ).toBe("SUM(_test_2_2)+SUM(_test_2_2)+SUM((_test_2_2*2))+C4");
    const source = fixtureWorkbook({
      cells: [
        { address: "A4", value: 2 },
        { address: "C4", formula: "SUM(A4:B4)", value: 2 },
        { address: "C5", formula: "SUM(C4)", value: 2 },
      ],
      merges: [],
      names: { folio_body: "Form!A4:C4" },
    });
    const prepared = prepareSpreadsheetRowFormulas(source, {
      action: "insert",
      bodyName: "folio_body",
      index: 1,
      inputColumns: [0, 1],
    });
    const actual = workbookXml(prepared.workbook);
    expect(actual.cell("C4").formula).toBe("SUM(A4:B4)");
    expect(actual.cell("C5").formula).toMatch(
      /^SUM\(_folio_dyn_[a-f0-9]{16}_2_2\)$/u
    );
    expect(prepared.formulaBindings).toHaveLength(1);
    expect(
      prepareSpreadsheetRowFormulas(prepared.workbook, {
        action: "insert",
        bodyName: "folio_body",
        index: 1,
        inputColumns: [0, 1],
      }).formulaBindings
    ).toEqual(prepared.formulaBindings);
    const helper = prepared.formulaBindings[0]?.name;
    if (!helper) {
      throw new Error("Missing internal binding");
    }
    for (const name of [helper, helper.toUpperCase()]) {
      const colliding = mutatePart(
        prepared.workbook,
        "xl/workbook.xml",
        (xml) =>
          xml.replace(
            "</definedNames>",
            `<definedName name="${name}">Form!A4</definedName></definedNames>`
          )
      );
      expect(() =>
        prepareSpreadsheetRowFormulas(colliding, {
          action: "insert",
          bodyName: "folio_body",
          index: 1,
          inputColumns: [0, 1],
        })
      ).toThrow("internal formula binding name collides");
    }
  });
});
