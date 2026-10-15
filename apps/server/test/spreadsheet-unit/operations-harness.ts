// Isolated process: no database or object storage is connected by this harness.
import { mock } from "bun:test";
import assert from "node:assert/strict";

import { protectSpreadsheet } from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import type {
  spreadsheetDraftFieldData as DraftFieldData,
  spreadsheetManifestFieldData as ManifestFieldData,
} from "../../src/forms/spreadsheet-fields";
import type { OperationMetadata } from "../../src/operations/model";
import {
  descendants,
  workbookXml,
} from "../spreadsheet-runtime/runtime-fixture";
import { fixtureBindings, fixtureWorkbook, mutatePart } from "./fixture";

const bindings = fixtureBindings();
const raw = fixtureWorkbook();
const state = resolveSpreadsheetContract(
  bindings,
  readSpreadsheetWorkbook(raw)
);
const base = protectSpreadsheet(raw, state);
let output = raw;
let savedBase = base;
let calls = 0;
let workerInput: Uint8Array | undefined;
let workerOptions: Record<string, unknown> = {};
let lockAgency = false;
const form = {
  documentKind: "xlsx",
  templateDraft: { bindingRevision: 2, id: "draft" },
};
let draftRows: ReturnType<typeof DraftFieldData> = [];
let manifestRows: ReturnType<typeof ManifestFieldData> = [];
mock.module("@onlyoffice/db", () => ({
  FieldType: {
    checkbox: "checkbox",
    date: "date",
    dropdown: "dropdown",
    number: "number",
    table: "table",
    text: "text",
  },
  Prisma: { DbNull: null },
  prisma: {
    correction: { findFirst: () => Promise.resolve(null) },
    draftFieldRule: { findMany: () => Promise.resolve(draftRows) },
    fieldManifest: {
      findUnique: () =>
        Promise.resolve({
          fields: manifestRows,
          publishedTemplate: { prefillConfiguration: null },
        }),
    },
    form: { findUnique: () => Promise.resolve(form) },
    publishedTemplate: {
      findUnique: () => Promise.resolve({ objectKey: "trusted.xlsx" }),
    },
    response: {
      findUnique: () =>
        Promise.resolve({
          draftObjectKey: "trusted.xlsx",
          prefillSnapshot: { lockedFields: lockAgency ? { agency: true } : {} },
          publishedTemplateId: "published",
        }),
    },
    submission: {
      findUnique: () => Promise.resolve({ objectKey: "trusted.xlsx" }),
    },
  },
}));
mock.module("../../src/operations/object-cleanup", () => ({
  drainObjectCleanupIntents: () => {
    throw new Error("Unexpected initialization cleanup");
  },
  objectCleanupIntentGraceMs: 900_000,
}));
mock.module("../../src/responses/data", () => ({
  jsonValue: (value: unknown) => value,
}));
mock.module("../../src/storage", () => ({
  deleteObject: () => {
    throw new Error("Unexpected storage delete");
  },
  objectKey: () => {
    throw new Error("Unexpected object allocation");
  },
  putObject: () => {
    throw new Error("Unexpected storage write");
  },
  readObject: (key: string) => {
    assert.equal(key, "trusted.xlsx");
    return Promise.resolve(savedBase);
  },
}));
mock.module("../../src/documents/spreadsheets/engine", () => ({
  processSpreadsheet: (input: Uint8Array, options: Record<string, unknown>) => {
    calls += 1;
    workerInput = input;
    workerOptions = options;
    return Promise.resolve({ workbook: output });
  },
}));
const { spreadsheetDraftFieldData, spreadsheetManifestFieldData } =
  await import("../../src/forms/spreadsheet-fields");
draftRows = spreadsheetDraftFieldData(bindings);
manifestRows = spreadsheetManifestFieldData(bindings);
const { prepareSpreadsheetOperation, SpreadsheetValidationError } =
  await import("../../src/operations/spreadsheet-document");
const metadata = (action: OperationMetadata["action"]): OperationMetadata => ({
  action,
  bindingRevision: 2,
  finalObjectKey: "final",
  formId: "form",
  responseId: "response",
  stagedObjectKey: "staged",
});
const heartbeat = () => Promise.resolve();

// Altered styles are discarded because the server worker receives its trusted base.
const pasted = mutatePart(base, "xl/styles.xml", (xml) =>
  xml.replaceAll('locked="1"', 'locked="0"')
);
const draft = metadata("save-draft");
const canonical = await prepareSpreadsheetOperation(draft, pasted, heartbeat);
assert.ok(workerInput);
assert.equal(
  descendants(workbookXml(workerInput).sheet, "sheetProtection").length,
  0
);
assert.deepEqual(
  workbookXml(workerInput).parse("xl/styles.xml"),
  workbookXml(base).parse("xl/styles.xml")
);
assert.equal(
  descendants(workbookXml(canonical).sheet, "sheetProtection").length,
  1
);
assert.deepEqual(workerOptions.clearRanges, [
  "A1:B1",
  "D1:D1",
  "A4:A8",
  "B4:B8",
  "C4:C8",
]);
assert.equal(draft.spreadsheetState, undefined);
assert.deepEqual(draft.data, {
  activities: [
    { active: false, note: "First", quantity: 0, total: 0 },
    { active: true, note: "Last", quantity: 4, total: 8 },
  ],
  agency: "Agency",
  date: "1900-03-01",
});

