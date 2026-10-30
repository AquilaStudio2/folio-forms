// oxlint-disable unicorn/no-await-expression-member sort-keys -- HTTP assertions stay next to their authorized request.
import { beforeAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import { bearerFor, createCredentialFixture } from "../fixtures/http";

if (!process.env.DATABASE_URL) {
  throw new Error("An isolated DATABASE_URL is required");
}
const app = createApp({ legacySso: null, omniRoute: null });
const formId = crypto.randomUUID();
const draftId = crypto.randomUUID();
const publicId = crypto.randomUUID().replaceAll("-", "");
const documentKey = `pdms-${formId}`;
let capability = "";
beforeAll(async () => {
  const password = `Scalar-fixture-${crypto.randomUUID()}`;
  const admin = await createCredentialFixture({
    email: `${formId}@example.test`,
    name: "Scalar author",
    password,
    role: "admin",
  });
  const bearer = await bearerFor(app, admin.email, password);
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id: formId,
      publicId,
      templateDraft: {
        create: {
          bindingRevision: 1,
          documentKey,
          id: draftId,
          objectKey: `tests/${formId}/draft.xlsx`,
        },
      },
      title: "Scalar source fixture",
    },
  });
  const lease = await claimEditorLease(
    identity,
    "template-draft",
    draftId,
    formId
  );
  capability = actionEditorCapability(
    identity,
    { documentKey, formId, targetId: draftId, targetType: "template-draft" },
    "configure-fields",
    lease
  );
});
const bindingsRequest = (method: string, body?: unknown) =>
  app.handle(
    new Request(
      `http://test.local/api/admin/forms/${publicId}/spreadsheet-bindings`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Editor-Capability": capability,
        },
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }
    )
  );

test("Admin saves and reopens a scalar PDMS Field with its stable Title and Tag", async () => {
  const field = {
    anchor: "folio_project",
    id: "folio_project",
    key: "project_name",
    label: "ชื่อโครงการ",
    options: [],
    required: true,
    source: "pdms-project-name",
    type: "dropdown",
  };
  const saved = await bindingsRequest("PATCH", {
    change: { action: "upsert", kind: "field", value: field },
    documentKey,
    revision: 1,
  });
  expect(saved.status).toBe(200);
  const reopened = await bindingsRequest("GET");
  expect(reopened.status).toBe(200);
  expect(await reopened.json()).toMatchObject({
    bindings: { fields: [field] },
    documentKey,
    revision: 2,
  });
});

test("a fresh authorized editor opening loads usable names once and preserves its snapshot on reconnect", async () => {
  const { fixtureWorkbook } = await import("../spreadsheet-unit/fixture");
  const { putObject } = await import("../../src/storage");
  const { spreadsheetManifestFieldData } =
    await import("../../src/forms/spreadsheet-fields");
  const { spreadsheetBindingSchema } =
    await import("../../src/documents/spreadsheets/contract");
  let requests = 0;
  const upstream = Bun.serve({
    fetch: (request) => {
      expect(new URL(request.url).pathname).toBe(
        "/prefix/api/pages/projects/names-and-doc-numbers"
      );
      expect(request.headers.get("ongoing-secret-token")).toBe(
        "fixture-server-only-secret"
      );
      requests += 1;
      return Response.json([
        { confirmation_document_number: "DOC-1", name: "โครงการ ก" },
        { confirmation_document_number: "DOC-2", name: "โครงการ ก" },
        { confirmation_document_number: "DOC-3", name: " " },
        { confirmation_document_number: "DOC-4", name: null },
        {
          confirmation_document_number: "DOC-5",
          name: requests === 1 ? "Project B" : "Project C",
        },
      ]);
    },
    hostname: "127.0.0.1",
    port: 0,
  });
  try {
    const catalogApp = createApp({
      legacySso: null,
      omniRoute: null,
      pdmsProjects: {
        baseUrl: `${upstream.url.origin}/prefix/api`,
        secret: "fixture-server-only-secret",
      },
    });
    const fixtureId = crypto.randomUUID();
    const password = `Reader-${fixtureId}`;
    const user = await createCredentialFixture({
      email: `${fixtureId}@example.test`,
      name: "Catalog reader",
      password,
    });
    const token = await bearerFor(catalogApp, user.email, password);
    const templateId = crypto.randomUUID();
    const catalogPublicId = fixtureId.replaceAll("-", "");
    const bindings = spreadsheetBindingSchema.parse({
      fields: [
        {
          anchor: "folio_project",
          id: "folio_project",
          key: "project_name",
          label: "Project",
          source: "pdms-project-name",
          type: "dropdown",
        },
      ],
      table: null,
      version: 1,
    });
    const bytes = fixtureWorkbook({
      cells: [],
      merges: [],
      names: { folio_project: "'Form'!$A$1" },
    });
    const key = `tests/${fixtureId}/published.xlsx`;
    await putObject(
      key,
      bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await prisma.form.create({
      data: {
        documentKind: "xlsx",
        id: fixtureId,
        publicId: catalogPublicId,
        publishedTemplate: {
          create: {
            contentHash: fixtureId,
            documentKey: `published-${fixtureId}`,
            id: templateId,
            manifest: {
              create: {
                configurationHash: fixtureId,
                fields: { create: spreadsheetManifestFieldData(bindings) },
              },
            },
            objectKey: key,
            version: 1,
          },
        },
        status: "published",
        title: "Catalog fixture",
        version: 1,
      },
    });
    const response = await prisma.response.create({
      data: {
        draftDocumentKey: `response-${fixtureId}`,
        draftObjectKey: key,
        formId: fixtureId,
        publishedTemplateId: templateId,
        publishedVersion: 1,
        spreadsheetInitialized: true,
        userId: user.id,
      },
    });
    const opening = crypto.randomUUID();
    const getConfig = (openingId: string) =>
      catalogApp.handle(
        new Request(
          `http://test.local/api/forms/${catalogPublicId}/editor-config?responseId=${response.id}&pdmsOpeningId=${openingId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );
    const first = await getConfig(opening);
    expect(first.status).toBe(200);
    const opened = (await first.json()) as {
      pdmsProjectCatalog: {
        names: string[];
        sessionId: string;
        status: string;
      };
    };
    expect(opened.pdmsProjectCatalog).toMatchObject({
      names: ["โครงการ ก", "Project B"],
      status: "ready",
    });
    const reconnect = await getConfig(opening);
    expect(
      ((await reconnect.json()) as typeof opened).pdmsProjectCatalog
    ).toEqual(opened.pdmsProjectCatalog);
    expect(requests).toBe(1);
    expect(
      ((await (await getConfig(crypto.randomUUID())).json()) as typeof opened)
        .pdmsProjectCatalog.names
    ).toEqual(["โครงการ ก", "Project C"]);
    expect(requests).toBe(2);
  } finally {
    upstream.stop(true);
  }
});
