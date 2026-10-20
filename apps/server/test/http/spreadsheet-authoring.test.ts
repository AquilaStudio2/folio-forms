// oxlint-disable unicorn/no-await-expression-member -- Keep sequential HTTP assertions adjacent to their request.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { Prisma, prisma } from "@onlyoffice/db";
import { unzipSync } from "fflate";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import { contentHash } from "../../src/digests";
import { blankSpreadsheet } from "../../src/documents/spreadsheets/blank";
import type { SpreadsheetBindings } from "../../src/documents/spreadsheets/contract";
import { emptySpreadsheetBindings } from "../../src/documents/spreadsheets/contract";
import { protectSpreadsheet } from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import {
  spreadsheetDraftBindings,
  spreadsheetDraftFieldData,
  spreadsheetBindingsForTemplate,
  spreadsheetManifestFieldData,
} from "../../src/forms/spreadsheet-fields";
import {
  createOnlyOfficeAuthorization,
  documentUrl,
  editorConfig,
  pluginGuid,
} from "../../src/onlyoffice";
import type { OperationMetadata } from "../../src/operations/model";
import { completePublishOperation } from "../../src/operations/template-completion";
import { putObject, readObject, deleteObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Spreadsheet HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const pdfKinds: (string | undefined)[] = [];
const exportKeys: string[] = [];
const exportSources: Uint8Array[] = [];
const storedObjects: string[] = [];
let nativeSnapshot: Uint8Array | null = null;
const nativeServer = Bun.serve({
  fetch: () => new Response(nativeSnapshot),
  hostname: "127.0.0.1",
  port: 0,
});
let nativeSnapshotUrl: string | null = null;
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    convertDocxToPdf: async (key, _pdfOnly, kind) => {
      pdfKinds.push(kind);
      if (key.startsWith("xlsx-export-")) {
        exportKeys.push(key);
        const url = documentUrl(key);
        const source = await app.handle(
          new Request(url, {
            headers: { Authorization: createOnlyOfficeAuthorization({ url }) },
          })
        );
        expect(source.status).toBe(200);
        exportSources.push(new Uint8Array(await source.arrayBuffer()));
      }
      return new TextEncoder().encode("%PDF-test");
    },
    forceSave: () =>
      Promise.resolve(nativeSnapshotUrl ? { url: nativeSnapshotUrl } : false),
  },
  onlyOfficeCallbackOrigins: [nativeServer.url.origin],
});
const fixtureId = crypto.randomUUID();
const formId = crypto.randomUUID();
const publicId = crypto.randomUUID().replaceAll("-", "");
const templateId = crypto.randomUUID();
const documentKey = `xlsx-bindings-${fixtureId}`;
let adminId = "";
let userId = "";
let capability = "";
let saveCapability = "";
let publishCapability = "";
let bearer = "";
let userBearer = "";
const field = {
  anchor: "folio_name_anchor",
  computed: false,
  id: "folio_name",
  key: "name",
  label: "Name",
  options: [],
  placeholder: null,
  prefillPointer: null,
  prefillPolicy: "editable",
  required: false,
  type: "text",
};

const bindingRequest = (
  method: string,
  body?: unknown,
  headers?: Record<string, string>
) =>
  app.handle(
    new Request(
      `http://test.local/api/admin/forms/${publicId}/spreadsheet-bindings`,
      {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          ...(headers ?? { "X-Editor-Capability": capability }),
          "Content-Type": "application/json",
        },
        method,
      }
    )
  );
const bindingBody = (
  response: Response
): Promise<{ bindings: SpreadsheetBindings; revision: number }> =>
  response.json() as Promise<{
    bindings: SpreadsheetBindings;
    revision: number;
  }>;

const update = (revision: number, change: unknown, key = documentKey) =>
  bindingRequest("PATCH", { change, documentKey: key, revision });

