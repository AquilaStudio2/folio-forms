// Isolated process: no database or object storage is connected by this harness.
import { mock } from "bun:test";
import assert from "node:assert/strict";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  overlaySpreadsheetPictures,
  readSpreadsheetPictures,
  synchronizeSpreadsheetPictureAnchors,
} from "../../src/documents/spreadsheets/pictures";
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
const publishedBase: { bytes?: Uint8Array } = {};
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
    picture: "picture",
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
      findUnique: () => Promise.resolve({ objectKey: "published.xlsx" }),
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
    if (key === "published.xlsx") {
      return Promise.resolve(publishedBase.bytes ?? savedBase);
    }
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
// Picture answers stay embedded in the trusted workbook across draft and correction saves.
const pictureBindings = spreadsheetBindingSchema.parse({
  ...bindings,
  fields: [
    ...bindings.fields,
    {
      anchor: "folio_photo",
      id: "folio_photo",
      key: "photo",
      label: "Photo",
      required: true,
      type: "picture",
    },
  ],
});
manifestRows = spreadsheetManifestFieldData(pictureBindings);
const pictureRaw = mutatePart(raw, "xl/workbook.xml", (xml) =>
  xml.replace(
    "</definedNames>",
    `<definedName name="folio_photo">'Form'!$G$2</definedName></definedNames>`
  )
);
const pictureContract = resolveSpreadsheetContract(
  pictureBindings,
  readSpreadsheetWorkbook(pictureRaw)
);
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FoUAAAAASUVORK5CYII=",
    "base64"
  )
);
const firstPicture = overlaySpreadsheetPictures(
  pictureRaw,
  pictureContract,
  new Map([["folio_photo", { bytes: png, height: 9525, width: 9525 }]])
);
const drawingPath = Object.keys(
  readSpreadsheetWorkbook(firstPicture).archive
).find((name) => name.startsWith("xl/drawings/") && name.endsWith(".xml"));
assert.ok(drawingPath);
// A static logo shares the original image media and must survive mapped-image replacement.
const trustedPictures = mutatePart(firstPicture, drawingPath, (xml) =>
  xml.replace(
    "</xdr:wsDr>",
    `${xml
      .slice(xml.indexOf("<xdr:oneCellAnchor"), xml.indexOf("</xdr:wsDr>"))
      .replace('name="folio_picture_folio_photo"', 'name="Trusted logo"')
      .replace('id="1"', 'id="2"')}</xdr:wsDr>`
  )
);
savedBase = protectSpreadsheet(trustedPictures, pictureContract);
output = trustedPictures;
const pictureDraft = metadata("save-draft");
const pictureSaved = await prepareSpreadsheetOperation(
  pictureDraft,
  savedBase,
  heartbeat
);
assert.deepEqual(
  readSpreadsheetPictures(
    readSpreadsheetWorkbook(pictureSaved),
    pictureContract
  ).get("folio_photo")?.bytes,
  png
);
assert.ok(!Object.hasOwn(pictureDraft.data ?? {}, "photo"));
assert.deepEqual(pictureDraft.spreadsheetErrors, []);
assert.ok(!(workerOptions.clearRanges as string[]).includes("G2:G2"));

const withoutPicture = overlaySpreadsheetPictures(
  savedBase,
  pictureContract,
  new Map()
);
const emptyPictureDraft = metadata("save-draft");
const missingPictureSaved = await prepareSpreadsheetOperation(
  emptyPictureDraft,
  withoutPicture,
  heartbeat
);
assert.equal(
  readSpreadsheetPictures(
    readSpreadsheetWorkbook(missingPictureSaved),
    pictureContract
  ).size,
  0
);
await assert.rejects(
  prepareSpreadsheetOperation(metadata("submit"), withoutPicture, heartbeat),
  (error: unknown) =>
    error instanceof SpreadsheetValidationError &&
    error.errors.some(
      (item) =>
        item.address === "G2" && item.message === "Required picture: Photo"
    )
);
const pictureSubmission = metadata("submit");
await prepareSpreadsheetOperation(pictureSubmission, pictureSaved, heartbeat);
assert.ok(!Object.hasOwn(pictureSubmission.data ?? {}, "photo"));

