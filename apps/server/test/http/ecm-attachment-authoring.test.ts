// oxlint-disable unicorn/no-await-expression-member -- Keep sequential HTTP assertions adjacent to their requests, matching the existing HTTP suites.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import type { SpreadsheetBindings } from "../../src/documents/spreadsheets/contract";
import { processSpreadsheet } from "../../src/documents/spreadsheets/engine";
import { XLSX_CONTENT_TYPE } from "../../src/documents/spreadsheets/workbook";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import { spreadsheetDraftFieldData } from "../../src/forms/spreadsheet-fields";
import { putObject, deleteObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook, mutatePart } from "../spreadsheet-unit/fixture";

if (!process.env.DATABASE_URL) {
  throw new Error("ECM HTTP tests require an isolated PostgreSQL DATABASE_URL");
}

const fixtureId = crypto.randomUUID();
const formId = crypto.randomUUID();
const templateId = crypto.randomUUID();
const publicId = crypto.randomUUID().replaceAll("-", "");
const documentKey = `ecm-authoring-${fixtureId}`;
let adminId = "";
let bearer = "";
let capability = "";
let categoryStatus = 200;
let categoryNames = ["เอกสารประกอบ"];
let publishCapability = "";
const [proof] = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_proof",
      attachment: { category: null },
      id: "folio_proof",
      key: "attachment_1",
      label: "หลักฐาน",
      type: "text",
    },
  ],
  table: null,
  version: 1,
}).fields;
if (!proof) {
  throw new Error(
    "The attachment authoring fixture requires its declared proof Field"
  );
}
let snapshot = fixtureWorkbook({
  cells: [],
  merges: [],
  names: {
    _folio_upload_poc_folio_proof: "'Form'!$B$3",
    folio_number: "'Form'!$B$2",
    folio_proof: "'Form'!$B$3",
    folio_year: "'Form'!$B$1",
  },
});
const native = Bun.serve({
  fetch: () => new Response(snapshot),
  hostname: "127.0.0.1",
  port: 0,
});
const providerRequests: string[] = [];
const provider = Bun.serve({
  async fetch(request) {
    const { pathname } = new URL(request.url);
    providerRequests.push(`${request.method} ${pathname}`);
    if (pathname === "/api/beeecm/public/login") {
      expect(await request.json()).toEqual({
        password: "isolated-folio-service-password",
        username: `folio-${fixtureId}`,
      });
      return Response.json({
        data: {
          expire: new Date(Date.now() + 3_600_000).toISOString(),
          token: "isolated-provider-bearer-never-return-to-browser",
        },
      });
    }
    if (pathname === "/api/beeecm/public/document/category") {
      expect(request.headers.get("Authorization")).toBe(
        "Bearer isolated-provider-bearer-never-return-to-browser"
      );
      return Response.json(
        { data: categoryNames.map((type, id) => ({ id, type })) },
        { status: categoryStatus }
      );
    }
    return new Response(null, { status: 404 });
  },
  hostname: "127.0.0.1",
  port: 0,
});
const previousEnvironment = Object.fromEntries(
  [
    "ECM_API_URL",
    "ECM_USERNAME",
    "ECM_PASSWORD",
    "ECM_TOKEN_ENCRYPTION_KEY",
  ].map((key) => [key, process.env[key]])
);
process.env.ECM_API_URL = provider.url.origin;
process.env.ECM_USERNAME = `folio-${fixtureId}`;
process.env.ECM_PASSWORD = "isolated-folio-service-password";
process.env.ECM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
    forceSave: () => Promise.resolve({ url: native.url.href }),
  },
  onlyOfficeCallbackOrigins: [native.url.origin],
});
const jobBaseUrl = new URL(
  process.env.ONLYOFFICE_DOCUMENT_BASE_URL ?? "http://localhost:3000"
);
if (
  !jobBaseUrl.port ||
  jobBaseUrl.port === "3000" ||
  ![
    "localhost",
    "127.0.0.1",
    "host.docker.internal",
    "host.lima.internal",
  ].includes(jobBaseUrl.hostname)
) {
  throw new Error(
    "ECM authoring HTTP tests require ONLYOFFICE_DOCUMENT_BASE_URL on an explicit isolated local port other than 3000"
  );
}
// The real document builder fetches signed script/input URLs from this application.
app.listen({ hostname: "0.0.0.0", port: Number(jobBaseUrl.port) });

