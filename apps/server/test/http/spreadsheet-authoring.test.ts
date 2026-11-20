// oxlint-disable unicorn/no-await-expression-member -- Keep sequential HTTP assertions adjacent to their request.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { Prisma, prisma } from "@onlyoffice/db";
import { unzipSync } from "fflate";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import { contentHash } from "../../src/digests";
import { templateArchiveText } from "../../src/documents/package";
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
  attachmentCategoryPopupGuid,
  documentUrl,
  editorConfig,
  pluginGuid,
  readOnlyViewerConfig,
  xlsxEditorOpening,
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
let draftLeaseId = "";
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
  prefillPolicy: "editable" as const,
  required: false,
  type: "text" as const,
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

const update = (revision: number, change: unknown, key = documentKey) =>
  bindingRequest("PATCH", { change, documentKey: key, revision });

const request = (path: string, token = userBearer) =>
  app.handle(
    new Request(`http://test.local${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
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
  draftLeaseId = lease.id;
  const scope = {
    documentKey,
    documentServerKey: xlsxEditorOpening(documentKey, identity.sessionId)
      .documentServerKey,
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
    scope,
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
    documentKey,
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

  const rejected = await update(0, {
    action: "upsert",
    kind: "field",
    value: field,
  });
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toMatchObject({
    error: "xlsx_draft_upgrade_required",
  });
  expect(
    await bindingRequest("GET").then((response) => response.json())
  ).toEqual({
    bindings: emptySpreadsheetBindings(),
    documentKey,
    revision: 0,
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

test("attachment popup assets reject reads from a foreign origin", async () => {
  expect(
    (
      await app.handle(
        new Request(
          "http://test.local/onlyoffice-plugin/attachment-category/config.json",
          {
            headers: { Origin: "https://forged.example" },
          }
        )
      )
    ).status
  ).toBe(403);
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

const poll = async (response: Response) => {
  expect(response.status).toBe(202);
  const { operationId } = (await response.json()) as { operationId: string };
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Poll the original admission, never resend it.
    const status = await request(`/api/operations/${operationId}`, bearer);
    // oxlint-disable-next-line no-await-in-loop -- Check the terminal response before retrying.
    const { operation } = (await status.json()) as {
      operation: { status: string; result?: unknown };
    };
    if (["failed", "completed"].includes(operation.status)) {
      return operation;
    }
    // oxlint-disable-next-line no-await-in-loop -- Bound polling and avoid a busy loop.
    await Bun.sleep(10);
  }
  throw new Error("Test operation did not finish");
};
test("a split draft stays readable; verified rebind commits, stale and failed repairs do not", async () => {
  const id = crypto.randomUUID();
  const slug = id.replaceAll("-", "");
  const objectKey = `tests/${fixtureId}/${id}.xlsx`;
  const bytes = fixtureWorkbook({
    cells: [],
    merges: [],
    names: { [field.anchor]: "#REF!" },
  });
  await putObject(objectKey, bytes, XLSX_CONTENT_TYPE);
  storedObjects.push(objectKey);
  const form = await prisma.form.create({
    data: {
      createdBy: adminId,
      documentKind: "xlsx",
      publicId: slug,
      templateDraft: {
        create: {
          contentHash: contentHash(bytes),
          documentKey: `xlsx-repair-${id}`,
          fieldRules: {
            createMany: {
              data: spreadsheetDraftFieldData({
                ...emptySpreadsheetBindings(),
                fields: [field],
              }),
            },
          },
          objectKey,
        },
      },
      title: "Split Excel draft",
    },
  });
  const path = `/api/admin/forms/${slug}`;
  try {
    const config = await request(`${path}/editor-config`, bearer);
    expect(config.status).toBe(200);
    const configBody = (await config.json()) as {
      bridge: {
        documentKey: string;
        capabilities: { "save-template": string };
      };
      config: {
        editorConfig: { plugins: { options: Record<string, unknown> } };
      };
    };
    const {
      bridge,
      config: { editorConfig: nativeConfig },
    } = configBody;
    expect(nativeConfig.plugins.options[pluginGuid]).toMatchObject({
      xlsxDraftIssues: [
        { bindingId: field.id, code: "missing_or_broken_anchor" },
      ],
    });
    const duplicate = await app.handle(
      new Request(`http://test.local${path}/duplicate`, {
        body: "{}",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );
    expect(duplicate.status).toBe(422);
    expect(await duplicate.json()).toMatchObject({
      error: "xlsx_draft_needs_repair",
    });
    const download = await request(`${path}/template/xlsx`, bearer);
    expect(download.status).toBe(200);
    expect(contentHash(new Uint8Array(await download.arrayBuffer()))).toBe(
      contentHash(bytes)
    );
    const candidate: SpreadsheetBindings = {
      ...emptySpreadsheetBindings(),
      fields: [field],
    };
    const repair = (draftKey: string, saveToken: string, address: string) =>
      app.handle(
        new Request(`http://test.local${path}/save`, {
          body: JSON.stringify({
            documentKey: draftKey,
            spreadsheetAnchors: [[field.anchor, `Form!${address}`]],
            xlsxDraft: {
              bindings: candidate,
              checkpoint: crypto.randomUUID(),
              revision: 0,
              version: 1,
            },
          }),
          headers: {
            "Content-Type": "application/json",
            "X-Editor-Capability": saveToken,
          },
          method: "POST",
        })
      );
    nativeSnapshot = fixtureWorkbook({ cells: [], merges: [], names: {} });
    nativeSnapshotUrl = new URL("/repair.xlsx", nativeServer.url).href;
    expect(
      await poll(
        await repair(
          bridge.documentKey,
          bridge.capabilities["save-template"],
          "E5"
        )
      )
    ).toMatchObject({
      status: "failed",
    });
    const savedDownload = await request(`${path}/template/xlsx`, bearer);
    expect(contentHash(new Uint8Array(await savedDownload.arrayBuffer()))).toBe(
      contentHash(bytes)
    );
    nativeSnapshot = fixtureWorkbook({
      cells: [],
      merges: [],
      names: { [field.anchor]: "Form!E5" },
    });
    expect(
      await poll(
        await repair(
          bridge.documentKey,
          bridge.capabilities["save-template"],
          "E5"
        )
      )
    ).toMatchObject({
      result: { bindingRevision: 1, bindings: candidate },
      status: "completed",
    });
    const repaired = await request(`${path}/editor-config`, bearer);
    const current = (await repaired.json()) as typeof configBody;
    expect(
      current.config.editorConfig.plugins.options[pluginGuid]
    ).toMatchObject({ xlsxDraftIssues: [] });
    const stale = await repair(
      current.bridge.documentKey,
      current.bridge.capabilities["save-template"],
      "E6"
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: "stale_document" });
    const repairedDownload = await request(`${path}/template/xlsx`, bearer);
    expect(
      readSpreadsheetWorkbook(
        new Uint8Array(await repairedDownload.arrayBuffer())
      ).names.get(field.anchor)
    ).toMatchObject({
      firstColumn: 4,
      firstRow: 4,
    });
    const draft = await prisma.templateDraft.findUniqueOrThrow({
      where: { formId: form.id },
    });
    storedObjects.push(draft.objectKey);
  } finally {
    nativeSnapshotUrl = null;
    nativeSnapshot = null;
    await prisma.operation.deleteMany({ where: { formId: form.id } });
    await prisma.form.delete({ where: { id: form.id } });
  }
});