const replacement = overlaySpreadsheetPictures(
  savedBase,
  pictureContract,
  new Map([["folio_photo", { bytes: png, height: 19_050, width: 19_050 }]])
);
const alteredPictureLayout = mutatePart(
  mutatePart(replacement, drawingPath, (xml) =>
    xml.replace("Trusted logo", "Client logo")
  ),
  "xl/styles.xml",
  (xml) => xml.replaceAll('locked="1"', 'locked="0"')
);
const pictureCorrection = metadata("save-correction");
pictureCorrection.submissionId = "submission";
const correctedPictureBytes = await prepareSpreadsheetOperation(
  pictureCorrection,
  alteredPictureLayout,
  heartbeat
);
const correctedPictures = readSpreadsheetWorkbook(correctedPictureBytes);
assert.equal(
  readSpreadsheetPictures(correctedPictures, pictureContract).get("folio_photo")
    ?.width,
  19_050
);
assert.ok(!Object.hasOwn(pictureCorrection.data ?? {}, "photo"));
assert.deepEqual(pictureCorrection.spreadsheetErrors, []);
assert.ok(workerInput);
assert.deepEqual(
  workbookXml(workerInput).parse("xl/styles.xml"),
  workbookXml(savedBase).parse("xl/styles.xml")
);
const drawingXml = workbookXml(correctedPictureBytes).parse(drawingPath);
assert.ok(
  descendants(drawingXml, "cNvPr").some(
    (node) => node.attributes.name === "Trusted logo"
  )
);
assert.ok(
  !descendants(drawingXml, "cNvPr").some(
    (node) => node.attributes.name === "Client logo"
  )
);
assert.equal(
  Object.keys(correctedPictures.archive).filter((name) =>
    name.startsWith("xl/media/")
  ).length,
  2
);
// Publication provides frames for old mappings and never accepts admin photos as answers.
draftRows = spreadsheetDraftFieldData(pictureBindings);
const framedPublication = await prepareSpreadsheetOperation(
  metadata("publish"),
  trustedPictures,
  heartbeat
);
assert.equal(
  readSpreadsheetPictures(
    readSpreadsheetWorkbook(framedPublication),
    pictureContract
  ).size,
  0
);
assert.equal(
  readSpreadsheetPictures(
    readSpreadsheetWorkbook(framedPublication),
    pictureContract,
    {
      includePlaceholders: true,
    }
  ).size,
  1
);
savedBase = framedPublication;
output = framedPublication;
const frameDraft = await prepareSpreadsheetOperation(
  metadata("save-draft"),
  framedPublication,
  heartbeat
);
assert.equal(
  readSpreadsheetPictures(
    readSpreadsheetWorkbook(frameDraft),
    pictureContract,
    {
      includePlaceholders: true,
    }
  ).size,
  1
);
const resumedFrame = await prepareSpreadsheetOperation(
  metadata("save-draft"),
  frameDraft,
  heartbeat
);
for (const action of ["submit", "save-correction"] as const) {
  const unchanged = metadata(action);
  unchanged.submissionId = "submission";
  // oxlint-disable-next-line no-await-in-loop -- Operations share the mocked worker state and must execute sequentially.
  await assert.rejects(
    prepareSpreadsheetOperation(unchanged, resumedFrame, heartbeat),
    (error: unknown) =>
      error instanceof SpreadsheetValidationError &&
      error.errors.some((item) => item.message === "Required picture: Photo")
  );
}
const actualReplacement = overlaySpreadsheetPictures(
  resumedFrame,
  pictureContract,
  new Map([["folio_photo", { bytes: png, height: 19_050, width: 19_050 }]])
);
await prepareSpreadsheetOperation(
  metadata("submit"),
  actualReplacement,
  heartbeat
);
output = pictureRaw;
const legacyPublication = await prepareSpreadsheetOperation(
  metadata("publish"),
  pictureRaw,
  heartbeat
);
assert.equal(
  readSpreadsheetPictures(
    readSpreadsheetWorkbook(legacyPublication),
    pictureContract,
    {
      includePlaceholders: true,
    }
  ).size,
  1
);
// Publication accepts admin movement; respondent layout keeps the trusted offsets and permits resizing.
const adminLayout = overlaySpreadsheetPictures(
  pictureRaw,
  pictureContract,
  new Map([
    [
      "folio_photo",
      {
        bytes: png,
        columnOffset: 647_699,
        height: 514_350,
        rowOffset: 114_299,
        width: 857_250,
      },
    ],
  ])
);
const adminDrawingPath = Object.keys(
  readSpreadsheetWorkbook(adminLayout).archive
).find((name) => name.startsWith("xl/drawings/") && name.endsWith(".xml"));
assert.ok(adminDrawingPath);
const adminMoved = mutatePart(adminLayout, adminDrawingPath, (xml) =>
  xml.replace("<xdr:row>1</xdr:row>", "<xdr:row>2</xdr:row>")
);
output = synchronizeSpreadsheetPictureAnchors(adminMoved, pictureBindings);
const publishedMoved = await prepareSpreadsheetOperation(
  metadata("publish"),
  adminMoved,
  heartbeat
);
assert.ok(workerInput);
assert.equal(
  readSpreadsheetWorkbook(workerInput).names.get("folio_photo")?.firstRow,
  2
);
const movedContract = resolveSpreadsheetContract(
  pictureBindings,
  readSpreadsheetWorkbook(publishedMoved)
);
const movedPicture = readSpreadsheetPictures(
  readSpreadsheetWorkbook(publishedMoved),
  movedContract,
  { includePlaceholders: true }
).get("folio_photo");
assert.equal(movedPicture?.columnOffset, 647_699);
assert.equal(movedPicture?.rowOffset, 114_299);
assert.equal(movedPicture?.height, 514_350);
assert.equal(movedPicture?.width, 857_250);
savedBase = publishedMoved;
output = publishedMoved;
const userResize = overlaySpreadsheetPictures(
  publishedMoved,
  movedContract,
  new Map([
    [
      "folio_photo",
      {
        bytes: png,
        columnOffset: 1,
        height: 600_000,
        rowOffset: 2,
        width: 1_000_000,
      },
    ],
  ])
);
const resized = await prepareSpreadsheetOperation(
  metadata("save-draft"),
  userResize,
  heartbeat
);
const resizedPicture = readSpreadsheetPictures(
  readSpreadsheetWorkbook(resized),
  movedContract
).get("folio_photo");
assert.equal(resizedPicture?.width, 1_000_000);
assert.equal(resizedPicture?.height, 600_000);
assert.equal(resizedPicture?.columnOffset, 647_699);
assert.equal(resizedPicture?.rowOffset, 114_299);
const [responseLock] = descendants(
  workbookXml(resized).parse(adminDrawingPath),
  "picLocks"
);
assert.equal(responseLock?.attributes.noMove, "1");
assert.equal(responseLock?.attributes.noResize, "0");
const [templateLock] = descendants(
  workbookXml(publishedMoved).parse(adminDrawingPath),
  "picLocks"
);
assert.equal(templateLock?.attributes.noMove, undefined);