const request = (path: string, token = userBearer) =>
  app.handle(
    new Request(`http://test.local${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
const replaceDraftFields = (bindings: SpreadsheetBindings) =>
  prisma.$transaction(async (tx) => {
    await tx.draftFieldRule.deleteMany({
      where: { templateDraftId: templateId },
    });
    await tx.draftFieldRule.createMany({
      data: spreadsheetDraftFieldData(bindings).map((row) => ({
        ...row,
        templateDraftId: templateId,
      })),
    });
  });
beforeAll(async () => {
  const password = "Spreadsheet-fixture-password-2026!";
  const admin = await createCredentialFixture({
    email: `xlsx-admin-${fixtureId}@example.test`,
    name: "Excel Admin",
    password,
    role: "admin",
  });
  const user = await createCredentialFixture({
    email: `xlsx-user-${fixtureId}@example.test`,
    name: "Excel User",
    password,
  });
  adminId = admin.id;
  userId = user.id;
  bearer = await bearerFor(app, admin.email, password);
  userBearer = await bearerFor(app, user.email, password);
  await prisma.form.create({
    data: {
      createdBy: admin.id,
      documentKind: "xlsx",
      id: formId,
      publicId,
      templateDraft: {
        create: {
          documentKey,
          id: templateId,
          objectKey: `tests/${fixtureId}/template.xlsx`,
        },
      },
      title: "Excel bindings",
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
    templateId,
    formId
  );
  const scope = {
    documentKey,
    formId,
    targetId: templateId,
    targetType: "template-draft",
  } as const;
  saveCapability = actionEditorCapability(
    identity,
    scope,
    "save-template",
    lease
  );
  publishCapability = actionEditorCapability(identity, scope, "publish", lease);
  const initialObjectKey = `tests/${fixtureId}/template.xlsx`;
  await putObject(initialObjectKey, blankSpreadsheet(), XLSX_CONTENT_TYPE);
  storedObjects.push(initialObjectKey);
  capability = actionEditorCapability(
    identity,
    { documentKey, formId, targetId: templateId, targetType: "template-draft" },
    "configure-fields",
    lease
  );
});

afterAll(async () => {
  await nativeServer.stop(true);
  await prisma.operation.deleteMany({ where: { formId } });
  await prisma.editorLease.deleteMany({ where: { targetId: templateId } });
  await prisma.form.deleteMany({ where: { id: formId } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [adminId, userId] },
      responses: { none: {} },
      submissions: { none: {} },
    },
  });
  await Promise.all(storedObjects.map(deleteObject));
});

test("spreadsheet binding API requires scoped capability and preserves revision on invalid updates", async () => {
  expect(
    (await bindingRequest("GET", undefined, { "X-Editor-Capability": "" }))
      .status
  ).toBe(401);
  expect(
    (
      await app.handle(
        new Request(
          `http://test.local/api/admin/forms/${publicId}/spreadsheet-bindings`,
          { headers: { Authorization: `Bearer ${userBearer}` } }
        )
      )
    ).status
  ).toBe(401);
  const empty = await bindingRequest("GET");
  expect(empty.status).toBe(200);
  expect(await empty.json()).toEqual({
    bindings: emptySpreadsheetBindings(),
    revision: 0,
  });

  await Promise.all(
    ["GET", "PATCH"].map(async (method) => {
      const docxRules = await app.handle(
        new Request(
          `http://test.local/api/admin/forms/${publicId}/field-rules`,
          {
            headers: {
              "Content-Type": "application/json",
              "X-Editor-Capability": capability,
            },
            method,
            ...(method === "PATCH"
              ? {
                  body: JSON.stringify({
                    documentKey,
                    prefillPointer: null,
                    prefillPolicy: "editable",
                    previousTag: null,
                    required: true,
                    tag: "name",
                  }),
                }
              : {}),
          }
        )
      );
      expect(docxRules.status).toBe(409);
      expect(await docxRules.json()).toMatchObject({
        error: "invalid_field_config",
      });
    })
  );
  expect(
    await prisma.draftFieldRule.count({
      where: { templateDraftId: templateId },
    })
  ).toBe(0);

  const created = await update(0, {
    action: "upsert",
    kind: "field",
    value: field,
  });
  expect(created.status).toBe(200);
  expect((await bindingBody(created)).revision).toBe(1);
  const sharedField = await prisma.draftFieldRule.findUniqueOrThrow({
    where: {
      templateDraftId_tag: { tag: field.key, templateDraftId: templateId },
    },
  });
  expect(sharedField).toMatchObject({
    binding: {
      anchor: field.anchor,
      computed: false,
      id: field.id,
      placeholder: null,
    },
    label: field.label,
    options: null,
    required: field.required,
    type: "text",
  });
  expect(Object.keys(sharedField.binding as object).toSorted()).toEqual([
    "anchor",
    "computed",
    "id",
    "placeholder",
  ]);
  expect(
    (await update(0, { action: "upsert", kind: "field", value: field })).status
  ).toBe(409);
  expect(
    (
      await update(
        1,
        { action: "delete", id: field.id, kind: "field" },
        "old-document"
      )
    ).status
  ).toBe(409);
  expect(
    (
      await update(1, {
        action: "upsert",
        kind: "field",
        value: { ...field, anchor: "folio_second_anchor", id: "folio_second" },
      })
    ).status
  ).toBe(400);
  expect(
    (
      await update(1, {
        action: "upsert",
        kind: "field",
        value: { ...field, key: "__proto__" },
      })
    ).status
  ).toBe(400);
  expect(
    (
      await update(1, {
        action: "upsert",
        kind: "field",
        value: { ...field, prefillPolicy: "lock_when_available" },
      })
    ).status
  ).toBe(400);
  expect((await bindingRequest("GET").then(bindingBody)).revision).toBe(1);
  const computed = await update(1, {
    action: "upsert",
    kind: "field",
    value: { ...field, computed: true },
  });
  expect(computed.status).toBe(400);
  expect((await bindingRequest("GET").then(bindingBody)).revision).toBe(1);
});