afterAll(async () => {
  await app.stop();
  await provider.stop(true);
  await native.stop(true);
  const published = await prisma.publishedTemplate.findUnique({
    select: { id: true },
    where: { formId },
  });
  // Published fixtures and their canonical objects remain in the disposable database, matching existing native workflow suites.
  if (!published) {
    const objects = await prisma.operation.findMany({
      select: { metadata: true },
      where: { formId },
    });
    await prisma.operation.deleteMany({ where: { formId } });
    await deleteObject(`tests/${fixtureId}/template.xlsx`);
    const objectKeys = objects.flatMap((operation) => {
      const metadata = operation.metadata as Record<string, unknown>;
      return ["stagedObjectKey", "finalObjectKey"]
        .map((key) => metadata[key])
        .filter((key): key is string => typeof key === "string");
    });
    await Promise.all(objectKeys.map(deleteObject));
    await prisma.editorLease.deleteMany({ where: { targetId: templateId } });
    await prisma.form.deleteMany({ where: { id: formId } });
    if (adminId) {
      await prisma.user.deleteMany({
        where: { formsCreated: { none: {} }, id: adminId },
      });
    }
  }
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
});

beforeAll(async () => {
  const password = "Isolated-authoring-fixture-2026!";
  const admin = await createCredentialFixture({
    email: `ecm-admin-${fixtureId}@example.test`,
    name: "Attachment Admin",
    password,
    role: "admin",
  });
  adminId = admin.id;
  bearer = await bearerFor(app, admin.email, password);
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
      title: "Attachment authoring",
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
  capability = actionEditorCapability(
    identity,
    { documentKey, formId, targetId: templateId, targetType: "template-draft" },
    "configure-fields",
    lease
  );
  publishCapability = actionEditorCapability(
    identity,
    { documentKey, formId, targetId: templateId, targetType: "template-draft" },
    "publish",
    lease
  );
  // Build a real native button fixture; a named marker alone is not a saved attachment control.
  snapshot = (
    await processSpreadsheet(snapshot, {
      bindings: { fields: [proof], table: null, version: 1 },
    })
  ).workbook;
  await putObject(
    `tests/${fixtureId}/template.xlsx`,
    snapshot,
    XLSX_CONTENT_TYPE
  );
});

test("Admin reads actual ECM category names through scoped Folio authoring without receiving service secrets", async () => {
  const response = await app.handle(
    new Request(
      `http://test.local/api/admin/forms/${publicId}/attachment-categories`,
      {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Editor-Capability": capability,
        },
      }
    )
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ categories: ["เอกสารประกอบ"] });
  expect(providerRequests).toEqual([
    "POST /api/beeecm/public/login",
    "GET /api/beeecm/public/document/category",
  ]);
});

