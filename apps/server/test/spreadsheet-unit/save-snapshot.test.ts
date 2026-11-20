import { expect, test } from "bun:test";

import { spreadsheetBindingAnchors } from "../../src/documents/spreadsheets/columns";
import {
  spreadsheetAnchorSnapshotSchema,
  validateSpreadsheetSaveSnapshot,
} from "../../src/documents/spreadsheets/save-snapshot";
import type { SpreadsheetAnchorSnapshot } from "../../src/documents/spreadsheets/save-snapshot";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import { fixtureBindings, fixtureWorkbook } from "./fixture";

const snapshot: SpreadsheetAnchorSnapshot = [
  ["folio_agency", "='Form'!$A$1:$B$1"],
  ["folio_date", "Form!D1:D1"],
  ["folio_body", "Form!A4:D8"],
];

test("saved Excel preserves the frozen editor's fields and table across reopening", () => {
  expect(() =>
    validateSpreadsheetSaveSnapshot(
      snapshot,
      fixtureBindings(),
      readSpreadsheetWorkbook(fixtureWorkbook())
    )
  ).not.toThrow();
});

test("a stale file missing or moving a live anchor cannot report a successful save", () => {
  const variants: Record<string, string>[] = [
    { folio_body: "Form!A4:D8", folio_date: "Form!D1" },
    {
      folio_agency: "Form!B2:C2",
      folio_body: "Form!A4:D8",
      folio_date: "Form!D1",
    },
    {
      folio_agency: "Form!A1:B1",
      folio_body: "Form!A4:D7",
      folio_date: "Form!D1",
    },
  ];
  for (const names of variants) {
    expect(() =>
      validateSpreadsheetSaveSnapshot(
        snapshot,
        fixtureBindings(),
        readSpreadsheetWorkbook(fixtureWorkbook({ names }))
      )
    ).toThrow("ไฟล์ Excel ที่ได้รับยังไม่ตรง");
  }
});

test("unfinished draft positions can remain missing without losing configured fields", () => {
  const incomplete: SpreadsheetAnchorSnapshot = [
    ["folio_agency", null],
    ["folio_date", null],
    ["folio_body", null],
  ];
  expect(() =>
    validateSpreadsheetSaveSnapshot(
      incomplete,
      fixtureBindings(),
      readSpreadsheetWorkbook(fixtureWorkbook({ names: {} }))
    )
  ).not.toThrow();
  expect(() =>
    validateSpreadsheetSaveSnapshot(
      incomplete,
      fixtureBindings(),
      readSpreadsheetWorkbook(fixtureWorkbook())
    )
  ).toThrow("ไฟล์ Excel ที่ได้รับยังไม่ตรง");
});

test("snapshot must cover exactly the current configuration with valid references", () => {
  for (const invalid of [
    snapshot.slice(1),
    [...snapshot, ...snapshot],
    [...snapshot, ["folio_unknown", null] as [string, null]],
    snapshot.map(([anchor]) => [anchor, "#REF!"] as [string, string]),
  ]) {
    expect(() =>
      validateSpreadsheetSaveSnapshot(
        invalid,
        fixtureBindings(),
        readSpreadsheetWorkbook(fixtureWorkbook())
      )
    ).toThrow();
  }
  expect(
    spreadsheetAnchorSnapshotSchema.safeParse([["folio_a", {}]]).success
  ).toBe(false);
});

test("the versioned snapshot proves every tracking name absent on an unbound table with columns", () => {
  const bindings = fixtureBindings();
  if (!bindings.table) {
    throw new Error("Missing fixture table");
  }
  bindings.table.unbound = true;
  const workbook = readSpreadsheetWorkbook(fixtureWorkbook({ names: {} }));
  const anchors: SpreadsheetAnchorSnapshot = spreadsheetBindingAnchors(
    bindings
  ).map((anchor) => [anchor, null]);
  expect(() =>
    validateSpreadsheetSaveSnapshot(anchors, bindings, workbook)
  ).not.toThrow();
  expect(() =>
    validateSpreadsheetSaveSnapshot(
      snapshot.map(([anchor]) => [anchor, null]),
      bindings,
      workbook
    )
  ).toThrow();
});

test("placed empty table has valid Draft geometry but cannot publish", () => {
  const bindings = fixtureBindings();
  if (!bindings.table) {
    throw new Error("Missing fixture table");
  }
  bindings.table.columns = [];
  const workbook = readSpreadsheetWorkbook(fixtureWorkbook());
  expect(
    resolveSpreadsheetContract(bindings, workbook, true).locations.folio_body
  ).toMatchObject({
    firstRow: 3,
    lastRow: 7,
  });
  expect(() => resolveSpreadsheetContract(bindings, workbook)).toThrow(
    "A table needs at least one input column"
  );
});