test("table columns retain stable keys through edits and delete; active operations block binding changes", async () => {
  const table = {
    anchor: "folio_rows_anchor",
    id: "folio_rows",
    key: "rows",
    label: "Rows",
  };
  const column = {
    computed: false,
    id: "folio_amount",
    key: "amount",
    label: "Amount",
    offset: 1,
    options: [],
    placeholder: null,
    required: true,
    type: "number" as const,
  };
  expect(
    (
      await update(1, {
        action: "upsert",
        kind: "table",
        value: {
          ...table,
          columns: [column, { ...column, id: "folio_duplicate" }],
        },
      })
    ).status
  ).toBe(400);
  expect(
    (
      await update(1, {
        action: "upsert",
        kind: "table",
        value: { ...table, columns: [{ ...column, computed: true }] },
      })
    ).status
  ).toBe(400);
  const createdTable = await update(1, {
    action: "upsert",
    kind: "table",
    value: { ...table, columns: [column] },
  });
  expect(createdTable.status).toBe(200);
  expect((await bindingBody(createdTable)).bindings.table?.columns).toEqual([
    column,
  ]);
  expect(
    await prisma.draftFieldRule.findMany({
      orderBy: { position: "asc" },
      select: {
        binding: true,
        label: true,
        required: true,
        tag: true,
        type: true,
      },
      where: { templateDraftId: templateId },
    })
  ).toEqual([
    {
      binding: {
        anchor: field.anchor,
        computed: false,
        id: field.id,
        placeholder: null,
      },
      label: field.label,
      required: false,
      tag: field.key,
      type: "text",
    },
    {
      binding: { anchor: table.anchor, id: table.id },
      label: table.label,
      required: false,
      tag: table.key,
      type: "table",
    },
    {
      binding: {
        computed: false,
        id: column.id,
        offset: column.offset,
        placeholder: null,
      },
      label: column.label,
      required: true,
      tag: "rows.amount",
      type: "number",
    },
  ]);
  expect(
    (await update(2, { action: "upsert", kind: "column", value: column }))
      .status
  ).toBe(200);
  expect(
    (
      await update(3, {
        action: "upsert",
        kind: "table",
        value: { ...table, label: "Updated rows" },
      })
    ).status
  ).toBe(200);
  const current = await bindingRequest("GET").then(bindingBody);
  expect(current.bindings.table?.columns).toEqual([column]);
  expect(
    (
      await update(4, {
        action: "upsert",
        kind: "column",
        value: { ...column, id: "folio_other", key: "other" },
      })
    ).status
  ).toBe(400);
  const operation = await prisma.operation.create({
    data: {
      actorId: adminId,
      documentKey,
      formId,
      metadata: {},
      ownerUserId: adminId,
      status: "pending",
      targetId: templateId,
      targetType: "template_draft",
      type: "save_template_draft",
    },
  });
  expect(
    (await update(4, { action: "delete", id: column.id, kind: "column" }))
      .status
  ).toBe(409);
  await prisma.operation.update({
    data: {
      metadata: {
        action: "save-template",
        finalObjectKey: `tests/${fixtureId}/stale-final.xlsx`,
        formId,
        publicId,
        stagedObjectKey: `tests/${fixtureId}/stale-stage.xlsx`,
      },
      updatedAt: new Date(0),
    },
    where: { id: operation.id },
  });
  expect(
    (await update(4, { action: "delete", id: column.id, kind: "column" }))
      .status
  ).toBe(200);
  expect(
    (await prisma.operation.findUniqueOrThrow({ where: { id: operation.id } }))
      .status
  ).toBe("failed");
  await prisma.operation.delete({ where: { id: operation.id } });
  const deleted = await update(5, {
    action: "delete",
    id: table.id,
    kind: "table",
  });
  expect(deleted.status).toBe(200);
  expect((await bindingBody(deleted)).bindings.table).toBeNull();
  await prisma.form.update({
    data: { status: "published" },
    where: { id: formId },
  });
  expect(
    (await update(6, { action: "delete", id: field.id, kind: "field" })).status
  ).toBe(409);
  await prisma.form.update({
    data: { status: "draft" },
    where: { id: formId },
  });
});