const table: NonNullable<SpreadsheetBindings["table"]> = {
  anchor: "folio_rows_anchor",
  columns: [
    {
      computed: false,
      id: "folio_left",
      key: "left",
      label: "Left",
      offset: 0,
      options: [],
      placeholder: null,
      required: false,
      type: "text",
    },
    {
      computed: false,
      id: "folio_right",
      key: "right",
      label: "Right",
      offset: 1,
      options: [],
      placeholder: null,
      required: false,
      type: "text",
    },
  ],
  id: "folio_rows",
  key: "rows",
  label: "Rows",
};

test.each(
  [
    {
      label: "valid tracked draft",
      names: {
        folio_column_folio_left: "Form!A1:A2",
        folio_column_folio_right: "Form!B1:B2",
        folio_columns_folio_rows: "Form!A1:B2",
        folio_rows_anchor: "Form!A1:B2",
      },
      table,
    },
    {
      bindingId: table.id,
      code: "unbound",
      label: "intentionally unbound table",
      names: {},
      table: { ...table, unbound: true as const },
    },
    {
      bindingId: table.id,
      code: "missing_or_broken_anchor",
      label: "missing table anchor",
      names: {},
      table,
    },
    {
      bindingId: table.id,
      code: "untracked_columns",
      label: "same-width legacy table",
      names: { folio_rows_anchor: "Form!B1:C2" },
      table,
    },
    {
      bindingId: table.id,
      code: "ambiguous_columns",
      label: "two column names at the same slot",
      names: {
        folio_column_folio_left: "Form!A1:A2",
        folio_column_folio_right: "Form!A1:A2",
        folio_columns_folio_rows: "Form!A1:B2",
        folio_rows_anchor: "Form!A1:B2",
      },
      table,
    },
    {
      bindingId: field.id,
      code: "attachment_mismatch",
      fields: [field],
      label: "button marker at the wrong slot",
      names: {
        [field.anchor]: "Form!A1",
        [`_folio_upload_poc_${field.id}`]: "Form!B1",
      },
    },
    {
      bindingId: field.id,
      code: "validation_mismatch",
      fields: [{ ...field, type: "number" as const }],
      label: "missing number validation",
      names: { [field.anchor]: "Form!A1" },
    },
  ].map(({ bindingId, code, label, fields, names, table: fixtureTable }) => ({
    bindings: {
      ...emptySpreadsheetBindings(),
      fields: fields ?? [],
      table: fixtureTable ?? null,
    },
    duplicable: !code || code === "unbound",
    expected: code ? [{ bindingId, code }] : [],
    label,
    names: names as Record<string, string>,
  }))
)(
  "draft classification: $label",
  async ({ bindings, expected, names, duplicable }) => {
    const id = crypto.randomUUID();
    const slug = id.replaceAll("-", "");
    const objectKey = `tests/${fixtureId}/${id}.xlsx`;
    const bytes = fixtureWorkbook({ cells: [], merges: [], names });
    await putObject(objectKey, bytes, XLSX_CONTENT_TYPE);
    storedObjects.push(objectKey);
    const form = await prisma.form.create({
      data: {
        createdBy: adminId,
        documentKind: "xlsx",
        publicId: slug,
        templateDraft: {
          create: {
            contentHash: contentHash(bytes),
            documentKey: `xlsx-classification-${id}`,
            fieldRules: {
              createMany: { data: spreadsheetDraftFieldData(bindings) },
            },
            objectKey,
          },
        },
        title: "Classify Excel draft",
      },
    });
    try {
      const path = `/api/admin/forms/${slug}`;
      const config = await request(`${path}/editor-config`, bearer);
      expect(config.status).toBe(200);
      const {
        config: { editorConfig: nativeConfig },
      } = (await config.json()) as {
        config: {
          editorConfig: {
            plugins: { options: Record<string, { xlsxDraftIssues: unknown }> };
          };
        };
      };
      expect(nativeConfig.plugins.options[pluginGuid]?.xlsxDraftIssues).toEqual(
        expected
      );
      const duplicate = await app.handle(
        new Request(`http://test.local${path}/duplicate`, {
          body: "{}",
          headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        })
      );
      expect(duplicate.status).toBe(duplicable ? 200 : 422);
      if (duplicable) {
        const result = (await duplicate.json()) as {
          form: { publicId: string };
        };
        const copy = await prisma.form.delete({
          include: { templateDraft: true },
          where: { publicId: result.form.publicId },
        });
        if (copy.templateDraft) {
          storedObjects.push(copy.templateDraft.objectKey);
        }
      }
    } finally {
      await prisma.form.delete({ where: { id: form.id } });
    }
  }
);

