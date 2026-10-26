// oxlint-disable no-await-in-loop unicorn/no-await-expression-member sort-keys -- Sequential callback assertions mirror the saved-state and fixture contracts.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import { spreadsheetBindingAnchors } from "../../src/documents/spreadsheets/columns";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  spreadsheetUploadPocCommand,
  uploadPocGuid,
  uploadPocPreview,
  stripSpreadsheetUploadPoc,
  savedSpreadsheetUploadPocButtons,
} from "../../src/documents/spreadsheets/upload-poc";
import { readSpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import { spreadsheetDraftFieldData } from "../../src/forms/spreadsheet-fields";
import { createOnlyOfficeAuthorization } from "../../src/onlyoffice";
import { operationMetadata } from "../../src/operations/model";
import { deleteObject, putObject, readObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import {
  SpreadsheetRuntime,
  workbookXml,
  descendants,
} from "../spreadsheet-runtime/runtime-fixture";

const runtime = new SpreadsheetRuntime();
const formId = crypto.randomUUID();
const draftId = crypto.randomUUID();
const publicId = formId.replaceAll("-", "");
const documentKey = `preserved-${formId}`;
const initialObjectKey = `tests/${formId}/initial.xlsx`;
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      id: "folio_first",
      anchor: "folio_first",
      key: "first",
      label: "First",
      type: "text",
    },
    {
      id: "folio_second",
      anchor: "folio_second",
      key: "second",
      label: "Second",
      type: "text",
    },
  ],
  table: null,
  version: 1,
});
const anchors: [[string, string], [string, string]] = [
  ["folio_first", "'Form'!$B$2"],
  ["folio_second", "'Form'!$D$2"],
];
let snapshot: Uint8Array = new Uint8Array();
let fetchCount = 0;
let unchangedForceSave = false;
let firstSnapshot: Uint8Array = new Uint8Array();
let secondSnapshot: Uint8Array = new Uint8Array();
let obsoleteSnapshot: Uint8Array = new Uint8Array();
const callbacks: { key: string; userdata: string }[] = [];
const server = Bun.serve({
  fetch: () => {
    fetchCount += 1;
    return new Response(snapshot);
  },
  hostname: "127.0.0.1",
  port: 0,
});
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-fixture")),
    forceSave: (key, userdata) => {
      callbacks.push({ key, userdata });
      return Promise.resolve(!unchangedForceSave);
    },
  },
  onlyOfficeCallbackOrigins: [server.url.origin],
});
let adminId = "";
let capability = "";
let publishCapability = "";
let bearer = "";
let leaseId = "";
const docxForms: string[] = [];
const extraObjects: string[] = [];
beforeAll(async () => {
  await runtime.start();
  const first = {
    guid: uploadPocGuid,
    mark: true,
    preview: uploadPocPreview,
    targets: [
      {
        anchor: "folio_first",
        bindingId: "folio_first",
        kind: "field",
        sheet: "Form",
        tag: "first",
      },
    ],
  };
  const second = {
    ...first,
    targets: [
      {
        anchor: "folio_second",
        bindingId: "folio_second",
        kind: "field",
        sheet: "Form",
        tag: "second",
      },
    ],
  };
  await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet();sheet.SetName("Form");sheet.GetRange("B:D").SetColumnWidth(20);
Api.AddDefName("folio_first","'Form'!$B$2",false);Api.AddDefName("folio_second","'Form'!$D$2",false);
var command=${spreadsheetUploadPocCommand.toString()};
sheet.GetRange("A1").SetValue("revision-one");
if(!JSON.parse(command(${JSON.stringify(first)})).ok)throw new Error("First button failed");
builder.SaveFile("xlsx","/work/first.xlsx");
sheet.GetRange("A1").SetValue("revision-two");
if(!JSON.parse(command(${JSON.stringify(second)})).ok)throw new Error("Second button failed");
builder.SaveFile("xlsx","/work/second.xlsx");
Api.GetDefName("_folio_upload_poc_folio_first").Delete();
builder.SaveFile("xlsx","/work/obsolete.xlsx");builder.CloseFile();`);
  firstSnapshot = await runtime.read("first.xlsx");
  secondSnapshot = await runtime.read("second.xlsx");
  obsoleteSnapshot = await runtime.read("obsolete.xlsx");
  const password = "Preserved-session-fixture-2026!";
  const admin = await createCredentialFixture({
    email: `preserved-${formId}@example.test`,
    name: "Preserved session Admin",
    password,
    role: "admin",
  });
  adminId = admin.id;
  bearer = await bearerFor(app, admin.email, password);
  await putObject(
    initialObjectKey,
    stripSpreadsheetUploadPoc(firstSnapshot),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  await prisma.form.create({
    data: {
      createdBy: adminId,
      documentKind: "xlsx",
      id: formId,
      publicId,
      templateDraft: {
        create: {
          bindingRevision: 1,
          documentKey,
          fieldRules: { create: spreadsheetDraftFieldData(bindings) },
          id: draftId,
          objectKey: initialObjectKey,
        },
      },
      title: "Preserved session",
    },
  });
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  const lease = await claimEditorLease(
    identity,
    "template-draft",
    draftId,
    formId
  );
  leaseId = lease.id;
  const scope = {
    documentKey,
    formId,
    targetId: draftId,
    targetType: "template-draft",
  } as const;
  capability = actionEditorCapability(identity, scope, "save-template", lease);
  publishCapability = actionEditorCapability(identity, scope, "publish", lease);
}, 120_000);
afterAll(async () => {
  await server.stop(true);
  await runtime.stop();
  const operations = await prisma.operation.findMany({
    select: { metadata: true },
    where: { formId },
  });
  for (const operation of operations) {
    const metadata = operationMetadata(operation.metadata);
    await deleteObject(metadata.finalObjectKey);
    await deleteObject(metadata.stagedObjectKey);
  }
  await deleteObject(initialObjectKey);
  for (const key of extraObjects) {
    await deleteObject(key);
  }
  await prisma.operation.deleteMany({
    where: { formId: { in: [formId, ...docxForms] } },
  });
  await prisma.editorLease.deleteMany({ where: { holderUserId: adminId } });
  await prisma.form.deleteMany({
    where: { id: { in: [formId, ...docxForms] } },
  });
  await prisma.user.deleteMany({ where: { id: adminId } });
}, 120_000);
const post = (
  action: string,
  body: Record<string, unknown>,
  token = capability,
  id = publicId
) =>
  app.handle(
    new Request(`http://test.local/api/admin/forms/${id}/${action}`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        "X-Editor-Capability": token,
      },
      method: "POST",
    })
  );