test("Excel upload and preview routes are unavailable", async () => {
  const upload = new FormData();
  upload.set("title", "Rejected Excel upload");
  upload.set("source", "upload");
  upload.set("documentKind", "xlsx");
  upload.set(
    "template",
    new File([blankSpreadsheet()], "template.xlsx", { type: XLSX_CONTENT_TYPE })
  );
  const response = await app.handle(
    new Request("http://test.local/api/admin/forms", {
      body: upload,
      headers: { Authorization: `Bearer ${bearer}` },
      method: "POST",
    })
  );
  expect(response.status).toBe(400);
  expect(
    (await request(`/api/admin/forms/${publicId}/spreadsheet-preview`, bearer))
      .status
  ).toBe(404);
  expect(
    (await request("/api/spreadsheet-previews/removed/editor-config", bearer))
      .status
  ).toBe(404);
});

test("Excel and DOCX field panels share supported autostart configuration", async () => {
  const response = await request(
    `/api/admin/forms/${publicId}/editor-config`,
    bearer
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    config: {
      documentType: string;
      editorConfig: { plugins: { autostart: string[] } };
    };
  };
  expect(payload.config.documentType).toBe("cell");
  expect(payload.config.editorConfig.plugins.autostart).toEqual([pluginGuid]);
  const docx = editorConfig(
    {
      action: "template-edit",
      capabilities: {},
      documentKey,
      documentKind: "docx",
      lease: {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        id: fixtureId,
        releaseUrl: "/release",
        renewUrl: "/renew",
      },
      publicId,
    },
    { id: adminId, name: "Admin" }
  ) as unknown as typeof payload;
  expect(docx.config.editorConfig.plugins.autostart).toEqual(
    payload.config.editorConfig.plugins.autostart
  );
  const manifest = await request("/onlyoffice-plugin/config.json", bearer);
  expect(await manifest.json()).toMatchObject({
    variations: [
      {
        EditorsSupport: ["word", "cell"],
        isActivated: true,
        type: "panelRight",
      },
    ],
  });
});

