import { describe, expect, test } from "bun:test";

import {
  spreadsheetBindingSchema,
  parseSpreadsheetRange,
  spreadsheetCellPosition,
  spreadsheetColumnName,
} from "../../src/documents/spreadsheets/contract";
import {
  extractSpreadsheetData,
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import { fixtureBindings, fixtureWorkbook, mutatePart } from "./fixture";

const load = (bytes = fixtureWorkbook(), bindings = fixtureBindings()) => {
  const workbook = readSpreadsheetWorkbook(bytes);
  return { contract: resolveSpreadsheetContract(bindings, workbook), workbook };
};

describe("spreadsheet contract and authoritative XLSX extraction", () => {
  test("reads sparse rows past gaps and retains meaningful zero/false but excludes formula-only rows", () => {
    const { workbook, contract } = load();
    expect(extractSpreadsheetData(workbook, contract, true)).toEqual({
      data: {
        activities: [
          { active: false, note: "First", quantity: 0, total: 0 },
          { active: true, note: "Last", quantity: 4, total: 8 },
        ],
        agency: "Agency",
        date: "1900-03-01",
      },
      errors: [],
    });
  });

  test("draft extraction returns partial data and invalid-cell diagnostics; submit adds missing required diagnostics", () => {
    const { workbook, contract } = load(
      fixtureWorkbook({
        cells: [
          { address: "A4", value: "not a number" },
          { address: "B4", value: false },
          { address: "D4", formula: "A4*2", type: "e", value: "#VALUE!" },
        ],
      })
    );
    const draft = extractSpreadsheetData(workbook, contract, false);
    expect(draft.data.activities).toEqual([
      { active: false, note: null, quantity: null, total: null },
    ]);
    expect(draft.errors.map((error) => error.address)).toEqual(["A4", "D4"]);
    expect(
      extractSpreadsheetData(workbook, contract, true).errors.map(
        (error) => error.address
      )
    ).toEqual(["A1", "A4", "C4", "D4"]);
  });

  for (const [date1904, serial, expected] of [
    [false, 1, "1900-01-01"],
    [false, 59, "1900-02-28"],
    [false, 61, "1900-03-01"],
    [true, 0, "1904-01-01"],
    [true, 1, "1904-01-02"],
  ] as const) {
    test(`date system ${date1904 ? 1904 : 1900} serial ${serial}`, () => {
      const { workbook, contract } = load(
        fixtureWorkbook({ cells: [{ address: "D1", value: serial }], date1904 })
      );
      expect(extractSpreadsheetData(workbook, contract, false).data.date).toBe(
        expected
      );
    });
  }
  test("rejects Excel's fictitious leap day and invalid calendar strings", () => {
    for (const value of [60, "2026-02-30", "not-a-date"]) {
      const { workbook, contract } = load(
        fixtureWorkbook({ cells: [{ address: "D1", value }] })
      );
      expect(
        extractSpreadsheetData(workbook, contract, false).errors[0]?.address
      ).toBe("D1");
    }
  });

  test("decodes shared and inline strings while using only merged scalar's anchor", () => {
    const { workbook, contract } = load(
      fixtureWorkbook({
        cells: [
          { address: "A1", type: "s", value: 0 },
          { address: "B1", value: "should not become another value" },
        ],
        sharedStrings: ["Thai & English"],
      })
    );
    expect(extractSpreadsheetData(workbook, contract, false).data.agency).toBe(
      "Thai & English"
    );
  });

  test("computed field with missing cache returns a diagnostic instead of silently dropping data", () => {
    const { workbook, contract } = load(
      fixtureWorkbook({
        cells: [
          { address: "A4", value: 1 },
          { address: "D4", formula: "A4*2" },
        ],
      })
    );
    expect(
      extractSpreadsheetData(workbook, contract, false).errors.some(
        (error) => error.address === "D4"
      )
    ).toBe(true);
  });

  test("a cached empty formula result stays empty while a removed computed formula is diagnosed", () => {
    const blank = load(
      fixtureWorkbook({
        cells: [
          { address: "A4", value: 1 },
          {
            address: "D4",
            formula: 'IF(A4=1,"",A4*2)',
            type: "str",
            value: "",
          },
        ],
      })
    );
    const result = extractSpreadsheetData(
      blank.workbook,
      blank.contract,
      false
    );
    expect(result.errors.filter((error) => error.address === "D4")).toEqual([]);
    expect(result.data.activities).toEqual([
      { active: null, note: null, quantity: 1, total: null },
    ]);
    const removed = load(
      fixtureWorkbook({ cells: [{ address: "A4", value: 1 }] })
    );
    expect(
      extractSpreadsheetData(
        removed.workbook,
        removed.contract,
        false
      ).errors.some((error) => error.address === "D4")
    ).toBe(true);
  });

  test("validates binding geometry, complete merged rectangles, overlap and column bounds", () => {
    const variants = [
      {
        folio_agency: "Form!A1",
        folio_body: "Form!A4:D8",
        folio_date: "Form!D1",
      },
      {
        folio_agency: "Form!A1:C1",
        folio_body: "Form!A4:D8",
        folio_date: "Form!D1",
      },
      {
        folio_agency: "Form!A1:B1",
        folio_body: "Form!A4:D8",
        folio_date: "Form!A4",
      },
      {
        folio_agency: "Form!A1:B1",
        folio_body: "Form!A4:C8",
        folio_date: "Form!D1",
      },
    ];
    for (const names of variants) {
      expect(() => load(fixtureWorkbook({ names }))).toThrow();
    }
    expect(() => load(fixtureWorkbook({ merges: ["A1:B1", "A4:A5"] }))).toThrow(
      "Merged cells"
    );
    expect(() =>
      load(
        fixtureWorkbook({
          names: { folio_agency: "Form!A1:B1", folio_date: "Form!D1" },
        })
      )
    ).toThrow("Missing field binding");
  });

  test("rejects duplicate keys/identities, unknown fields, reserved keys and computed prefill", () => {
    for (const change of [
      (value: ReturnType<typeof fixtureBindings>) => {
        const [, field] = value.fields;
        if (!field) {
          throw new Error("Missing fixture field");
        }
        field.key = "agency";
      },
      (value: ReturnType<typeof fixtureBindings>) => {
        const [field] = value.fields;
        if (!field) {
          throw new Error("Missing fixture field");
        }
        field.key = "__proto__";
      },
      (value: ReturnType<typeof fixtureBindings>) => {
        const [field] = value.fields;
        if (!field) {
          throw new Error("Missing fixture field");
        }
        field.computed = true;
        field.prefillPointer = "/name";
      },
      (value: ReturnType<typeof fixtureBindings>) => {
        const column = value.table?.columns[1];
        if (!column) {
          throw new Error("Missing fixture column");
        }
        column.offset = 0;
      },
    ]) {
      const value = fixtureBindings();
      change(value);
      expect(spreadsheetBindingSchema.safeParse(value).success).toBe(false);
    }
    expect(
      spreadsheetBindingSchema.safeParse({
        ...fixtureBindings(),
        unexpected: true,
      }).success
    ).toBe(false);
  });

  test("uses zero-based coordinates, quoted sheet names and native format bounds", () => {
    expect(spreadsheetCellPosition("$D$10")).toEqual({ column: 3, row: 9 });
    expect(parseSpreadsheetRange("'O''Brien'!$D$10:$AE$1001")).toEqual({
      firstColumn: 3,
      firstRow: 9,
      lastColumn: 30,
      lastRow: 1000,
      sheet: "O'Brien",
    });
    expect(spreadsheetColumnName(16_383)).toBe("XFD");
    for (const ref of ["XFE1", "A1048577", "A0"]) {
      expect(() => spreadsheetCellPosition(ref)).toThrow();
    }
    expect(() => parseSpreadsheetRange("Form!B2:A1")).toThrow();
  });

  test("rejects malformed package bindings, duplicate cells and volatile/external formulas", () => {
    expect(() =>
      readSpreadsheetWorkbook(
        mutatePart(fixtureWorkbook(), "xl/worksheets/sheet1.xml", (xml) =>
          xml.replace('<row r="4">', '<row r="4"><c r="A4"><v>3</v></c>')
        )
      )
    ).toThrow();
    for (const formula of ["NOW()", "[external.xlsx]Sheet1!A1", "Other!A1"]) {
      expect(() =>
        readSpreadsheetWorkbook(
          fixtureWorkbook({ cells: [{ address: "A1", formula, value: 1 }] })
        )
      ).toThrow("Unsupported formula");
    }
    expect(() =>
      readSpreadsheetWorkbook(
        mutatePart(fixtureWorkbook(), "xl/workbook.xml", (xml) =>
          xml.replace(
            '<definedName name="folio_agency">',
            '<definedName name="folio_agency" localSheetId="0">'
          )
        )
      )
    ).toThrow();
  });
});
