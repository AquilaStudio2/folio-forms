// oxlint-disable no-await-in-loop no-loop-func -- Each catalog race settles its native callback and restores the shared Form before the next request.
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
import {
  spreadsheetDraftFieldData,
  spreadsheetManifestFieldData,
} from "../../src/forms/spreadsheet-fields";
import { xlsxEditorOpening } from "../../src/onlyoffice";
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
const storageTemplateId: string = crypto.randomUUID();
const templateChoice = {
  category: null,
  document_category_id: 0,
  mode: "template" as const,
  storage_template_id: storageTemplateId,
  template_name: `authoring-${fixtureId}`,
};
const [proof] = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_proof",
      attachment: { category: null, mode: "template" },
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
let beforeSnapshot: (() => Promise<void>) | null = null;
const native = Bun.serve({
  async fetch() {
    await beforeSnapshot?.();
    return new Response(snapshot);
  },
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
          expire: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          token: "isolated-provider-bearer-never-return-to-browser",
        },
      });
    }
    if (pathname === "/api/beeecm/public/document/category") {
      expect(request.headers.get("Authorization")).toBe(
        "Bearer isolated-provider-bearer-never-return-to-browser"
      );
      return Response.json(
        categoryNames.map((type, id) => ({ id, type })),
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
  const { documentServerKey } = xlsxEditorOpening(
    documentKey,
    identity.sessionId
  );
  capability = actionEditorCapability(
    identity,
    {
      documentKey,
      documentServerKey,
      formId,
      targetId: templateId,
      targetType: "template-draft",
    },
    "configure-fields",
    lease
  );
  publishCapability = actionEditorCapability(
    identity,
    {
      documentKey,
      documentServerKey,
      formId,
      targetId: templateId,
      targetType: "template-draft",
    },
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
  const catalog = await response.json();
  expect(catalog).toMatchObject({
    categories: [{ id: 0, type: "เอกสารประกอบ" }],
  });
  expect(JSON.stringify(catalog)).not.toContain("isolated-provider-bearer");
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

test("ordinary Draft slot cannot convert without saved native marker binding and placement proof", async () => {
  const ordinary = {
    ...proof,
    anchor: "folio_unproved",
    attachment: undefined,
    id: "folio_unproved",
    key: "attachment_99",
  };
  expect((await upsert(ordinary)).status).toBe(200);
  const before = await (await authoringRequest("spreadsheet-bindings")).json();
  const rejected = await upsert({
    ...ordinary,
    attachment: proof.attachment,
  });
  expect(rejected.status).toBe(422);
  expect(await rejected.json()).toMatchObject({
    error: "attachment_mapping_unproved",
  });
  expect(await (await authoringRequest("spreadsheet-bindings")).json()).toEqual(
    before
  );
  const current = before as { revision: number };
  expect(
    (
      await authoringRequest("spreadsheet-bindings", "PATCH", {
        change: { action: "delete", id: ordinary.id, kind: "field" },
        documentKey,
        revision: current.revision,
      })
    ).status
  ).toBe(200);
});

test("explicit verified old Draft conversion preserves binding placement and allows a deliberate Tag rename", async () => {
  expect((await upsert({ ...proof, attachment: undefined })).status).toBe(200);
  expect(
    (
      await upsert({
        ...proof,
        attachment: proof.attachment,
        key: "renamed_attachment",
      })
    ).status
  ).toBe(200);
  const configured = (await (
    await authoringRequest("spreadsheet-bindings")
  ).json()) as { bindings: { fields: unknown[] } };
  expect(configured.bindings.fields).toContainEqual(
    expect.objectContaining({
      anchor: proof.anchor,
      attachment: proof.attachment,
      id: proof.id,
      key: "renamed_attachment",
    })
  );
  // Unsaved renamed rules are not proof that the canonical old button changed.
  expect(
    (
      await upsert({
        ...proof,
        attachment: undefined,
        key: "renamed_attachment",
      })
    ).status
  ).toBe(200);
  const before = await (await authoringRequest("spreadsheet-bindings")).json();
  expect(
    (
      await upsert({
        ...proof,
        attachment: proof.attachment,
        key: "renamed_attachment",
      })
    ).status
  ).toBe(422);
  expect(await (await authoringRequest("spreadsheet-bindings")).json()).toEqual(
    before
  );
  expect((await upsert({ ...proof, attachment: undefined })).status).toBe(200);
  expect((await upsert(proof)).status).toBe(200);
});

test.each(["marker-only", "misplaced", "duplicate"] as const)(
  "old Draft conversion rejects %s native mapping without mutation",
  async (mapping) => {
    expect((await upsert({ ...proof, attachment: undefined })).status).toBe(
      200
    );
    let unproved = snapshot;
    if (mapping === "marker-only") {
      unproved = fixtureWorkbook({
        cells: [],
        merges: [],
        names: {
          _folio_upload_poc_folio_proof: "'Form'!$B$3",
          folio_proof: "'Form'!$B$3",
        },
      });
    } else if (mapping === "misplaced") {
      unproved = mutatePart(snapshot, "xl/workbook.xml", (xml) =>
        xml.replace(
          /(?<opening><definedName\b[^>]*name="_folio_upload_poc_folio_proof"[^>]*>)[^<]+/u,
          "$<opening>'Form'!$B$4"
        )
      );
    } else {
      unproved = mutatePart(snapshot, "xl/worksheets/sheet1.xml", (xml) =>
        xml.replace(
          /<oleObject\b[^>]*>[\s\S]*?<\/oleObject>/u,
          (object) => object + object
        )
      );
    }
    await putObject(
      `tests/${fixtureId}/template.xlsx`,
      unproved,
      XLSX_CONTENT_TYPE
    );
    try {
      const before = await (
        await authoringRequest("spreadsheet-bindings")
      ).json();
      expect((await upsert(proof)).status).toBe(422);
      expect(
        await (await authoringRequest("spreadsheet-bindings")).json()
      ).toEqual(before);
    } finally {
      await putObject(
        `tests/${fixtureId}/template.xlsx`,
        snapshot,
        XLSX_CONTENT_TYPE
      );
    }
    expect((await upsert(proof)).status).toBe(200);
  }
);

const catalogRequest = (method: string, body: unknown, suffix = "") =>
  app.handle(
    new Request(`http://test.local/api/admin/storage-templates${suffix}`, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      method,
    })
  );
test("Storage Template authoring rejects forged, renamed, moved and deleted local mappings without losing Draft configuration", async () => {
  const created = await catalogRequest("POST", {
    document_category_id: 0,
    template_name: templateChoice.template_name,
  });
  expect(created.status).toBe(200);
  const { template } = (await created.json()) as { template: { id: string } };
  templateChoice.storage_template_id = template.id;
  expect((await upsert({ ...proof, attachment: templateChoice })).status).toBe(
    200
  );
  expect(
    (
      await upsert({
        ...proof,
        attachment: {
          ...templateChoice,
          storage_template_id: storageTemplateId,
        },
      })
    ).status
  ).toBe(422);
  expect(
    (
      await catalogRequest(
        "PATCH",
        {
          document_category_id: 0,
          template_name: `${templateChoice.template_name}-renamed`,
        },
        `/${template.id}`
      )
    ).status
  ).toBe(200);
  expect(
    (
      await upsert({
        ...proof,
        anchor: "folio_stale_selection",
        attachment: templateChoice,
        id: "folio_stale_selection",
        key: "stale_selection",
      })
    ).status
  ).toBe(422);
  expect(
    (
      await catalogRequest(
        "PATCH",
        {
          document_category_id: 0,
          template_name: templateChoice.template_name,
        },
        `/${template.id}`
      )
    ).status
  ).toBe(200);
  const saved = await authoringRequest("spreadsheet-bindings");
  expect(await saved.json()).toMatchObject({
    bindings: { fields: [{ attachment: templateChoice }] },
  });
});
test.each(["rename", "delete"] as const)(
  "two stale attachment choices allow individual Draft repair after catalog %s",
  async (mutation) => {
    const created = await catalogRequest("POST", {
      document_category_id: 0,
      template_name: `repair-${mutation}-${fixtureId}`,
    });
    expect(created.status).toBe(200);
    const { template } = (await created.json()) as {
      template: { id: string; template_name: string };
    };
    const choice = {
      ...templateChoice,
      storage_template_id: template.id,
      template_name: template.template_name,
    };
    const scalar = { ...proof, attachment: choice };
    const column = {
      attachment: choice,
      id: "folio_repair_column",
      key: "evidence",
      label: "หลักฐานรายแถว",
      offset: 0,
      type: "text",
    };
    const table = {
      anchor: "folio_repair_table",
      columns: [column],
      id: "folio_repair_table",
      key: "repair_items",
      label: "รายการ",
    };
    expect((await upsert(scalar)).status).toBe(200);
    expect((await upsert(table, "table")).status).toBe(200);
    expect(
      (
        await catalogRequest(
          mutation === "delete" ? "DELETE" : "PATCH",
          mutation === "delete"
            ? { confirm: true }
            : {
                document_category_id: 0,
                template_name: `${template.template_name}-renamed`,
              },
          `/${template.id}`
        )
      ).status
    ).toBe(200);
    const ordinary = {
      ...proof,
      anchor: "folio_repair_ordinary",
      attachment: undefined,
      id: "folio_repair_ordinary",
      key: "docs_number",
      label: "Keep my Draft",
    };
    expect((await upsert(ordinary)).status).toBe(200);
    const rejected = await upsert({
      ...ordinary,
      anchor: "folio_rejected",
      attachment: choice,
      id: "folio_rejected",
      key: "rejected",
    });
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error: "attachment_template_stale",
    });
    expect(
      (await upsert({ ...scalar, label: "Retained stale choice" })).status
    ).toBe(200);
    const beforeDelete = await authoringRequest("spreadsheet-bindings");
    const { revision: deleteRevision } = (await beforeDelete.json()) as {
      revision: number;
    };
    expect(
      (
        await authoringRequest("spreadsheet-bindings", "PATCH", {
          change: { action: "delete", id: proof.id, kind: "field" },
          documentKey,
          revision: deleteRevision,
        })
      ).status
    ).toBe(200);
    expect(
      (await upsert({ ...scalar, attachment: templateChoice })).status
    ).toBe(200);
    const blocked = await authoringRequest(
      "publish",
      "POST",
      { documentKey, spreadsheetAnchors: [] },
      publishCapability
    );
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toMatchObject({
      error: "attachment_template_stale",
    });
    expect(
      (await upsert({ ...column, attachment: templateChoice }, "column")).status
    ).toBe(200);
    const saved = await authoringRequest("spreadsheet-bindings");
    const payload = (await saved.json()) as {
      bindings: SpreadsheetBindings;
      revision: number;
    };
    expect(payload.bindings.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attachment: templateChoice, id: proof.id }),
        expect.objectContaining({ key: "docs_number", label: "Keep my Draft" }),
      ])
    );
    expect(payload.bindings.table?.columns).toEqual([
      expect.objectContaining({ attachment: templateChoice, id: column.id }),
    ]);
    expect(
      (
        await authoringRequest("spreadsheet-bindings", "PATCH", {
          change: { action: "delete", id: table.id, kind: "table" },
          documentKey,
          revision: payload.revision,
        })
      ).status
    ).toBe(200);
    const current = await authoringRequest("spreadsheet-bindings");
    const { revision } = (await current.json()) as { revision: number };
    expect(
      (
        await authoringRequest("spreadsheet-bindings", "PATCH", {
          change: { action: "delete", id: ordinary.id, kind: "field" },
          documentKey,
          revision,
        })
      ).status
    ).toBe(200);
  }
);
test("incomplete attachment Draft saves; publication requires a Storage Template and docs_number, not fiscal_year", async () => {
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
    (
      await upsert({
        ...proof,
        attachment: { ...templateChoice, template_name: "หมวดสมมติ" },
      })
    ).status
  ).toBe(422);
  expect((await upsert({ ...proof, attachment: templateChoice })).status).toBe(
    200
  );
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

test("category outage and upstream rename preserve saved template, binding, Tag and required settings", async () => {
  categoryNames = ["หมวดชื่อใหม่"];
  expect((await authoringRequest("attachment-categories")).status).toBe(200);
  categoryStatus = 503;
  expect((await authoringRequest("attachment-categories")).status).toBe(503);
  const renamed = {
    ...proof,
    attachment: templateChoice,
    key: "supporting_document",
    required: true,
  };
  const saved = await upsert(renamed);
  expect(saved.status).toBe(200);
  const body = (await saved.json()) as { bindings: { fields: unknown[] } };
  expect(body.bindings.fields).toEqual([renamed]);
  expect(
    (
      await upsert({
        ...renamed,
        attachment: { ...templateChoice, template_name: "ไม่เคยเลือก" },
      })
    ).status
  ).toBe(422);
  expect(
    (await authoringRequest("attachment-categories", "GET", undefined, ""))
      .status
  ).toBe(401);
});

test("ordinary Field authoring remains usable with ECM unset and attachments cannot replace ordinary validation", async () => {
  const ordinary = createApp({ ecm: null, legacySso: null });
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
        attachment: templateChoice,
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
  for (const [id, key] of [["folio_number", "docs_number"]]) {
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
        attachment: templateChoice,
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
  for (const mutation of ["rename", "move", "delete"] as const) {
    beforeSnapshot = async () => {
      beforeSnapshot = null;
      categoryStatus = 200;
      const response = await app.handle(
        new Request(
          `http://test.local/api/admin/storage-templates/${templateChoice.storage_template_id}`,
          {
            body: JSON.stringify(
              mutation === "delete"
                ? { confirm: true }
                : {
                    document_category_id: mutation === "move" ? 1 : 0,
                    template_name:
                      mutation === "rename"
                        ? `${templateChoice.template_name}-changed`
                        : templateChoice.template_name,
                  }
            ),
            headers: {
              Authorization: `Bearer ${bearer}`,
              "Content-Type": "application/json",
            },
            method: mutation === "delete" ? "DELETE" : "PATCH",
          }
        )
      );
      expect(response.status).toBe(200);
    };
    const racing = await authoringRequest(
      "publish",
      "POST",
      {
        documentKey,
        spreadsheetAnchors: [
          ["folio_proof", "'Form'!$B$3"],
          ["folio_number", "'Form'!$B$2"],
        ],
      },
      publishCapability
    );
    expect(racing.status).toBe(202);
    const started = (await racing.json()) as { operationId: string };
    expect(await operationResult(started.operationId)).toMatchObject({
      error: "attachment_template_stale",
      status: "failed",
    });
    const restored = await app.handle(
      new Request(
        `http://test.local/api/admin/storage-templates${mutation === "delete" ? "" : `/${templateChoice.storage_template_id}`}`,
        {
          body: JSON.stringify({
            document_category_id: 0,
            template_name: templateChoice.template_name,
          }),
          headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
          },
          method: mutation === "delete" ? "POST" : "PATCH",
        }
      )
    );
    expect(restored.status).toBe(200);
    const restoredBody = (await restored.json()) as {
      template: { id: string };
    };
    templateChoice.storage_template_id = restoredBody.template.id;
    expect(
      (
        await upsert({
          ...proof,
          attachment: templateChoice,
          key: "supporting_document",
          required: true,
        })
      ).status
    ).toBe(200);
  }
  categoryStatus = 503;
  const beforeRequests = providerRequests.length;
  const published = await authoringRequest(
    "publish",
    "POST",
    {
      documentKey,
      spreadsheetAnchors: [
        ["folio_proof", "'Form'!$B$3"],
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
        documentServerKey: xlsxEditorOpening(ownDocumentKey, identity.sessionId)
          .documentServerKey,
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
        { ...proof, attachment: templateChoice },
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

test("duplicates keep independent links and frozen new choices; legacy duplicates require explicit mapping without copying answers or files", async () => {
  const legacyPublicId = crypto.randomUUID().replaceAll("-", "");
  const legacyFormId = crypto.randomUUID();
  const legacyTemplateId = crypto.randomUUID();
  const legacyResponseId = crypto.randomUUID();
  const savedData = {
    supporting_document: {
      file_link: "https://example.test/saved-original",
      file_token: "saved-token",
      original_name: "original.txt",
      size_bytes: 0,
    },
  };
  const legacyBindings = spreadsheetBindingSchema.parse({
    fields: [
      {
        ...proof,
        attachment: { category: "เอกสารเดิม", mode: "legacy" },
        key: "supporting_document",
      },
    ],
    table: null,
    version: 1,
  });
  const legacyObjectKey = `tests/${fixtureId}/legacy.xlsx`;
  await putObject(legacyObjectKey, snapshot, XLSX_CONTENT_TYPE);
  await prisma.form.create({
    data: {
      createdBy: adminId,
      documentKind: "xlsx",
      id: legacyFormId,
      publicId: legacyPublicId,
      publishedTemplate: {
        create: {
          contentHash: "legacy-fixture",
          documentKey: `legacy-${fixtureId}`,
          id: legacyTemplateId,
          manifest: {
            create: {
              configurationHash: "legacy-fixture",
              fields: { create: spreadsheetManifestFieldData(legacyBindings) },
            },
          },
          objectKey: legacyObjectKey,
          version: 1,
        },
      },
      status: "published",
      title: "Legacy source",
      version: 1,
    },
  });
  await prisma.response.create({
    data: {
      draftData: savedData,
      draftDocumentKey: `legacy-draft-${fixtureId}`,
      draftObjectKey: legacyObjectKey,
      formId: legacyFormId,
      id: legacyResponseId,
      publishedTemplateId: legacyTemplateId,
      publishedVersion: 1,
      userId: adminId,
    },
  });
  const rename = await app.handle(
    new Request(
      `http://test.local/api/admin/storage-templates/${templateChoice.storage_template_id}`,
      {
        body: JSON.stringify({
          document_category_id: 0,
          template_name: `${templateChoice.template_name}-after-publication`,
        }),
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        method: "PATCH",
      }
    )
  );
  expect(rename.status).toBe(200);
  for (const sourcePublicId of [publicId, legacyPublicId]) {
    const duplicate = await app.handle(
      new Request(
        `http://test.local/api/admin/forms/${sourcePublicId}/duplicate`,
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
    expect(duplicate.status).toBe(200);
    const body = (await duplicate.json()) as {
      form: {
        publicId: string;
        activeDraftCount: number;
        submissionCount: number;
      };
    };
    expect(body.form.publicId).not.toBe(sourcePublicId);
    expect(body.form).toMatchObject({
      activeDraftCount: 0,
      submissionCount: 0,
    });
    const configResponse = await app.handle(
      new Request(
        `http://test.local/api/admin/forms/${body.form.publicId}/editor-config`,
        {
          headers: { Authorization: `Bearer ${bearer}` },
        }
      )
    );
    expect(configResponse.status).toBe(200);
    const config = (await configResponse.json()) as {
      bridge: { documentKey: string; capabilities: Record<string, string> };
      config: {
        editorConfig: {
          plugins: {
            options: Record<
              string,
              { spreadsheetBindings?: SpreadsheetBindings }
            >;
          };
        };
      };
    };
    const copied = Object.values(
      config.config.editorConfig.plugins.options
    ).find((entry) => entry.spreadsheetBindings)?.spreadsheetBindings;
    expect(
      copied?.fields.find((field) => field.attachment)?.attachment
    ).toEqual(
      sourcePublicId === publicId
        ? templateChoice
        : {
            category: null,
            document_category_id: null,
            mode: "template",
            storage_template_id: null,
            template_name: null,
          }
    );
    const rejected = await app.handle(
      new Request(
        `http://test.local/api/admin/forms/${body.form.publicId}/publish`,
        {
          body: JSON.stringify({
            documentKey: config.bridge.documentKey,
            spreadsheetAnchors: [["folio_proof", "'Form'!$B$3"]],
          }),
          headers: {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
            "X-Editor-Capability": config.bridge.capabilities.publish ?? "",
          },
          method: "POST",
        }
      )
    );
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({
      error:
        sourcePublicId === publicId
          ? "attachment_template_stale"
          : "attachment_category_required",
    });
    const original = await app.handle(
      new Request(`http://test.local/api/forms/${sourcePublicId}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    expect(original.status).toBe(200);
    expect(await original.json()).toMatchObject({ form: { published: true } });
  }
  const legacyDraft = await app.handle(
    new Request(
      `http://test.local/api/responses/${legacyResponseId}/draft/json`,
      {
        headers: { Authorization: `Bearer ${bearer}` },
      }
    )
  );
  expect(legacyDraft.status).toBe(200);
  expect(await legacyDraft.json()).toEqual(savedData);
});