test("saved Excel templates export XLSX and PDF with admin authorization and actionable conversion errors", async () => {
  const xlsx = await request(
    `/api/admin/forms/${publicId}/template/xlsx`,
    bearer
  );
  expect(xlsx.status).toBe(200);
  expect(xlsx.headers.get("Content-Type")).toBe(XLSX_CONTENT_TYPE);
  expect(xlsx.headers.get("Content-Disposition")).toContain(
    `template-${publicId}.xlsx`
  );
  expect(unzipSync(new Uint8Array(await xlsx.arrayBuffer()))).toEqual(
    unzipSync(blankSpreadsheet())
  );
  const stagedKey = `tests/${fixtureId}/unsaved-stage.xlsx`;
  const staged = protectSpreadsheet(blankSpreadsheet(), {
    ...emptySpreadsheetBindings(),
    locations: {},
  });
  await putObject(stagedKey, staged, XLSX_CONTENT_TYPE);
  storedObjects.push(stagedKey);
  const stagedOperation = await prisma.operation.create({
    data: {
      actorId: adminId,
      documentKey,
      formId,
      metadata: {
        action: "save-template",
        finalObjectKey: `tests/${fixtureId}/uncommitted-final.xlsx`,
        formId,
        publicId,
        stagedObjectKey: stagedKey,
      },
      ownerUserId: adminId,
      status: "processing",
      targetId: templateId,
      targetType: "template_draft",
      type: "save_template_draft",
    },
  });
  const pdf = await request(
    `/api/admin/forms/${publicId}/template/pdf`,
    bearer
  );
  expect(pdf.status).toBe(200);
  expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
  expect(pdf.headers.get("Content-Disposition")).toContain(
    `template-${publicId}.pdf`
  );
  expect(unzipSync(exportSources.at(-1) as Uint8Array)).toEqual(
    unzipSync(blankSpreadsheet())
  );
  expect(exportKeys.at(-1)).not.toBe(documentKey);
  const expiredUrl = documentUrl(exportKeys.at(-1) ?? "missing");
  const expired = await app.handle(
    new Request(expiredUrl, {
      headers: {
        Authorization: createOnlyOfficeAuthorization({ url: expiredUrl }),
      },
    })
  );
  expect(expired.status).toBe(404);
  await prisma.operation.delete({ where: { id: stagedOperation.id } });
  expect(pdfKinds.at(-1)).toBe("xlsx");
  expect(
    (await request(`/api/admin/forms/${publicId}/template/xlsx`, userBearer))
      .status
  ).toBe(403);
  expect(
    (await request(`/api/admin/forms/${publicId}/template/pdf`, userBearer))
      .status
  ).toBe(403);
  expect(
    (await request(`/api/admin/forms/${publicId}/template/docx`, bearer)).status
  ).toBe(404);
  const failureApp = createApp({
    legacySso: null,
    omniRoute: null,
    onlyOffice: {
      convertDocxToPdf: () =>
        Promise.reject(new Error("test conversion failure")),
      forceSave: () => Promise.resolve(false),
    },
  });
  const failure = await failureApp.handle(
    new Request(`http://test.local/api/admin/forms/${publicId}/template/pdf`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  expect(failure.status).toBe(502);
  expect(await failure.json()).toMatchObject({
    error: "pdf_conversion_failed",
  });
  expect(
    (
      await prisma.templateDraft.findUniqueOrThrow({
        where: { id: templateId },
      })
    ).documentKey
  ).toBe(documentKey);
});

test("incomplete Excel drafts save without a builder; publishing reports immediate or actionable errors", async () => {
  const bindings = await spreadsheetDraftBindings(templateId);
  const incomplete = {
    ...bindings,
    table: {
      anchor: "folio_unfinished",
      columns: [],
      id: "folio_unfinished",
      key: "rows",
      label: "Rows",
    },
  };
  await replaceDraftFields(incomplete);
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Keep the action fixture beside its assertions.
  const action = async (
    name: string,
    token: string,
    liveReference: string | null = null
  ) => {
    const current = await spreadsheetDraftBindings(templateId);
    const spreadsheetAnchors = [
      ...current.fields.map((entry) => [entry.anchor, liveReference]),
      ...(current.table ? [[current.table.anchor, null]] : []),
    ];
    return app.handle(
      new Request(`http://test.local/api/admin/forms/${publicId}/${name}`, {
        body: JSON.stringify({ documentKey, spreadsheetAnchors }),
        headers: {
          "Content-Type": "application/json",
          "X-Editor-Capability": token,
        },
        method: "POST",
      })
    );
  };
  const denied = await action("publish", publishCapability);
  expect(denied.status).toBe(422);
  expect(await denied.json()).toMatchObject({
    error: "invalid_template",
  });
  expect(await prisma.operation.count({ where: { formId } })).toBe(0);
  await replaceDraftFields(bindings);
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- This polling helper belongs to the operation scenario.
  const poll = async (id: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Poll the previous operation state before retrying.
      const response = await request(`/api/operations/${id}`, bearer);
      // oxlint-disable-next-line no-await-in-loop -- Decode this poll before deciding whether to retry.
      const body = (await response.json()) as {
        operation: { status: string; error: string; errorMessage: string };
      };
      if (
        body.operation.status === "failed" ||
        body.operation.status === "completed"
      ) {
        return body.operation;
      }
      // oxlint-disable-next-line no-await-in-loop -- Bound polling and avoid a busy loop.
      await Bun.sleep(10);
    }
    throw new Error("Test operation did not finish");
  };
  const publish = await action("publish", publishCapability);
  expect(publish.status).toBe(202);
  const publishId = ((await publish.json()) as { operationId: string })
    .operationId;
  expect(await poll(publishId)).toMatchObject({
    error: "invalid_template",
    errorMessage: "Missing field binding: folio_name_anchor",
    status: "failed",
  });
  const publishOperation = await prisma.operation.findUniqueOrThrow({
    where: { id: publishId },
  });
  expect(
    Object.hasOwn(publishOperation.metadata as object, "spreadsheetState")
  ).toBe(false);
  const beforeStaleSave = await prisma.templateDraft.findUniqueOrThrow({
    where: { id: templateId },
  });
  const stale = await action("save", saveCapability, "'Form'!$E$5");
  expect(stale.status).toBe(202);
  const staleId = ((await stale.json()) as { operationId: string }).operationId;
  expect(await poll(staleId)).toMatchObject({
    error: "invalid_template",
    errorMessage:
      "ไฟล์ Excel ที่ได้รับยังไม่ตรงกับตำแหน่งช่องล่าสุด กรุณาเก็บหน้านี้ไว้แล้วลองบันทึกอีกครั้ง",
    status: "failed",
  });
  const afterStaleSave = await prisma.templateDraft.findUniqueOrThrow({
    where: { id: templateId },
  });
  expect(afterStaleSave.documentKey).toBe(beforeStaleSave.documentKey);
  expect(afterStaleSave.objectKey).toBe(beforeStaleSave.objectKey);
  expect(await spreadsheetDraftBindings(templateId)).toEqual(bindings);
  await replaceDraftFields(incomplete);
  nativeSnapshot = fixtureWorkbook({
    names: { folio_name_anchor: "Form!E5" },
  });
  nativeSnapshotUrl = new URL("/saved.xlsx", nativeServer.url).href;
  try {
    const saved = await action("save", saveCapability, "'Form'!$E$5");
    expect(saved.status).toBe(202);
    const saveId = ((await saved.json()) as { operationId: string })
      .operationId;
    expect(await poll(saveId)).toMatchObject({ status: "completed" });
    const draft = await prisma.templateDraft.findUniqueOrThrow({
      where: { id: templateId },
    });
    storedObjects.push(draft.objectKey);
    expect(draft.documentKey).not.toBe(documentKey);
    expect(await spreadsheetDraftBindings(templateId)).toEqual(incomplete);
    const reopened = readSpreadsheetWorkbook(await readObject(draft.objectKey));
    expect(reopened.names.get("folio_name_anchor")).toMatchObject({
      firstColumn: 4,
      firstRow: 4,
      sheet: "Form",
    });
    expect(reopened.names.has("folio_unfinished")).toBe(false);
  } finally {
    nativeSnapshotUrl = null;
    nativeSnapshot = null;
  }
});

test("Excel receipts, selected revisions, downloads and viewers use the spreadsheet contract and format", async () => {
  const resultFormId = crypto.randomUUID();
  const resultPublicId = crypto.randomUUID().replaceAll("-", "");
  const publishedId = crypto.randomUUID();
  const responseId = crypto.randomUUID();
  const submissionId = crypto.randomUUID();
  const workbook = protectSpreadsheet(blankSpreadsheet(), {
    ...emptySpreadsheetBindings(),
    locations: {},
  });
  const artifactKey = `tests/${fixtureId}/result.xlsx`;
  await putObject(artifactKey, workbook, XLSX_CONTENT_TYPE);
  storedObjects.push(artifactKey);
  const contract = {
    ...emptySpreadsheetBindings(),
    fields: [
      {
        anchor: "folio_root_value",
        computed: false,
        id: "folio_root_value",
        key: "value",
        label: "Root value",
        options: [],
        placeholder: null,
        prefillPointer: null,
        prefillPolicy: "editable" as const,
        required: false,
        type: "number" as const,
      },
    ],
    locations: {},
    table: {
      anchor: "folio_body",
      columns: [
        {
          computed: false,
          id: "folio_value",
          key: "value",
          label: "Value",
          offset: 0,
          options: [],
          placeholder: null,
          required: false,
          type: "number" as const,
        },
      ],
      id: "folio_rows",
      key: "rows",
      label: "Rows",
    },
  };
  await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id: resultFormId,
      publicId: resultPublicId,
      publishedTemplate: {
        create: {
          contentHash: "fixture",
          documentKey: `published-${resultFormId}`,
          id: publishedId,
          manifest: {
            create: {
              configurationHash: "fixture",
              fields: {
                create: spreadsheetManifestFieldData({
                  fields: contract.fields,
                  table: contract.table,
                  version: contract.version,
                }),
              },
            },
          },
          objectKey: artifactKey,
          version: 1,
        },
      },
      status: "published",
      title: "Excel results",
      version: 1,
    },
  });
  const publicForm = await request(`/api/forms/${resultPublicId}`);
  expect(await publicForm.json()).toMatchObject({
    form: { documentKind: "xlsx", fillMethod: "onlyoffice" },
  });
  const templateXlsx = await request(
    `/api/admin/forms/${resultPublicId}/template/xlsx`,
    bearer
  );
  expect(templateXlsx.status).toBe(200);
  expect([...new Uint8Array(await templateXlsx.arrayBuffer())]).toEqual([
    ...workbook,
  ]);
  expect(
    (await request(`/api/admin/forms/${resultPublicId}/template/pdf`, bearer))
      .status
  ).toBe(200);
  const duplicateResponse = await app.handle(
    new Request(
      `http://test.local/api/admin/forms/${resultPublicId}/duplicate`,
      {
        body: "{}",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    )
  );
  expect(duplicateResponse.status).toBe(200);
  const duplicateBody = (await duplicateResponse.json()) as {
    form: { publicId: string };
  };
  const duplicate = await prisma.form.findUniqueOrThrow({
    include: { templateDraft: true },
    where: { publicId: duplicateBody.form.publicId },
  });
  expect(duplicate.templateDraft).not.toBeNull();
  if (!duplicate.templateDraft) {
    throw new Error("Missing duplicated draft");
  }
  expect(
    await prisma.draftFieldRule.count({
      where: { templateDraftId: duplicate.templateDraft.id },
    })
  ).toBe(3);
  expect(await spreadsheetDraftBindings(duplicate.templateDraft.id)).toEqual({
    fields: contract.fields,
    table: contract.table,
    version: contract.version,
  });
  const sharedResultRows = await prisma.manifestField.findMany({
    orderBy: { position: "asc" },
    where: { manifest: { publishedTemplateId: publishedId } },
  });
  expect(sharedResultRows.map(({ tag, type }) => ({ tag, type }))).toEqual([
    { tag: "value", type: "number" },
    { tag: "rows", type: "table" },
    { tag: "rows.value", type: "number" },
  ]);
  const duplicateBytes = await readObject(duplicate.templateDraft.objectKey);
  const duplicateWorkbook = readSpreadsheetWorkbook(duplicateBytes);
  const decode = new TextDecoder();
  expect(
    decode.decode(duplicateWorkbook.archive[duplicateWorkbook.sheetPath])
  ).not.toContain("sheetProtection");
  expect(
    decode.decode(duplicateWorkbook.archive["xl/workbook.xml"])
  ).not.toContain("workbookProtection");
  expect(duplicate.templateDraft.contentHash).toBe(contentHash(duplicateBytes));
  expect(await readObject(artifactKey)).toEqual(workbook);
  storedObjects.push(duplicate.templateDraft.objectKey);
  await prisma.form.delete({ where: { id: duplicate.id } });
  const formDetail = await request(
    `/api/admin/forms/${resultPublicId}`,
    bearer
  );
  expect(formDetail.status).toBe(200);
  expect(await formDetail.json()).toMatchObject({
    form: {
      documentKind: "xlsx",
      nativeFillAvailable: false,
      status: "published",
    },
  });
  const nativeMethod = await app.handle(
    new Request(`http://test.local/api/admin/forms/${resultPublicId}`, {
      body: JSON.stringify({ fillMethod: "native" }),
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    })
  );
  expect(nativeMethod.status).toBe(409);
  expect(await nativeMethod.json()).toMatchObject({
    error: "native_fill_unsupported",
  });
  await prisma.response.create({
    data: {
      draftData: { rows: [{ value: 0 }, { value: 12 }] },
      draftDocumentKey: `draft-${responseId}`,
      draftObjectKey: artifactKey,
      formId: resultFormId,
      id: responseId,
      publishedTemplateId: publishedId,
      publishedVersion: 1,
      status: "draft",
      userId,
    },
  });
  await prisma.submission.create({
    data: {
      data: { rows: [{ value: 0 }] },
      documentKey: `submission-${submissionId}`,
      formId: resultFormId,
      id: submissionId,
      objectKey: artifactKey,
      responseId,
      userId,
    },
  });
  const receipt = await request(`/api/submissions/${submissionId}/data`);
  expect(receipt.status).toBe(200);
  expect(await receipt.json()).toMatchObject({
    data: { rows: [{ value: 0 }] },
    documentKind: "xlsx",
    spreadsheetContract: contract,
  });
  const exportFile = await request(`/api/submissions/${submissionId}/xlsx`);
  expect(exportFile.status).toBe(200);
  expect(exportFile.headers.get("content-type")).toBe(XLSX_CONTENT_TYPE);
  expect([...new Uint8Array(await exportFile.arrayBuffer())]).toEqual([
    ...workbook,
  ]);
  expect((await request(`/api/submissions/${submissionId}/docx`)).status).toBe(
    404
  );
  expect((await request(`/api/submissions/${submissionId}/pdf`)).status).toBe(
    200
  );
  expect(pdfKinds.at(-1)).toBe("xlsx");
  const draftFile = await request(`/api/responses/${responseId}/draft/xlsx`);
  expect(draftFile.status).toBe(200);
  expect(draftFile.headers.get("content-type")).toBe(XLSX_CONTENT_TYPE);
  expect(
    (await request(`/api/responses/${responseId}/draft/docx`)).status
  ).toBe(404);
  expect((await request(`/api/responses/${responseId}/draft/pdf`)).status).toBe(
    200
  );
  expect(pdfKinds.at(-1)).toBe("xlsx");
  const result = await request(`/api/admin/results/${responseId}`, bearer);
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    result: {
      data: { rows: [{ value: 0 }, { value: 12 }] },
      documentKind: "xlsx",
      spreadsheetContract: contract,
    },
  });
  const viewer = await request(
    `/api/admin/results/${responseId}/viewer-config`,
    bearer
  );
  expect(viewer.status).toBe(200);
  expect(await viewer.json()).toMatchObject({
    config: { document: { fileType: "xlsx" }, documentType: "cell" },
  });
  await prisma.response.update({
    data: {
      draftData: Prisma.DbNull,
      draftDocumentKey: null,
      draftObjectKey: null,
      status: "submitted",
    },
    where: { id: responseId },
  });
  await prisma.correction.create({
    data: {
      actorId: adminId,
      changedData: { rows: [{ value: 25 }] },
      data: { rows: [{ value: 25 }] },
      documentKey: `correction-${responseId}`,
      objectKey: artifactKey,
      reason: "Correct number",
      responseId,
      revision: 1,
      submissionId,
    },
  });
  const corrected = await request(`/api/submissions/${submissionId}/data`);
  expect(await corrected.json()).toMatchObject({
    data: { rows: [{ value: 25 }] },
    revision: 1,
  });
  const original = await request(
    `/api/submissions/${submissionId}/data?revision=original`
  );
  expect(await original.json()).toMatchObject({
    data: { rows: [{ value: 0 }] },
    revision: 0,
  });
  // Field data and historical table headings remain readable without the artifact.
  await deleteObject(artifactKey);
  const missingArtifactReceipt = await request(
    `/api/submissions/${submissionId}/data?revision=original`
  );
  expect(missingArtifactReceipt.status).toBe(200);
  expect(await missingArtifactReceipt.json()).toMatchObject({
    data: { rows: [{ value: 0 }] },
    spreadsheetContract: contract,
  });
  const missingArtifactResult = await request(
    `/api/admin/results/${responseId}`,
    bearer
  );
  expect(missingArtifactResult.status).toBe(200);
  expect(await missingArtifactResult.json()).toMatchObject({
    result: {
      data: { rows: [{ value: 25 }] },
      spreadsheetContract: contract,
    },
  });
});

