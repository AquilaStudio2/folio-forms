import { describe, expect, test } from "bun:test";

import {
  protectSpreadsheet,
  spreadsheetInputRanges,
  unprotectSpreadsheet,
  validateSpreadsheetEdits,
} from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import type { SpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import {
  descendants,
  workbookXml,
} from "../spreadsheet-runtime/runtime-fixture";
import { fixtureBindings, fixtureWorkbook } from "./fixture";

const setup = () => {
  const bytes = fixtureWorkbook();
  const previous = readSpreadsheetWorkbook(bytes);
  const contract = resolveSpreadsheetContract(fixtureBindings(), previous);
  return { bytes, contract, previous };
};

const changed = (
  previous: SpreadsheetWorkbook,
  address: string,
  value: string | number | boolean | null,
  formula?: string | null
): SpreadsheetWorkbook => {
  const current = structuredClone(previous);
  const cell = current.cells.get(address);
  if (!cell) {
    throw new Error(`Fixture lacks ${address}`);
  }
  cell.value = value;
  if (formula !== undefined) {
    cell.formula = formula;
  }
  return current;
};

describe("spreadsheet input permissions and protected layout", () => {
  test("allows scalar and table input changes including zero, false and clearing", () => {
    const { previous, contract } = setup();
    for (const [address, value] of [
      ["A1", "New agency"],
      ["A4", 0],
      ["B4", false],
      ["C4", null],
    ] as const) {
      expect(() =>
        validateSpreadsheetEdits(
          previous,
          changed(previous, address, value),
          contract
        )
      ).not.toThrow();
    }
    const current = structuredClone(previous);
    current.cells.delete("C4");
    expect(() =>
      validateSpreadsheetEdits(previous, current, contract)
    ).not.toThrow();
  });

  test("rejects edits to locked Prefill, fixed labels and administrator formulas", () => {
    const { previous, contract } = setup();
    expect(() =>
      validateSpreadsheetEdits(
        previous,
        changed(previous, "A1", "Tampered"),
        contract,
        new Set(["agency"])
      )
    ).toThrow("A protected cell");
    expect(() =>
      validateSpreadsheetEdits(
        previous,
        changed(previous, "A3", "Tampered"),
        contract
      )
    ).toThrow("A protected cell");
    expect(() =>
      validateSpreadsheetEdits(
        previous,
        changed(previous, "D4", 999, "999"),
        contract
      )
    ).toThrow("A protected cell");
    expect(() =>
      validateSpreadsheetEdits(
        previous,
        changed(previous, "D4", 0, null),
        contract
      )
    ).toThrow("A protected cell");
    expect(() =>
      validateSpreadsheetEdits(
        previous,
        changed(previous, "A4", 2, "1+1"),
        contract
      )
    ).toThrow("Input cannot contain a formula");
  });

  test("allows recalculated formula caches but rejects added non-input content", () => {
    const { previous, contract } = setup();
    expect(() =>
      validateSpreadsheetEdits(previous, changed(previous, "D4", 8), contract)
    ).not.toThrow();
    const current = structuredClone(previous);
    current.cells.set("F9", {
      address: "F9",
      column: 5,
      formula: null,
      hasCachedValue: true,
      row: 8,
      style: 0,
      type: "inlineStr",
      value: "Injected",
    });
    expect(() => validateSpreadsheetEdits(previous, current, contract)).toThrow(
      "A protected cell"
    );
  });

  test("rejects renamed sheet, moved/missing named binding and changed merged geometry", () => {
    const { previous, contract } = setup();
    const renamed = structuredClone(previous);
    renamed.sheet = "Renamed";
    expect(() => validateSpreadsheetEdits(previous, renamed, contract)).toThrow(
      "worksheet structure"
    );
    const moved = structuredClone(previous);
    const range = moved.names.get("folio_body");
    if (!range) {
      throw new Error("Missing fixture binding");
    }
    range.firstRow += 1;
    expect(() => validateSpreadsheetEdits(previous, moved, contract)).toThrow(
      "field position"
    );
    const missing = structuredClone(previous);
    missing.names.delete("folio_body");
    expect(() => validateSpreadsheetEdits(previous, missing, contract)).toThrow(
      "field position"
    );
    const merged = structuredClone(previous);
    merged.merges = [];
    expect(() => validateSpreadsheetEdits(previous, merged, contract)).toThrow(
      "worksheet structure"
    );
  });

  test("writes real locked/unlocked cell styles and protects sheet/workbook structure", () => {
    const { bytes, contract } = setup();
    const protectedBytes = protectSpreadsheet(bytes, contract);
    const xml = workbookXml(protectedBytes);
    const xfs =
      descendants(xml.parse("xl/styles.xml"), "cellXfs")[0]?.children ?? [];
    const lock = (address: string) => {
      const style = xfs[Number(xml.cell(address).style ?? 0)];
      return style
        ? descendants(style, "protection")[0]?.attributes.locked
        : undefined;
    };
    for (const address of [
      "A1",
      "B1",
      "D1",
      "A4",
      "B4",
      "C4",
      "A8",
      "B8",
      "C8",
    ]) {
      expect(lock(address)).toBe("0");
    }
    for (const address of ["A3", "D4", "D5"]) {
      expect(lock(address)).toBe("1");
    }
    expect(
      xfs[0]?.children.find((child) => child.local === "protection")?.attributes
        .locked
    ).toBe("1");
    expect(xfs[Number(xml.cell("C4").style)]?.attributes.fontId).toBe("1");
    expect(
      descendants(xml.sheet, "sheetProtection")[0]?.attributes
    ).toMatchObject({
      deleteRows: "1",
      formatCells: "1",
      insertRows: "1",
      sheet: "1",
    });
    expect(
      descendants(xml.parse("xl/workbook.xml"), "workbookProtection")[0]
        ?.attributes.lockStructure
    ).toBe("1");
    expect(xml.cell("D4").formula).toBe("A4*2");
    expect(readSpreadsheetWorkbook(protectedBytes).cells.get("A1")?.value).toBe(
      "Agency"
    );
  });

  test("reprotecting with a Prefill lock relocks every cell of its merged area", () => {
    const { bytes, contract } = setup();
    const once = protectSpreadsheet(bytes, contract);
    const twice = protectSpreadsheet(once, contract, new Set(["agency"]));
    const xml = workbookXml(twice);
    const styles =
      descendants(xml.parse("xl/styles.xml"), "cellXfs")[0]?.children ?? [];
    for (const address of ["A1", "B1"]) {
      const style = styles[Number(xml.cell(address).style ?? 0)];
      expect(
        style
          ? descendants(style, "protection")[0]?.attributes.locked
          : undefined
      ).toBe("1");
    }
    expect(spreadsheetInputRanges(contract, new Set(["agency"]))).toHaveLength(
      4
    );
    const workerCopy = workbookXml(unprotectSpreadsheet(twice));
    expect(descendants(workerCopy.sheet, "sheetProtection")).toHaveLength(0);
    expect(workerCopy.cell("D4").formula).toBe("A4*2");
  });
});