const authoringRequest = (
  path: string,
  method = "GET",
  body?: unknown,
  token = capability,
  target = app
) =>
  target.handle(
    new Request(`http://test.local/api/admin/forms/${publicId}/${path}`, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "X-Editor-Capability": token,
      },
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
const upsert = async (value: unknown, kind = "field") => {
  const current = await authoringRequest("spreadsheet-bindings");
  const { revision } = (await current.json()) as { revision: number };
  return authoringRequest("spreadsheet-bindings", "PATCH", {
    change: { action: "upsert", kind, value },
    documentKey,
    revision,
  });
};
const operationResult = async (operationId: string) => {
  for (let poll = 0; poll < 3000; poll += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Observe this operation's prior state before polling again.
    const response = await app.handle(
      new Request(`http://test.local/api/operations/${operationId}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    // oxlint-disable-next-line no-await-in-loop -- Decode the current operation response before deciding whether to continue.
    const body = (await response.json()) as {
      operation: { status: string; error?: string; errorMessage?: string };
    };
    if (["completed", "failed"].includes(body.operation.status)) {
      return body.operation;
    }
    // The external document worker has its own clock; poll its terminal HTTP state instead of guessing a completion delay.
    // oxlint-disable-next-line no-await-in-loop -- The external worker cannot share this test process's deterministic clock.
    await Bun.sleep(20);
  }
  throw new Error("Publish operation did not settle through HTTP");
};

test("incomplete attachment Draft settings save; publication requires category and both scalar metadata Fields", async () => {
  expect((await upsert(proof)).status).toBe(200);
  const publish = await authoringRequest(
    "publish",
    "POST",
    { documentKey, spreadsheetAnchors: [["folio_proof", "'Form'!$B$3"]] },
    publishCapability
  );
  expect(publish.status).toBe(422);
  expect(await publish.json()).toMatchObject({
    error: "attachment_category_required",
  });
  expect(
    (await upsert({ ...proof, attachment: { category: "หมวดสมมติ" } })).status
  ).toBe(422);
  expect(
    (await upsert({ ...proof, attachment: { category: "เอกสารประกอบ" } }))
      .status
  ).toBe(200);
  const metadataMissing = await authoringRequest(
    "publish",
    "POST",
    { documentKey, spreadsheetAnchors: [["folio_proof", "'Form'!$B$3"]] },
    publishCapability
  );
  expect(metadataMissing.status).toBe(422);
  expect(await metadataMissing.json()).toMatchObject({
    error: "attachment_metadata_required",
  });
});

test("category outage and upstream rename preserve saved name, binding, Tag and required settings", async () => {
  categoryNames = ["หมวดชื่อใหม่"];
  expect((await authoringRequest("attachment-categories")).status).toBe(200);
  categoryStatus = 503;
  expect((await authoringRequest("attachment-categories")).status).toBe(503);
  const renamed = {
    ...proof,
    attachment: { category: "เอกสารประกอบ" },
    key: "supporting_document",
    required: true,
  };
  const saved = await upsert(renamed);
  expect(saved.status).toBe(200);
  const body = (await saved.json()) as { bindings: { fields: unknown[] } };
  expect(body.bindings.fields).toEqual([renamed]);
  expect(
    (await upsert({ ...renamed, attachment: { category: "ไม่เคยเลือก" } })).status
  ).toBe(422);
  expect(
    (await authoringRequest("attachment-categories", "GET", undefined, ""))
      .status
  ).toBe(401);
});

test("ordinary Field authoring remains usable with ECM unset and attachments cannot replace ordinary validation", async () => {
  const ordinary = createApp({ ecm: null, legacySso: null, omniRoute: null });
  expect(
    (
      await authoringRequest(
        "spreadsheet-bindings",
        "GET",
        undefined,
        capability,
        ordinary
      )
    ).status
  ).toBe(200);
  expect(
    (
      await authoringRequest(
        "attachment-categories",
        "GET",
        undefined,
        capability,
        ordinary
      )
    ).status
  ).toBe(503);
  expect((await upsert({ ...proof, type: "number" })).status).toBe(400);
  expect(
    (await upsert({ ...proof, prefillPointer: "/person/name" })).status
  ).toBe(400);
  expect(
    (
      await upsert({
        ...proof,
        anchor: "folio_plain",
        attachment: undefined,
        id: "folio_plain",
        key: "plain",
      })
    ).status
  ).toBe(200);
  expect(
    (
      await upsert({
        ...proof,
        anchor: "folio_collision",
        attachment: undefined,
        id: "folio_collision",
        key: "plain",
      })
    ).status
  ).toBe(409);
});

test("attachment column settings share one category across rows and retain column binding after Tag and required changes", async () => {
  categoryStatus = 200;
  categoryNames = ["เอกสารประกอบ", "หมวดคอลัมน์"];
  expect((await authoringRequest("attachment-categories")).status).toBe(200);
  const table = {
    anchor: "folio_items",
    columns: [
      {
        attachment: { category: "หมวดคอลัมน์" },
        computed: false,
        id: "folio_evidence",
        key: "evidence",
        label: "หลักฐานรายแถว",
        offset: 0,
        options: [],
        placeholder: null,
        required: false,
        type: "text",
      },
    ],
    id: "folio_items",
    key: "items",
    label: "รายการ",
  };
  expect((await upsert(table, "table")).status).toBe(200);
  categoryStatus = 503;
  const column = { ...table.columns[0], key: "documents", required: true };
  const changed = await upsert(column, "column");
  expect(changed.status).toBe(200);
  const payload = (await changed.json()) as {
    bindings: { table: { columns: unknown[] } };
    revision: number;
  };
  expect(payload.bindings.table.columns).toEqual([column]);
  expect(
    (
      await authoringRequest("spreadsheet-bindings", "PATCH", {
        change: { action: "delete", id: table.id, kind: "table" },
        documentKey,
        revision: payload.revision,
      })
    ).status
  ).toBe(200);
});

test("complete saved categories publish offline without User metadata values and the published contract cannot change", async () => {
  const current = await authoringRequest("spreadsheet-bindings");
  const { revision } = (await current.json()) as { revision: number };
  expect(
    (
      await authoringRequest("spreadsheet-bindings", "PATCH", {
        change: { action: "delete", id: "folio_plain", kind: "field" },
        documentKey,
        revision,
      })
    ).status
  ).toBe(200);
  for (const [id, key] of [
    ["folio_year", "fiscal_year"],
    ["folio_number", "docs_number"],
  ]) {
    expect(
      // oxlint-disable-next-line no-await-in-loop -- Each Field PATCH consumes the previous revision.
      (await upsert({ ...proof, anchor: id, attachment: undefined, id, key }))
        .status
    ).toBe(200);
  }
  expect((await upsert({ ...proof, attachment: undefined })).status).toBe(200);
  const unconfigured = await authoringRequest(
    "publish",
    "POST",
    {
      documentKey,
      spreadsheetAnchors: [
        ["folio_proof", "'Form'!$B$3"],
        ["folio_year", "'Form'!$B$1"],
        ["folio_number", "'Form'!$B$2"],
      ],
    },
    publishCapability
  );
  expect(unconfigured.status).toBe(202);
  const unconfiguredBody = (await unconfigured.json()) as {
    operationId: string;
  };
  expect(await operationResult(unconfiguredBody.operationId)).toMatchObject({
    error: "invalid_template",
    status: "failed",
  });
  expect(
    (
      await upsert({
        ...proof,
        attachment: { category: "เอกสารประกอบ" },
        key: "supporting_document",
        required: true,
      })
    ).status
  ).toBe(200);
  const nativeSettings = await authoringRequest("spreadsheet-bindings");
  const nativeSettingsBody = (await nativeSettings.json()) as {
    bindings: unknown;
  };
  // The editor fixture applies the renamed Tag to actual native OLE metadata before its callback snapshot.
  snapshot = (
    await processSpreadsheet(snapshot, {
      bindings: spreadsheetBindingSchema.parse(nativeSettingsBody.bindings),
    })
  ).workbook;
  const beforeRequests = providerRequests.length;
  const published = await authoringRequest(
    "publish",
    "POST",
    {
      documentKey,
      spreadsheetAnchors: [
        ["folio_proof", "'Form'!$B$3"],
        ["folio_year", "'Form'!$B$1"],
        ["folio_number", "'Form'!$B$2"],
      ],
    },
    publishCapability
  );
  expect(published.status).toBe(202);
  const { operationId } = (await published.json()) as { operationId: string };
  const outcome = await operationResult(operationId);
  expect(outcome).toMatchObject({ status: "completed" });
  expect(providerRequests.length).toBe(beforeRequests);
  const frozen = await authoringRequest("spreadsheet-bindings", "PATCH", {
    change: { action: "upsert", kind: "field", value: proof },
    documentKey,
    revision: 0,
  });
  expect(frozen.status).toBe(409);
  expect(await frozen.json()).toMatchObject({ error: "published_immutable" });
  const visible = await app.handle(
    new Request(`http://test.local/api/forms/${publicId}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  expect(visible.status).toBe(200);
  expect(await visible.json()).toMatchObject({ form: { published: true } });
}, 120_000);

const isolatedPublication = async (
  workbook: Uint8Array,
  bindings: SpreadsheetBindings,
  spreadsheetAnchors: [string, string][]
) => {
  const ownFormId = crypto.randomUUID();
  const ownTemplateId = crypto.randomUUID();
  const ownPublicId = crypto.randomUUID().replaceAll("-", "");
  const ownDocumentKey = `ole-proof-${ownFormId}`;
  const ownObjectKey = `tests/${fixtureId}/${ownFormId}/template.xlsx`;
  const snapshotProvider = Bun.serve({
    fetch: () => new Response(workbook),
    hostname: "127.0.0.1",
    port: 0,
  });
  const ownApp = createApp({
    ecm: null,
    legacySso: null,
    omniRoute: null,
    onlyOffice: {
      convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
      forceSave: () => Promise.resolve({ url: snapshotProvider.url.href }),
    },
    onlyOfficeCallbackOrigins: [snapshotProvider.url.origin],
  });
  try {
    await putObject(ownObjectKey, workbook, XLSX_CONTENT_TYPE);
    await prisma.form.create({
      data: {
        createdBy: adminId,
        documentKind: "xlsx",
        id: ownFormId,
        publicId: ownPublicId,
        templateDraft: {
          create: {
            documentKey: ownDocumentKey,
            fieldRules: { create: spreadsheetDraftFieldData(bindings) },
            id: ownTemplateId,
            objectKey: ownObjectKey,
          },
        },
        title: "Isolated native OLE publication regression",
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
      ownTemplateId,
      ownFormId
    );
    const publish = actionEditorCapability(
      identity,
      {
        documentKey: ownDocumentKey,
        formId: ownFormId,
        targetId: ownTemplateId,
        targetType: "template-draft",
      },
      "publish",
      lease
    );
    const response = await ownApp.handle(
      new Request(`http://test.local/api/admin/forms/${ownPublicId}/publish`, {
        body: JSON.stringify({
          documentKey: ownDocumentKey,
          spreadsheetAnchors,
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Editor-Capability": publish,
        },
        method: "POST",
      })
    );
    expect(response.status).toBe(202);
    const { operationId } = (await response.json()) as { operationId: string };
    const operation = await operationResult(operationId);
    const visible = await ownApp.handle(
      new Request(`http://test.local/api/forms/${ownPublicId}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    return { operation, visibleStatus: visible.status };
  } finally {
    await snapshotProvider.stop(true);
    const published = await prisma.publishedTemplate.findUnique({
      select: { id: true },
      where: { formId: ownFormId },
    });
    if (!published) {
      await prisma.operation.deleteMany({ where: { formId: ownFormId } });
      await prisma.editorLease.deleteMany({
        where: { targetId: ownTemplateId },
      });
      await prisma.form.deleteMany({ where: { id: ownFormId } });
      await deleteObject(ownObjectKey);
    }
  }
};

test("surviving managed PoC OLE without its marker cannot publish an ordinary Field", async () => {
  const scalarId = "folio_mvj7xgp7_sovzddfj";
  // Captured native OLE bytes cross the actual package validator, not a fabricated metadata echo.
  const captured = new Uint8Array(
    await Bun.file(
      new URL(
        "../../../../.scratch/excel-attachment-button/evidence/attachment-buttons-poc.xlsx",
        import.meta.url
      )
    ).arrayBuffer()
  );
  const orphaned = mutatePart(captured, "xl/workbook.xml", (xml) => {
    const changed = xml.replaceAll(
      /<definedName\b[^>]*name="_folio_upload_poc_[^"]*"[^>]*>[\s\S]*?<\/definedName>/gu,
      ""
    );
    expect(changed).not.toContain("_folio_upload_poc_");
    return changed;
  });
  const ordinaryBindings = spreadsheetBindingSchema.parse({
    fields: [
      {
        anchor: scalarId,
        id: scalarId,
        key: "attachment",
        label: "Ordinary text",
        type: "text",
      },
    ],
    table: null,
    version: 1,
  });
  const result = await isolatedPublication(orphaned, ordinaryBindings, [
    [scalarId, "'Form'!$B$3"],
  ]);
  expect(result.operation).toMatchObject({
    error: "invalid_template",
    status: "failed",
  });
  expect(result.visibleStatus).toBe(404);
}, 120_000);

test.each(["missing", "duplicate"] as const)(
  "declared attachment with %s actual native control proof cannot publish",
  async (controlState) => {
    const bindings = spreadsheetBindingSchema.parse({
      fields: [
        { ...proof, attachment: { category: "เอกสารประกอบ" } },
        {
          ...proof,
          anchor: "folio_year",
          attachment: undefined,
          id: "folio_year",
          key: "fiscal_year",
        },
        {
          ...proof,
          anchor: "folio_number",
          attachment: undefined,
          id: "folio_number",
          key: "docs_number",
        },
      ],
      table: null,
      version: 1,
    });
    let workbook = fixtureWorkbook({
      cells: [],
      merges: [],
      names: {
        _folio_upload_poc_folio_proof: "'Form'!$B$3",
        folio_number: "'Form'!$B$2",
        folio_proof: "'Form'!$B$3",
        folio_year: "'Form'!$B$1",
      },
    });
    if (controlState === "duplicate") {
      const nativeFixture = await processSpreadsheet(workbook, { bindings });
      workbook = mutatePart(
        nativeFixture.workbook,
        "xl/worksheets/sheet1.xml",
        (xml) => {
          let found = false;
          const duplicate = xml.replace(
            /<oleObject\b[^>]*>[\s\S]*?<\/oleObject>/u,
            (object) => {
              found = true;
              return object + object;
            }
          );
          expect(found).toBe(true);
          return duplicate;
        }
      );
    }
    const result = await isolatedPublication(workbook, bindings, [
      ["folio_proof", "'Form'!$B$3"],
      ["folio_year", "'Form'!$B$1"],
      ["folio_number", "'Form'!$B$2"],
    ]);
    expect(result.operation).toMatchObject({
      error: "invalid_template",
      status: "failed",
    });
    expect(result.visibleStatus).toBe(404);
  },
  120_000
);