test("frozen Excel draft commits a new workbook and rules together; lost capture leaves the old pair", async () => {
  const templatePath = `/api/admin/forms/${publicId}/template/xlsx`;
  const readSaved = async () => {
    const response = await request(templatePath, bearer);
    expect(response.status).toBe(200);
    return new Uint8Array(await response.arrayBuffer());
  };
  const action = (name: "save" | "publish", token: string, body: unknown) =>
    app.handle(
      new Request(`http://test.local/api/admin/forms/${publicId}/${name}`, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          "X-Editor-Capability": token,
        },
        method: "POST",
      })
    );
  const dateField = {
    ...field,
    anchor: "folio_date_anchor",
    id: "folio_date_anchor",
    key: "event_date",
    label: "Event date",
    type: "date" as const,
  };
  const candidate: SpreadsheetBindings = {
    ...emptySpreadsheetBindings(),
    fields: [
      { ...field, options: ["Updated choice"], type: "dropdown" },
      dateField,
    ],
    table: {
      anchor: "folio_unfinished",
      columns: [],
      id: "folio_unfinished",
      key: "rows",
      label: "Rows",
      unbound: true,
    },
  };
  const payload = (bindings: SpreadsheetBindings) => ({
    documentKey,
    spreadsheetAnchors: [
      [field.anchor, "'Form'!$E$5"],
      [dateField.anchor, "'Form'!$F$5"],
      [candidate.table?.anchor, null],
    ],
    xlsxDraft: {
      bindings,
      checkpoint: crypto.randomUUID(),
      revision: 0,
      version: 1,
    },
  });
  const oldBytes = await readSaved();
  const oldRules = await bindingRequest("GET").then((response) =>
    response.json()
  );
  const legacy = await action("save", saveCapability, {
    documentKey,
    spreadsheetAnchors: [],
  });
  expect(legacy.status).toBe(409);
  expect(await legacy.json()).toMatchObject({
    error: "xlsx_draft_upgrade_required",
  });
  const denied = await action("publish", publishCapability, payload(candidate));
  expect(denied.status).toBe(422);
  expect(await denied.json()).toMatchObject({ error: "invalid_template" });

  const rejected = await action("save", saveCapability, payload(candidate));
  expect(await poll(rejected)).toMatchObject({ status: "failed" });
  expect(
    await bindingRequest("GET").then((response) => response.json())
  ).toEqual(oldRules);
  expect(contentHash(await readSaved())).toBe(contentHash(oldBytes));

  nativeSnapshot = fixtureWorkbook({
    names: { folio_date_anchor: "Form!F5", folio_name_anchor: "Form!E5" },
  });
  nativeSnapshotUrl = new URL("/saved.xlsx", nativeServer.url).href;
  try {
    const input = payload(candidate);
    const saved = await action("save", saveCapability, input);
    const recovery = await app.handle(
      new Request(
        `http://test.local/api/admin/forms/${publicId}/xlsx-draft/recover`,
        {
          body: JSON.stringify({
            checkpoint: input.xlsxDraft.checkpoint,
            leaseId: draftLeaseId,
          }),
          headers: {
            "Content-Type": "application/json",
            "X-Editor-Capability": saveCapability,
          },
          method: "POST",
        }
      )
    );
    expect(recovery.status).toBe(200);
    const admitted = (await saved.clone().json()) as { operationId: string };
    expect(await recovery.json()).toMatchObject({
      action: "save-template",
      operationId: admitted.operationId,
    });
    const completion = await poll(saved);
    expect(completion).toMatchObject({
      result: { bindingRevision: 1, bindings: candidate },
      status: "completed",
    });
    const draft = await prisma.templateDraft.findUniqueOrThrow({
      where: { id: templateId },
    });
    storedObjects.push(draft.objectKey);
    expect(await spreadsheetDraftBindings(templateId)).toEqual(candidate);
    const savedBytes = await readSaved();
    expect(completion).toMatchObject({
      result: { contentHash: contentHash(savedBytes) },
    });
    const workbook = readSpreadsheetWorkbook(savedBytes);
    expect(workbook.names.get(field.anchor)).toMatchObject({
      firstColumn: 4,
      firstRow: 4,
      sheet: "Form",
    });
    expect(workbook.names.has("folio_unfinished")).toBe(false);
    const validations = templateArchiveText(
      workbook.archive,
      workbook.sheetPath
    );
    expect(validations).toContain('sqref="E5:E5" type="list"');
    expect(validations).toContain('sqref="F5:F5" type="date"');
    expect(
      templateArchiveText(workbook.archive, "xl/worksheets/folio-options.xml")
    ).toContain("Updated choice");
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
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  const lease = await claimEditorLease(
    identity,
    "template-draft",
    draftId,
    publishFormId
  );
  const metadata: OperationMetadata = {
    action: "publish",
    bindingRevision: 1,
    documentKind: "xlsx",
    finalObjectKey: `tests/${fixtureId}/${publishFormId}/published.xlsx`,
    formId: publishFormId,
    publishedKey: `published-${publishFormId}`,
    publishedVersion: 1,
    stagedObjectKey: `tests/${fixtureId}/${publishFormId}/staged.xlsx`,
    xlsxDraft: {
      baseContentHash: null,
      baseObjectKey: `tests/${fixtureId}/${publishFormId}/draft.xlsx`,
      bindings,
      checkpoint: crypto.randomUUID(),
      leaseId: lease.id,
      revision: 1,
      sessionId: identity.sessionId,
      version: 1,
    },
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
  if (!metadata.xlsxDraft) {
    throw new Error("Missing XLSX publish fixture");
  }
  metadata.xlsxDraft.revision = 2;
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

test("attachment category background scope is XLSX authoring-only and coexists with PDMS", () => {
  const base = {
    capabilities: {},
    documentKey,
    documentServerKey: xlsxEditorOpening(documentKey, "category-config-test")
      .documentServerKey,
    lease: {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      id: fixtureId,
      releaseUrl: "/release",
      renewUrl: "/renew",
    },
    publicId,
  };
  const user = { id: adminId, name: "Admin" };
  for (const action of ["template-edit", "fill", "correction"] as const) {
    for (const documentKind of ["xlsx", "docx"] as const) {
      for (const pdms of [false, true]) {
        const result = editorConfig(
          {
            ...base,
            action,
            documentKind,
            pdmsProjectEnabled: pdms,
            ...(pdms
              ? {
                  pdmsProjectCatalog: {
                    names: ["โครงการ"],
                    sessionId: fixtureId,
                    status: "ready" as const,
                  },
                }
              : {}),
          },
          user
        ) as {
          bridge: { attachmentCategoryPopup?: unknown };
          config: {
            editorConfig: {
              plugins: {
                autostart: string[];
                options: Record<string, unknown>;
              };
            };
          };
        };
        const expected = action === "template-edit" && documentKind === "xlsx";
        expect(Boolean(result.bridge.attachmentCategoryPopup)).toBe(expected);
        expect(
          result.config.editorConfig.plugins.autostart.includes(
            attachmentCategoryPopupGuid
          )
        ).toBe(expected);
        expect(
          Boolean(
            result.config.editorConfig.plugins.options[
              attachmentCategoryPopupGuid
            ]
          )
        ).toBe(expected);
      }
    }
  }
  const viewer = readOnlyViewerConfig(documentKey, publicId, user, "xlsx", {
    objectKey: `tests/${fixtureId}/read-only.xlsx`,
    publishedTemplateId: templateId,
  }) as {
    bridge?: { attachmentCategoryPopup?: unknown };
    config: { editorConfig: { plugins?: { autostart?: string[] } } };
  };
  expect(viewer.bridge?.attachmentCategoryPopup).toBeUndefined();
  expect(viewer.config.editorConfig.plugins?.autostart || []).not.toContain(
    attachmentCategoryPopupGuid
  );
});
