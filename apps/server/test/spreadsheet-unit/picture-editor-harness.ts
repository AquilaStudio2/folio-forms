// oxlint-disable sort-keys -- Fixture state follows the editor request flow.
// Isolated process: editor configuration uses in-memory database and storage fixtures only.
import { mock } from "bun:test";
import assert from "node:assert/strict";

import type { Identity } from "../../src/auth/identity";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { overlaySpreadsheetPictures } from "../../src/documents/spreadsheets/pictures";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import type { FormWithDocuments } from "../../src/model-types";
import type { EditorOptions } from "../../src/onlyoffice";
import { fixtureWorkbook, mutatePart } from "./fixture";

const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_photo",
      id: "folio_photo",
      key: "photo",
      label: "Photo",
      required: true,
      type: "picture",
    },
  ],
  table: null,
  version: 1,
});
const source = fixtureWorkbook({
  cells: [],
  merges: [],
  names: { folio_photo: "'Form'!$C$3" },
});
const originalContract = resolveSpreadsheetContract(
  bindings,
  readSpreadsheetWorkbook(source)
);
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FoUAAAAASUVORK5CYII=",
    "base64"
  )
);
const original = overlaySpreadsheetPictures(
  source,
  originalContract,
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
const relocated = mutatePart(source, "xl/workbook.xml", (xml) =>
  xml.replace("$C$3", "$C$5")
);
const currentContract = resolveSpreadsheetContract(
  bindings,
  readSpreadsheetWorkbook(relocated)
);
const current = {
  bytes: overlaySpreadsheetPictures(
    relocated,
    currentContract,
    new Map([
      ["folio_photo", { bytes: png, height: 1_000_000, width: 2_000_000 }],
    ])
  ),
};
const responseId = crypto.randomUUID();
const form = {
  documentKind: "xlsx",
  fillMethod: "onlyoffice",
  id: "form",
  publicId: "public",
  publishedTemplate: {
    documentKey: "newer-document",
    id: "newer-publication",
    objectKey: "newer.xlsx",
  },
};
const response = {
  draftDocumentKey: "draft-document",
  draftObjectKey: "draft.xlsx",
  formId: form.id,
  id: responseId,
  prefillSnapshot: null,
  publishedTemplateId: "original-publication",
  spreadsheetInitialized: true,
  status: "draft",
  submissions: [
    {
      corrections: [],
      documentKey: "submission-document",
      id: "submission",
      objectKey: "draft.xlsx",
    },
  ],
};
const lease = {
  expiresAt: new Date(Date.now() + 60_000),
  id: "lease",
  proof: "proof",
  workspaceBaseDocumentKey: "submission-document",
  workspaceBaseRevision: 0,
  workspaceDocumentKey: "workspace-document",
  workspaceObjectKey: "draft.xlsx",
};
let rows: unknown[] = [];
mock.module("@onlyoffice/db", () => ({
  Prisma: { DbNull: null },
  AuditOutcome: { success: "success" },
  FieldType: {
    checkbox: "checkbox",
    date: "date",
    dropdown: "dropdown",
    number: "number",
    picture: "picture",
    table: "table",
    text: "text",
  },
  FillMethod: { native: "native", onlyoffice: "onlyoffice" },
  FormStatus: {},
  OperationTargetType: { correction: "correction" },
  ResponseStatus: { submitted: "submitted" },
  prisma: {
    editorLease: { findFirst: () => Promise.resolve(lease) },
    fieldManifest: {
      findUnique: () =>
        Promise.resolve({
          fields: rows,
          publishedTemplate: { prefillConfiguration: null },
        }),
    },
    form: { findUnique: () => Promise.resolve(form) },
    publishedTemplate: {
      findUnique: ({ where }: { where: { id: string } }) => {
        assert.equal(where.id, "original-publication");
        return Promise.resolve({ objectKey: "published.xlsx" });
      },
    },
    response: {
      findFirst: () => Promise.resolve(response),
      findUnique: () => Promise.resolve({ ...response, status: "submitted" }),
    },
  },
}));
mock.module("../../src/storage", () => ({
  DOCX_CONTENT_TYPE: "docx",
  objectExists: () => Promise.resolve(true),
  objectKey: () => "unused",
  putObject: () => {
    throw new Error("No workspace allocation expected");
  },
  readObject: (key: string) => {
    assert.ok(["published.xlsx", "draft.xlsx"].includes(key));
    return Promise.resolve(key === "published.xlsx" ? original : current.bytes);
  },
}));
mock.module("../../src/editor/leases", () => ({
  claimEditorLease: () => Promise.resolve(lease),
  editorLeaseBridge: () => ({}),
  editorLeaseProof: () => "proof",
  releaseEditorLease: () => Promise.resolve(),
  renewEditorLease: () => Promise.resolve(lease),
}));
mock.module("../../src/editor/authorization", () => ({
  actionEditorCapability: () => "capability",
}));
mock.module("../../src/audit/events", () => ({
  createResponseAudit: () => Promise.resolve(),
}));
mock.module("../../src/forms/query", () => ({
  nativeFields: () => {
    throw new Error("No native editor expected");
  },
}));
mock.module("../../src/documents/office-values", () => ({
  onlyOfficeFieldTagAliases: () => ({}),
}));
mock.module("../../src/onlyoffice", () => ({
  editorConfig: (options: EditorOptions) => ({ pluginOptions: options }),
}));
mock.module("../../src/operations/lifecycle", () => ({
  operationTimeoutMs: 60_000,
}));
mock.module("../../src/operations/object-cleanup", () => ({
  deleteObjectUnlessCanonical: () => Promise.resolve(false),
}));
mock.module("../../src/prefill/values", () => ({
  editableFieldsForSnapshot: () => ({}),
  lockedPrefillForSnapshot: () => {
    // These resumed response fixtures have no Prefill snapshot.
  },
}));
mock.module("../../src/responses/spreadsheet-document", () => ({
  initializeSpreadsheetResponse: (value: unknown) => Promise.resolve(value),
}));

const { spreadsheetManifestFieldData } =
  await import("../../src/forms/spreadsheet-fields");
rows = spreadsheetManifestFieldData(bindings);
const { userEditorConfig, correctionEditorConfig } =
  await import("../../src/responses/editor");
const identity: Identity = {
  email: "picture-fixture@example.test",
  expiresAt: new Date(Date.now() + 60_000),
  id: "user",
  isSso: false,
  mustChangePassword: false,
  name: "Picture fixture",
  role: "user",
  sessionId: "session",
};
await assert.rejects(
  userEditorConfig(
    form as FormWithDocuments,
    { ...identity, role: "viewer" },
    responseId
  ),
  { code: "forbidden", httpStatus: 403 }
);
const expected = [
  {
    anchor: "folio_photo",
    columnOffset: 647_699,
    height: 514_350,
    id: "folio_photo",
    rowOffset: 114_299,
    width: 857_250,
  },
];
const assertFrames = (config: Record<string, unknown>, action: string) => {
  const options = config.pluginOptions as EditorOptions;
  assert.equal(options.action, action);
  assert.deepEqual(options.spreadsheetPictureFrames, expected);
  assert.equal(
    (options.spreadsheetBindings as typeof currentContract).locations
      .folio_photo?.firstRow,
    4
  );
};
assertFrames(
  await userEditorConfig(
    form as FormWithDocuments,
    identity,
    responseId,
    "fill"
  ),
  "fill"
);
assertFrames(
  await userEditorConfig(form as FormWithDocuments, identity, responseId),
  "draft"
);
assertFrames(await correctionEditorConfig(responseId, identity), "correction");
current.bytes = overlaySpreadsheetPictures(
  current.bytes,
  currentContract,
  new Map()
);
assertFrames(
  await userEditorConfig(
    form as FormWithDocuments,
    identity,
    responseId,
    "fill"
  ),
  "fill"
);
assertFrames(
  await userEditorConfig(form as FormWithDocuments, identity, responseId),
  "draft"
);
assertFrames(await correctionEditorConfig(responseId, identity), "correction");
process.stdout.write("picture editor configuration passed\n");