// An invalid draft is recoverable and retains per-cell diagnostics. Submission rejects it.
output = mutatePart(raw, "xl/worksheets/sheet1.xml", (xml) =>
  xml.replace(
    '<c r="A4" t="n" s="0"><v>0</v></c>',
    '<c r="A4" t="inlineStr"><is><t>invalid</t></is></c>'
  )
);
const invalid = metadata("save-draft");
await prepareSpreadsheetOperation(invalid, base, heartbeat);
assert.ok(
  Array.isArray(invalid.spreadsheetErrors) &&
    invalid.spreadsheetErrors.some(
      (error: { address: string }) => error.address === "A4"
    )
);
await assert.rejects(
  prepareSpreadsheetOperation(metadata("submit"), base, heartbeat),
  SpreadsheetValidationError
);
output = raw;

const changedAgency = mutatePart(base, "xl/worksheets/sheet1.xml", (xml) =>
  xml.replace("Agency", "Changed")
);
lockAgency = true;
const prior = calls;
await assert.rejects(
  prepareSpreadsheetOperation(metadata("save-draft"), changedAgency, heartbeat),
  /protected cell/u
);
assert.equal(calls, prior);
const correction = metadata("save-correction");
correction.submissionId = "submission";
await prepareSpreadsheetOperation(correction, changedAgency, heartbeat);
assert.ok(
  (workerOptions.values as { address: string; value: unknown }[]).some(
    (cell) => cell.address === "A1" && cell.value === "Changed"
  )
);
lockAgency = false;

const row = metadata("save-draft");
row.spreadsheetRowChange = { action: "insert", index: 2 };
await prepareSpreadsheetOperation(row, base, heartbeat);
assert.deepEqual(workerOptions.rowChange, {
  action: "insert",
  bodyName: "folio_body",
  index: 2,
  inputColumns: [0, 1, 2],
});
const badRow = metadata("submit");
badRow.spreadsheetRowChange = { action: "insert", index: 2 };
await assert.rejects(
  prepareSpreadsheetOperation(badRow, base, heartbeat),
  /Invalid spreadsheet row operation/u
);

// Saved named ranges, rather than published coordinates, own response positions.
const shifted = mutatePart(
  mutatePart(raw, "xl/workbook.xml", (xml) =>
    xml
      .replaceAll("$A$1:$B$1", "$A$2:$B$2")
      .replaceAll("$D$1", "$D$2")
      .replaceAll("$A$4:$D$8", "$A$4:$D$9")
  ),
  "xl/worksheets/sheet1.xml",
  (xml) =>
    xml
      .replaceAll('<row r="1">', '<row r="2">')
      .replaceAll('r="A1"', 'r="A2"')
      .replaceAll('r="D1"', 'r="D2"')
      .replaceAll('ref="A1:B1"', 'ref="A2:B2"')
);
const shiftedContract = resolveSpreadsheetContract(
  bindings,
  readSpreadsheetWorkbook(shifted)
);
savedBase = protectSpreadsheet(shifted, shiftedContract);
output = shifted;
await prepareSpreadsheetOperation(metadata("save-draft"), savedBase, heartbeat);
assert.deepEqual(workerOptions.clearRanges, [
  "A2:B2",
  "D2:D2",
  "A4:A9",
  "B4:B9",
  "C4:C9",
]);
const movedByClient = mutatePart(savedBase, "xl/workbook.xml", (xml) =>
  xml.replaceAll("$A$4:$D$9", "$A$4:$D$10")
);
const callsBeforeRelocation = calls;
await assert.rejects(
  prepareSpreadsheetOperation(metadata("save-draft"), movedByClient, heartbeat),
  /field position was changed/u
);
assert.equal(calls, callsBeforeRelocation);
savedBase = base;
output = raw;

// Saving a Template Draft retains native content and unfinished mappings,
// without starting a publication worker or rejecting incomplete table setup.
const { table } = bindings;
assert.ok(table);
const oldColumns = table.columns;
table.columns = [];
draftRows = spreadsheetDraftFieldData(bindings);
const callsBeforeSave = calls;
assert.deepEqual(
  await prepareSpreadsheetOperation(metadata("save-template"), raw, heartbeat),
  raw
);
assert.equal(calls, callsBeforeSave);
await assert.rejects(
  prepareSpreadsheetOperation(metadata("publish"), raw, heartbeat),
  /คอลัมน์/u
);
table.columns = oldColumns;
draftRows = spreadsheetDraftFieldData(bindings);
const missing = mutatePart(raw, "xl/workbook.xml", (xml) =>
  xml.replace('name="folio_body"', 'name="other_body"')
);
await assert.rejects(
  prepareSpreadsheetOperation(metadata("publish"), missing, heartbeat),
  /Missing field binding/u
);

const stale = metadata("publish");
stale.bindingRevision = 1;
await assert.rejects(
  prepareSpreadsheetOperation(stale, base, heartbeat),
  /configuration changed/u
);
const published = metadata("publish");
const publishedBytes = await prepareSpreadsheetOperation(
  published,
  base,
  heartbeat
);
assert.equal(
  descendants(workbookXml(publishedBytes).sheet, "sheetProtection").length,
  1
);
assert.equal(Object.hasOwn(published, "spreadsheetState"), false);
process.stdout.write("operations boundary passed\n");