// The immutable published frame remains authoritative after the current draft was resized.
publishedBase.bytes = publishedMoved;
savedBase = resized;
output = resized;
const { spreadsheetPictureFramesForTemplate } =
  await import("../../src/forms/spreadsheet-picture-frames");
const initialFrames = await spreadsheetPictureFramesForTemplate("published");
assert.equal(initialFrames[0]?.width, 857_250);
assert.equal(initialFrames[0]?.height, 514_350);
const deletedPhoto = overlaySpreadsheetPictures(
  resized,
  movedContract,
  new Map()
);
const restoredPhoto = await prepareSpreadsheetOperation(
  metadata("save-draft"),
  deletedPhoto,
  heartbeat
);
const restoredWorkbook = readSpreadsheetWorkbook(restoredPhoto);
assert.equal(readSpreadsheetPictures(restoredWorkbook, movedContract).size, 0);
const restoredFrame = readSpreadsheetPictures(restoredWorkbook, movedContract, {
  includePlaceholders: true,
}).get("folio_photo");
assert.equal(restoredFrame?.width, 857_250);
assert.equal(restoredFrame?.height, 514_350);
assert.equal(restoredFrame?.columnOffset, 647_699);
assert.equal(restoredFrame?.rowOffset, 114_299);
await assert.rejects(
  prepareSpreadsheetOperation(metadata("submit"), deletedPhoto, heartbeat),
  (error: unknown) =>
    error instanceof SpreadsheetValidationError &&
    error.errors.some((item) => item.message === "Required picture: Photo")
);
const userMoved = mutatePart(userResize, adminDrawingPath, (xml) =>
  xml.replace("<xdr:row>2</xdr:row>", "<xdr:row>3</xdr:row>")
);
await assert.rejects(
  prepareSpreadsheetOperation(metadata("save-draft"), userMoved, heartbeat),
  /outside its field/u
);
const adminOverlap = mutatePart(adminMoved, adminDrawingPath, (xml) =>
  xml
    .replace("<xdr:row>2</xdr:row>", "<xdr:row>3</xdr:row>")
    .replace("<xdr:col>6</xdr:col>", "<xdr:col>0</xdr:col>")
);
await assert.rejects(
  prepareSpreadsheetOperation(metadata("publish"), adminOverlap, heartbeat),
  (error: unknown) =>
    error instanceof Error &&
    "code" in error &&
    error.code === "invalid_template" &&
    /overlap/u.test(error.message)
);
process.stdout.write("operations boundary passed\n");