test("publication freezes shared Excel fields, preserves scoped keys and Prefill, and rejects stale revisions", async () => {
  const publishFormId = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  const bindings: SpreadsheetBindings = {
    fields: [
      {
        ...field,
        options: ["A", "B"],
        prefillPointer: "/person/name",
        prefillPolicy: "lock_when_available",
        required: true,
        type: "dropdown",
      },
    ],
    table: {
      anchor: "folio_body",
      columns: [
        {
          computed: false,
          id: "folio_column_name",
          key: "name",
          label: "Numeric name",
          offset: 0,
          options: [],
          placeholder: null,
          required: true,
          type: "number",
        },
      ],
      id: "folio_rows",
      key: "rows",
      label: "Rows",
    },
    version: 1,
  };
  const draftDocumentKey = `shared-publish-${publishFormId}`;
  await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id: publishFormId,
      publicId: crypto.randomUUID().replaceAll("-", ""),
      templateDraft: {
        create: {
          bindingRevision: 2,
          documentKey: draftDocumentKey,
          fieldRules: { create: spreadsheetDraftFieldData(bindings) },
          id: draftId,
          objectKey: `tests/${fixtureId}/${publishFormId}/draft.xlsx`,
        },
      },
      title: "Shared publication fixture",
    },
  });
  const metadata: OperationMetadata = {
    action: "publish",
    bindingRevision: 1,
    documentKind: "xlsx",
    finalObjectKey: `tests/${fixtureId}/${publishFormId}/published.xlsx`,
    formId: publishFormId,
    publishedKey: `published-${publishFormId}`,
    publishedVersion: 1,
    stagedObjectKey: `tests/${fixtureId}/${publishFormId}/staged.xlsx`,
  };
  const operation = await prisma.operation.create({
    data: {
      actorId: adminId,
      documentKey: draftDocumentKey,
      formId: publishFormId,
      metadata: metadata as unknown as Prisma.InputJsonValue,
      status: "processing",
      targetId: draftId,
      targetType: "template_draft",
      type: "publish_form",
    },
  });
  const workbook = fixtureWorkbook({
    cells: [],
    merges: [],
    names: {
      folio_body: "'Form'!$A$4:$A$8",
      folio_name_anchor: "'Form'!$A$1",
    },
  });
  await expect(
    completePublishOperation(operation, metadata, workbook)
  ).rejects.toThrow("changed while publishing");
  expect(
    await prisma.publishedTemplate.count({ where: { formId: publishFormId } })
  ).toBe(0);
  metadata.bindingRevision = 2;
  await completePublishOperation(operation, metadata, workbook);
  const published = await prisma.publishedTemplate.findUniqueOrThrow({
    include: {
      manifest: { include: { fields: true } },
      prefillConfiguration: { include: { fields: true } },
    },
    where: { formId: publishFormId },
  });
  expect(await spreadsheetBindingsForTemplate(published.id)).toEqual(bindings);
  expect(published.prefillConfiguration?.fields).toHaveLength(1);
  expect(published.prefillConfiguration?.fields[0]).toMatchObject({
    pointer: "/person/name",
    policy: "lock_when_available",
    tag: "name",
  });
  expect(published.manifest?.fields).toHaveLength(3);
  const completed = await prisma.operation.findUniqueOrThrow({
    where: { id: operation.id },
  });
  expect(completed.status).toBe("completed");
  expect(Object.hasOwn(completed.metadata as object, "spreadsheetState")).toBe(
    false
  );
  await prisma.draftFieldRule.update({
    data: { label: "Changed draft label", required: false },
    where: { templateDraftId_tag: { tag: "name", templateDraftId: draftId } },
  });
  const changedDraft = await spreadsheetDraftBindings(draftId);
  expect(changedDraft.fields[0]).toMatchObject({
    label: "Changed draft label",
    required: false,
  });
  expect(await spreadsheetBindingsForTemplate(published.id)).toEqual(bindings);
  await expect(
    completePublishOperation(operation, metadata, workbook)
  ).rejects.toThrow("Published Template already exists");
  await prisma.operation.delete({ where: { id: operation.id } });
});