const current = () =>
  prisma.templateDraft.findUniqueOrThrow({ where: { id: draftId } });
const deliverCallback = async (value: { key: string; userdata: string }) => {
  const payload = { ...value, status: 6, url: server.url.toString() };
  const response = await app.handle(
    new Request("http://test.local/onlyoffice/callback", {
      body: JSON.stringify(payload),
      headers: {
        Authorization: createOnlyOfficeAuthorization(payload),
        "Content-Type": "application/json",
      },
      method: "POST",
    })
  );
  expect(response.status).toBe(200);
  return response.json();
};
const startSave = async (
  preserve: boolean,
  bytes: Uint8Array,
  bindingId = "folio_first"
) => {
  snapshot = bytes;
  const count = callbacks.length;
  const response = await post("save", {
    documentKey,
    spreadsheetAnchors: anchors,
    ...(preserve
      ? { preserveEditorSession: true, uploadPocBindingId: bindingId }
      : {}),
  });
  expect(response.status).toBe(202);
  const started = (await response.json()) as { operationId: string };
  for (let i = 0; i < 100 && callbacks.length === count; i += 1) {
    await Bun.sleep(10);
  }
  const claim = callbacks.at(-1);
  if (!claim || callbacks.length !== count + 1) {
    throw new Error("Force-save callback did not start");
  }
  expect(
    await prisma.operation.findUniqueOrThrow({
      where: { id: started.operationId },
    })
  ).toMatchObject({ documentKey, result: null, status: "processing" });
  return { claim, id: started.operationId };
};
const terminal = async (id: string) => {
  const response = await app.handle(
    new Request(`http://test.local/api/operations/${id}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  expect(response.status).toBe(200);
  return (
    (await response.json()) as {
      operation: { status: string; result: Record<string, unknown> };
    }
  ).operation;
};

test("preserved placement saves validate input, commit twice under one key, ignore replay, and normal deletion rotates", async () => {
  for (const invalid of [false, "true", 1]) {
    expect(
      (
        await post("save", {
          documentKey,
          spreadsheetAnchors: anchors,
          preserveEditorSession: invalid,
        })
      ).status
    ).toBe(400);
  }
  expect(
    (
      await post(
        "publish",
        {
          documentKey,
          preserveEditorSession: true,
          spreadsheetAnchors: anchors,
        },
        publishCapability
      )
    ).status
  ).toBe(400);
  const docxId = crypto.randomUUID();
  docxForms.push(docxId);
  const docxDraftId = crypto.randomUUID();
  await prisma.form.create({
    data: {
      createdBy: adminId,
      documentKind: "docx",
      id: docxId,
      publicId: docxId.replaceAll("-", ""),
      templateDraft: {
        create: {
          documentKey: `docx-${docxId}`,
          id: docxDraftId,
          objectKey: `tests/${docxId}/none.docx`,
        },
      },
      title: "DOCX no preserve",
    },
  });
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  const docxLease = await claimEditorLease(
    identity,
    "template-draft",
    docxDraftId,
    docxId
  );
  const docxCap = actionEditorCapability(
    identity,
    {
      documentKey: `docx-${docxId}`,
      formId: docxId,
      targetId: docxDraftId,
      targetType: "template-draft",
    },
    "save-template",
    docxLease
  );
  expect(
    (
      await post(
        "save",
        { documentKey: `docx-${docxId}`, preserveEditorSession: true },
        docxCap,
        docxId.replaceAll("-", "")
      )
    ).status
  ).toBe(400);
  for (const body of [
    { documentKey, spreadsheetAnchors: anchors, preserveEditorSession: true },
    {
      documentKey,
      spreadsheetAnchors: anchors,
      uploadPocBindingId: "folio_first",
    },
    {
      documentKey,
      spreadsheetAnchors: anchors,
      preserveEditorSession: true,
      uploadPocBindingId: "not-a-binding",
    },
  ]) {
    expect((await post("save", body)).status).toBe(400);
  }
  // No canonical POC proof: operation fails and leaves the saved artifact unchanged.
  const rejected = await startSave(
    true,
    stripSpreadsheetUploadPoc(firstSnapshot)
  );
  await deliverCallback(rejected.claim);
  expect((await terminal(rejected.id)).status).toBe("failed");
  expect((await current()).objectKey).toBe(initialObjectKey);
  const one = await startSave(true, firstSnapshot);
  expect(await deliverCallback(one.claim)).toMatchObject({ error: 0 });
  expect(await terminal(one.id)).toMatchObject({
    result: { documentKey, editorSessionPreserved: true },
    status: "completed",
  });
  const savedOne = await current();
  expect(savedOne.documentKey).toBe(documentKey);
  expect(savedOne.objectKey).not.toBe(initialObjectKey);
  // Existing B's native anchor is unchanged, but the old canonical artifact only
  // contains A. Force-save(false) must not ACK B by merely counting A's button.
  unchangedForceSave = true;
  const staleResponse = await post("save", {
    documentKey,
    spreadsheetAnchors: anchors,
    preserveEditorSession: true,
    uploadPocBindingId: "folio_second",
  });
  expect(staleResponse.status).toBe(202);
  const stale = (await staleResponse.json()) as { operationId: string };
  let staleResult = await terminal(stale.operationId);
  for (let i = 0; i < 100 && staleResult.status !== "failed"; i += 1) {
    await Bun.sleep(10);
    staleResult = await terminal(stale.operationId);
  }
  expect(staleResult.status).toBe("failed");
  expect(staleResult.result?.editorSessionPreserved).not.toBe(true);
  expect((await current()).objectKey).toBe(savedOne.objectKey);
  unchangedForceSave = false;
  const two = await startSave(true, secondSnapshot, "folio_second");
  expect(await deliverCallback(two.claim)).toMatchObject({ error: 0 });
  expect(await terminal(two.id)).toMatchObject({
    result: { documentKey, editorSessionPreserved: true },
    status: "completed",
  });
  const savedTwo = await current();
  expect(savedTwo.documentKey).toBe(documentKey);
  expect(savedTwo.objectKey).not.toBe(savedOne.objectKey);
  expect(savedTwo.contentHash).not.toBe(savedOne.contentHash);
  expect(
    await prisma.editorLease.findUniqueOrThrow({ where: { id: leaseId } })
  ).toMatchObject({ holderUserId: adminId, targetId: draftId });
  const savedBytes = await readObject(savedTwo.objectKey);
  expect(savedSpreadsheetUploadPocButtons(savedBytes, bindings)).toHaveLength(
    2
  );
  const configResponse = await app.handle(
    new Request(`http://test.local/api/admin/forms/${publicId}/editor-config`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  expect(configResponse.status).toBe(200);
  expect(await configResponse.json()).toMatchObject({
    bridge: {
      lease: { id: leaseId },
      uploadPoc: {
        documentKey,
        savedButtons: expect.arrayContaining([
          { bindingId: "folio_first", rowIndex: null, tag: "first" },
          { bindingId: "folio_second", rowIndex: null, tag: "second" },
        ]),
      },
    },
  });
  // A delayed replay of operation one has the SAME document key but cannot overwrite operation two.
  const fetches = fetchCount;
  snapshot = firstSnapshot;
  expect(await deliverCallback(one.claim)).toMatchObject({ error: 0 });
  expect(fetchCount).toBe(fetches);
  expect(await current()).toMatchObject({
    contentHash: savedTwo.contentHash,
    objectKey: savedTwo.objectKey,
  });
  await runtime.write(
    "canonical-from-storage.xlsx",
    await readObject(savedTwo.objectKey)
  );
  await runtime.run(`builder.OpenFile("/work/canonical-from-storage.xlsx");
var sheet=Api.GetActiveSheet();sheet.GetRange("Z1").SetValue(JSON.stringify(sheet.GetAllOleObjects().map(function(o){return JSON.parse(o.GetData()).bindingId;})));
builder.SaveFile("xlsx","/work/canonical-reopened.xlsx");builder.CloseFile();`);
  expect(
    JSON.parse(
      String(
        readSpreadsheetWorkbook(
          await runtime.read("canonical-reopened.xlsx")
        ).cells.get("Z1")?.value
      )
    ).toSorted()
  ).toEqual(["folio_first", "folio_second"]);
  const obsolete = await startSave(true, obsoleteSnapshot);
  await deliverCallback(obsolete.claim);
  expect((await terminal(obsolete.id)).status).toBe("failed");
  expect((await current()).objectKey).toBe(savedTwo.objectKey);
  const normal = await startSave(false, obsoleteSnapshot);
  expect(await deliverCallback(normal.claim)).toMatchObject({ error: 0 });
  const normalResult = await terminal(normal.id);
  expect(normalResult.status).toBe("completed");
  expect(normalResult.result.editorSessionPreserved).toBeUndefined();
  expect(normalResult.result.documentKey).not.toBe(documentKey);
  const savedNormal = await current();
  expect(savedNormal.documentKey).not.toBe(documentKey);
  expect(
    savedSpreadsheetUploadPocButtons(
      await readObject(savedNormal.objectKey),
      bindings
    )
  ).toEqual([{ bindingId: "folio_second", rowIndex: null, tag: "second" }]);
}, 120_000);

const fixtureItem = <T>(items: readonly T[], index: number): T => {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Missing fixture item ${index}`);
  }
  return value;
};

test("manual zero-POC saves prove fresh values and native selective deletions preserve the session down to zero", async () => {
  const { spreadsheetEditorSaveCheckpointCommand } =
    // @ts-expect-error -- Actual plugin command is serialized into native 9.4.
    await import("../../../onlyoffice-plugin/src/spreadsheet-editor-save.js");
  const { spreadsheetUploadPocDeleteCommand } =
    // @ts-expect-error -- Actual plugin command is serialized into native 9.4.
    await import("../../../onlyoffice-plugin/src/spreadsheet-upload-poc-delete.js");
  const labels = [
    "zero",
    "edited",
    "full",
    "scalar",
    "column",
    "table",
    "empty",
  ];
  const nonces = Object.fromEntries(
    labels.map((label) => [label, crypto.randomUUID()])
  );
  const fullBindings = spreadsheetBindingSchema.parse({
    version: 1,
    fields: bindings.fields,
    table: {
      id: "folio_table",
      anchor: "folio_body",
      key: "items",
      label: "Items",
      columns: [
        { id: "folio_col1", key: "one", label: "One", offset: 0, type: "text" },
        { id: "folio_col2", key: "two", label: "Two", offset: 1, type: "text" },
      ],
    },
  });
  const scalarDeleted = structuredClone(fullBindings);
  scalarDeleted.fields = scalarDeleted.fields.filter(
    (field) => field.id !== "folio_first"
  );
  const columnDeleted = structuredClone(scalarDeleted);
  if (!columnDeleted.table) {
    throw new Error("Missing fixture table");
  }
  columnDeleted.table.columns = columnDeleted.table.columns.filter(
    (column) => column.id !== "folio_col1"
  );
  const tableDeleted = structuredClone(columnDeleted);
  tableDeleted.table = null;
  const empty = structuredClone(tableDeleted);
  empty.fields = [];
  const states = [
    fullBindings,
    fullBindings,
    fullBindings,
    scalarDeleted,
    columnDeleted,
    tableDeleted,
    empty,
  ];
  const fullTable = fullBindings.table;
  if (!fullTable) {
    throw new Error("Missing full table");
  }
  const targets = [
    ...bindings.fields.map((field) => ({
      anchor: field.anchor,
      bindingId: field.id,
      kind: "field",
      sheet: "Form",
      tag: field.key,
    })),
    ...fullTable.columns.map((column) => ({
      anchor: `folio_column_${column.id}`,
      bindingId: column.id,
      bodyAnchor: "folio_body",
      columnOffset: column.offset,
      kind: "column",
      sheet: "Form",
      tag: `items.${column.key}`,
    })),
  ];
  await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet();sheet.SetName("Form");sheet.GetRange("B:D").SetColumnWidth(20);
Api.AddDefName("folio_first","'Form'!$B$2",false);Api.AddDefName("folio_second","'Form'!$D$2",false);
Api.AddDefName("folio_body","'Form'!$A$5:$B$6",false);Api.AddDefName("folio_columns_folio_table","'Form'!$A$5:$B$6",false);
Api.AddDefName("folio_column_folio_col1","'Form'!$A$5:$A$6",false);Api.AddDefName("folio_column_folio_col2","'Form'!$B$5:$B$6",false);
sheet.GetRange("A1").SetValue("original");
var image=sheet.AddImage(${JSON.stringify(uploadPocPreview)},600000,130000,8,0,3,0);image.SetName("ordinary-manual-image");
var checkpoint=${spreadsheetEditorSaveCheckpointCommand.toString()};var deletion=${spreadsheetUploadPocDeleteCommand.toString()};var nonces=${JSON.stringify(nonces)};
function checkpointFor(label){if(checkpoint(nonces[label])!==true)throw new Error("Checkpoint failed");}
function remove(ids,names,active){var captured=JSON.parse(deletion({phase:"capture",guid:${JSON.stringify(uploadPocGuid)},bindingIds:ids}));if(!captured.ok)throw new Error(captured.error);names.forEach(function(name){var n;try{n=Api.GetDefName(name);}catch(e){n=null;}if(n)n.Delete();});var result=JSON.parse(deletion({phase:"remove",guid:${JSON.stringify(uploadPocGuid)},bindingIds:ids,targets:captured.targets,activeBindingIds:active}));if(!result.ok)throw new Error(result.error);}
checkpointFor("zero");
builder.SaveFile("xlsx","/work/manual-zero.xlsx");

sheet.GetRange("A1").SetValue("edited");sheet.GetRange("A1").SetBold(true);sheet.GetRange("H1").SetValue(42);sheet.GetRange("I1").SetValue("=H1+1");checkpointFor("edited");
builder.SaveFile("xlsx","/work/manual-edited.xlsx");

var place=${spreadsheetUploadPocCommand.toString()};var result=JSON.parse(place(${JSON.stringify({ guid: uploadPocGuid, preview: uploadPocPreview, mark: true, targets })}));if(!result.ok)throw new Error(result.error);checkpointFor("full");
builder.SaveFile("xlsx","/work/manual-full.xlsx");

remove(["folio_first"],["folio_first","_folio_upload_poc_folio_first"],["folio_second","folio_table","folio_col1","folio_col2"]);checkpointFor("scalar");
builder.SaveFile("xlsx","/work/manual-scalar.xlsx");

remove(["folio_col1"],["folio_column_folio_col1","_folio_upload_poc_folio_col1"],["folio_second","folio_table","folio_col2"]);checkpointFor("column");
builder.SaveFile("xlsx","/work/manual-column.xlsx");

remove(["folio_table","folio_col2"],["folio_body","folio_columns_folio_table","folio_column_folio_col2","_folio_upload_poc_folio_col2"],["folio_second"]);checkpointFor("table");
builder.SaveFile("xlsx","/work/manual-table.xlsx");

remove(["folio_second"],["folio_second","_folio_upload_poc_folio_second"],[]);checkpointFor("empty");
builder.SaveFile("xlsx","/work/manual-empty.xlsx");
builder.CloseFile();`);
  const snapshots: Uint8Array[] = [];
  for (const label of labels) {
    snapshots.push(await runtime.read(`manual-${label}.xlsx`));
  }
  const id = crypto.randomUUID();
  docxForms.push(id);
  const targetId = crypto.randomUUID();
  const key = `manual-${id}`;
  const initialKey = `tests/${id}/initial.xlsx`;
  extraObjects.push(initialKey);
  await putObject(
    initialKey,
    fixtureItem(snapshots, 0),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  await prisma.form.create({
    data: {
      id,
      publicId: id.replaceAll("-", ""),
      createdBy: adminId,
      title: "Manual and delete session",
      documentKind: "xlsx",
      templateDraft: {
        create: {
          id: targetId,
          documentKey: key,
          objectKey: initialKey,
          fieldRules: { create: spreadsheetDraftFieldData(fullBindings) },
        },
      },
    },
  });
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  const lease = await claimEditorLease(
    identity,
    "template-draft",
    targetId,
    id
  );
  const token = actionEditorCapability(
    identity,
    { documentKey: key, formId: id, targetId, targetType: "template-draft" },
    "save-template",
    lease
  );
  const get = () =>
    prisma.templateDraft.findUniqueOrThrow({ where: { id: targetId } });
  const send = async (
    index: number,
    deleted: string[] = [],
    checkpointOverride?: string
  ) => {
    const bytes = fixtureItem(snapshots, index);
    snapshot = bytes;
    const xml = workbookXml(bytes);
    const count = callbacks.length;
    const response = await post(
      "save",
      {
        documentKey: key,
        spreadsheetAnchors: spreadsheetBindingAnchors(
          fixtureItem(states, index)
        ).map((anchor) => [anchor, xml.names[anchor] ?? null]),
        preserveEditorSession: true,
        preserveEditorSessionPurpose: deleted.length ? "delete" : "manual",
        spreadsheetSaveCheckpoint:
          checkpointOverride ?? nonces[fixtureItem(labels, index)],
        spreadsheetUploadPocSnapshot: savedSpreadsheetUploadPocButtons(
          bytes,
          fixtureItem(states, index)
        ),
        ...(deleted.length ? { deletedUploadPocBindingIds: deleted } : {}),
      },
      token,
      id.replaceAll("-", "")
    );
    expect(response.status).toBe(202);
    const operation = (await response.json()) as { operationId: string };
    for (let i = 0; i < 100 && callbacks.length === count; i += 1) {
      await Bun.sleep(10);
    }
    const claim = callbacks.at(-1);
    if (!claim || callbacks.length !== count + 1) {
      throw new Error("No native callback claim");
    }
    if (!unchangedForceSave) {
      await deliverCallback(claim);
    }
    let result = await terminal(operation.operationId);
    for (
      let i = 0;
      i < 100 && result.status !== "completed" && result.status !== "failed";
      i += 1
    ) {
      await Bun.sleep(10);
      result = await terminal(operation.operationId);
    }
    return { claim, result };
  };
  const zero = await send(0);
  expect(zero.result).toMatchObject({
    status: "completed",
    result: { editorSessionPreserved: true, documentKey: key },
  });
  const savedZero = await get();
  expect(
    savedSpreadsheetUploadPocButtons(
      await readObject(savedZero.objectKey),
      fullBindings
    )
  ).toEqual([]);
  unchangedForceSave = true;
  const stale = await send(1, [], crypto.randomUUID());
  unchangedForceSave = false;
  expect(stale.result.status).toBe("failed");
  expect((await get()).objectKey).toBe(savedZero.objectKey);
  const edited = await send(1);
  expect(edited.result.status).toBe("completed");
  const savedEdited = await get();
  const editedWorkbook = readSpreadsheetWorkbook(
    await readObject(savedEdited.objectKey)
  );
  expect(editedWorkbook.cells.get("A1")?.value).toBe("edited");
  expect(editedWorkbook.cells.get("H1")?.value).toBe(42);
  expect(editedWorkbook.cells.get("I1")?.formula).toBe("H1+1");
  const replay = await post(
    "save",
    {
      documentKey: key,
      spreadsheetAnchors: spreadsheetBindingAnchors(fixtureItem(states, 1)).map(
        (anchor) => [
          anchor,
          workbookXml(fixtureItem(snapshots, 1)).names[anchor] ?? null,
        ]
      ),
      preserveEditorSession: true,
      preserveEditorSessionPurpose: "manual",
      spreadsheetSaveCheckpoint: nonces.edited,
      spreadsheetUploadPocSnapshot: [],
    },
    token,
    id.replaceAll("-", "")
  );
  expect(replay.status).toBe(409);
  const expectedCounts = [0, 0, 6, 5, 3, 1, 0];
  const deletedByStep: Record<number, string[]> = {
    3: ["folio_first"],
    4: ["folio_col1"],
    5: ["folio_table", "folio_col2"],
    6: ["folio_second"],
  };
  let previous = savedEdited;
  for (let step = 2; step < labels.length; step += 1) {
    await prisma.$transaction(async (tx) => {
      await tx.draftFieldRule.deleteMany({
        where: { templateDraftId: targetId },
      });
      const rows = spreadsheetDraftFieldData(fixtureItem(states, step));
      if (rows.length) {
        await tx.draftFieldRule.createMany({
          data: rows.map((row) => ({ ...row, templateDraftId: targetId })),
        });
      }
      await tx.templateDraft.update({
        where: { id: targetId },
        data: { bindingRevision: { increment: 1 } },
      });
    });
    const saved = await send(step, deletedByStep[step] ?? []);
    expect(saved.result).toMatchObject({
      status: "completed",
      result: { documentKey: key, editorSessionPreserved: true },
    });
    const updatedDraft = await get();
    expect(updatedDraft.documentKey).toBe(key);
    expect(updatedDraft.objectKey).not.toBe(previous.objectKey);
    expect(updatedDraft.contentHash).not.toBe(previous.contentHash);
    expect(
      savedSpreadsheetUploadPocButtons(
        await readObject(updatedDraft.objectKey),
        fixtureItem(states, step)
      )
    ).toHaveLength(fixtureItem(expectedCounts, step));
    previous = updatedDraft;
  }
  const final = await get();
  await runtime.write(
    "manual-final-storage.xlsx",
    await readObject(final.objectKey)
  );
  await runtime.run(`builder.OpenFile("/work/manual-final-storage.xlsx");
var sheet=Api.GetActiveSheet();var proof={count:sheet.GetAllOleObjects().length,images:sheet.GetAllImages().map(function(o){return o.GetName();})};sheet.GetRange("Z20").SetValue(JSON.stringify(proof));
builder.SaveFile("xlsx","/work/manual-final-native.xlsx");builder.CloseFile();`);
  const reopened = readSpreadsheetWorkbook(
    await runtime.read("manual-final-native.xlsx")
  );
  const finalXml = workbookXml(await runtime.read("manual-final-native.xlsx"));
  const styles = finalXml.parse("xl/styles.xml");
  const style = fixtureItem(
    fixtureItem(descendants(styles, "cellXfs"), 0).children,
    Number(finalXml.cell("A1").style ?? 0)
  );
  const font = fixtureItem(
    fixtureItem(descendants(styles, "fonts"), 0).children,
    Number(style.attributes.fontId ?? 0)
  );
  expect(font.children.some((child) => child.local === "b")).toBe(true);

  expect(JSON.parse(String(reopened.cells.get("Z20")?.value))).toMatchObject({
    count: 0,
    images: ["ordinary-manual-image"],
  });
  expect(reopened.cells.get("A1")?.value).toBe("edited");
  expect(reopened.cells.get("I1")?.formula).toBe("H1+1");
  await deliverCallback(zero.claim);
  expect((await get()).objectKey).toBe(final.objectKey);
}, 120_000);
