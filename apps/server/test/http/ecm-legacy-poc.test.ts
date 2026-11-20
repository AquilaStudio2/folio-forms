// oxlint-disable no-await-in-loop unicorn/no-await-expression-member -- Follow real HTTP operations and their immutable revisions sequentially.
import { afterAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { processSpreadsheet } from "../../src/documents/spreadsheets/engine";
import {
  protectSpreadsheet,
  unprotectSpreadsheet,
} from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { createOnlyOfficeAuthorization } from "../../src/onlyoffice";
import { putObject, readObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Legacy PoC HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}
const port = Number(
  new URL(process.env.ONLYOFFICE_DOCUMENT_BASE_URL ?? "http://localhost:3000")
    .port
);
if (!port || port === 3000) {
  throw new Error(
    "Legacy PoC HTTP tests require an isolated native callback listener"
  );
}
const fixtureId = crypto.randomUUID();
let snapshot: Uint8Array = new Uint8Array();
const native = Bun.serve({
  fetch: () => new Response(snapshot),
  hostname: "127.0.0.1",
  port: 0,
});
const app = createApp({
  ecm: null,
  legacySso: null,
  onlyOffice: {
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
    forceSave: () => Promise.resolve({ url: native.url.href }),
  },
  onlyOfficeCallbackOrigins: [native.url.origin],
  pdmsProjects: null,
});
app.listen({ hostname: "0.0.0.0", port });
afterAll(async () => {
  await app.stop();
  await native.stop(true);
  // Immutable published fixtures and artifacts remain only in the disposable test database/bucket.
});
const request = (
  path: string,
  bearer: string,
  body?: unknown,
  capability?: string
) =>
  app.handle(
    new Request(`http://test.local${path}`, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        ...(capability ? { "X-Editor-Capability": capability } : {}),
      },
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
interface Editor {
  bridge: {
    documentKey: string;
    capabilities: Record<string, string>;
    uploadPoc: { spreadsheetBindings: unknown };
  };
  config: { document: { key: string; url: string } };
}
const openEditor = async (path: string, bearer: string): Promise<Editor> => {
  const response = await request(path, bearer);
  expect(response.status).toBe(200);
  return response.json() as Promise<Editor>;
};
const workbook = async (editor: Editor) => {
  const { url } = editor.config.document;
  const response = await app.handle(
    new Request(url, {
      headers: { Authorization: createOnlyOfficeAuthorization({ url }) },
    })
  );
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
};
const action = async (
  editor: Editor,
  path: string,
  name: string,
  bearer: string,
  body: Record<string, unknown>
) => {
  const response = await request(
    path,
    bearer,
    { data: {}, documentKey: editor.bridge.documentKey, ...body },
    editor.bridge.capabilities[name]
  );
  expect(response.status).toBe(202);
  const operation = (await response.json()) as { operationId: string };
  for (let count = 0; count < 3000; count += 1) {
    const poll = await request(
      `/api/operations/${operation.operationId}`,
      bearer
    );
    expect(poll.status).toBe(200);
    const result = (await poll.json()) as {
      operation: { status: string; error?: string };
    };
    if (["completed", "failed"].includes(result.operation.status)) {
      return result.operation;
    }
    // Poll the external native worker's terminal HTTP state, not an assumed completion delay.
    await Bun.sleep(20);
  }
  throw new Error("Legacy PoC native operation did not settle");
};

test("old Published PoC preserves ordinary text URL requiredness history and duplicate isolation", async () => {
  const password = crypto.randomUUID();
  const admin = await createCredentialFixture({
    email: `legacy-admin-${fixtureId}@example.test`,
    name: "Legacy Admin",
    password,
    role: "admin",
  });
  const user = await createCredentialFixture({
    email: `legacy-user-${fixtureId}@example.test`,
    name: "Legacy User",
    password,
  });
  const adminBearer = await bearerFor(app, admin.email, password);
  const userBearer = await bearerFor(app, user.email, password);
  const bindings = spreadsheetBindingSchema.parse({
    fields: [
      {
        anchor: "folio_legacy",
        id: "folio_legacy",
        key: "attachment_1",
        label: "Old URL",
        required: true,
        type: "text",
      },
      {
        anchor: "folio_note",
        id: "folio_note",
        key: "note",
        label: "Note",
        type: "text",
      },
    ],
    table: null,
    version: 1,
  });
  const template = (
    await processSpreadsheet(
      fixtureWorkbook({
        cells: [],
        merges: [],
        names: {
          _folio_upload_poc_folio_legacy: "'Form'!$A$1",
          folio_legacy: "'Form'!$A$1",
          folio_note: "'Form'!$A$2",
        },
      }),
      { bindings }
    )
  ).workbook;
  const publicId = crypto.randomUUID().replaceAll("-", "");
  const objectKey = `tests/legacy-poc/${fixtureId}/published.xlsx`;
  await putObject(objectKey, template, XLSX_CONTENT_TYPE);
  // Seed a pre-cutover publication. New publication correctly requires explicit attachment configuration.
  const form = await prisma.form.create({
    data: {
      createdBy: admin.id,
      documentKind: "xlsx",
      publicId,
      publishedTemplate: {
        create: {
          contentHash: "historical-fixture",
          documentKey: `legacy-${fixtureId}`,
          manifest: {
            create: {
              configurationHash: "historical-fixture",
              fields: { create: spreadsheetManifestFieldData(bindings) },
            },
          },
          objectKey,
          version: 1,
        },
      },
      status: "published",
      title: "Old PoC",
      version: 1,
    },
    include: {
      publishedTemplate: {
        include: { manifest: { include: { fields: true } } },
      },
    },
  });
  if (!form.publishedTemplate?.manifest) {
    throw new Error("Legacy fixture requires its immutable published manifest");
  }
  const manifestBefore = form.publishedTemplate?.manifest?.fields;
  expect(manifestBefore?.every((field) => !field.attachment)).toBe(true);
  const started = await request(`/api/forms/${publicId}/start`, userBearer, {});
  expect(started.status).toBe(200);
  const {
    response: { id: responseId },
  } = (await started.json()) as { response: { id: string } };
  const editorPath = `/api/forms/${publicId}/editor-config?responseId=${responseId}`;
  let editor = await openEditor(editorPath, userBearer);
  expect(editor.bridge.uploadPoc.spreadsheetBindings).toMatchObject({
    fields: [
      expect.objectContaining({ key: "attachment_1", type: "text" }),
      expect.objectContaining({ key: "note" }),
    ],
  });
  snapshot = await workbook(editor);
  expect(
    await action(
      editor,
      `/api/forms/${publicId}/submit`,
      "submit",
      userBearer,
      { responseId }
    )
  ).toMatchObject({ status: "failed" });
  editor = await openEditor(editorPath, userBearer);
  const oldUrl = "https://example.test/old-file.txt";
  const oldText = "original filename only.txt";
  const edited = await processSpreadsheet(
    unprotectSpreadsheet(await workbook(editor)),
    {
      bindings,
      values: [
        { address: "A1", value: oldUrl },
        { address: "A2", value: oldText },
      ],
    }
  );
  snapshot = protectSpreadsheet(
    edited.workbook,
    resolveSpreadsheetContract(
      bindings,
      readSpreadsheetWorkbook(edited.workbook)
    )
  );
  expect(
    await action(
      editor,
      `/api/forms/${publicId}/draft`,
      "save-draft",
      userBearer,
      { responseId }
    )
  ).toMatchObject({ status: "completed" });
  const saved = await prisma.response.findUniqueOrThrow({
    where: { id: responseId },
  });
  expect(saved.draftData).toEqual({ attachment_1: oldUrl, note: oldText });
  editor = await openEditor(editorPath, userBearer);
  snapshot = await workbook(editor);
  expect(
    await action(
      editor,
      `/api/forms/${publicId}/submit`,
      "submit",
      userBearer,
      { responseId }
    )
  ).toMatchObject({ status: "completed" });
  const submission = await prisma.submission.findFirstOrThrow({
    where: { responseId },
  });
  expect(submission.data).toEqual({ attachment_1: oldUrl, note: oldText });
  const submissionBytes = await readObject(submission.objectKey);
  const duplicate = await request(
    `/api/admin/forms/${publicId}/duplicate`,
    adminBearer,
    {}
  );
  expect(duplicate.status).toBe(200);
  const copied = (await duplicate.json()) as {
    form: {
      publicId: string;
      status: string;
      activeDraftCount: number;
      submissionCount: number;
    };
  };
  expect(copied.form).toMatchObject({
    activeDraftCount: 0,
    status: "draft",
    submissionCount: 0,
  });
  const copy = await prisma.form.findUniqueOrThrow({
    include: {
      publishedTemplate: true,
      responses: true,
      templateDraft: { include: { fieldRules: true } },
    },
    where: { publicId: copied.form.publicId },
  });
  expect(copy.responses).toEqual([]);
  expect(copy.publishedTemplate).toBeNull();
  if (!copy.templateDraft) {
    throw new Error("Duplicate must expose an editable Template Draft");
  }
  expect(
    copy.templateDraft?.fieldRules.every((field) => !field.attachment)
  ).toBe(true);
  expect(
    copy.templateDraft?.fieldRules.map((field) => ({
      required: field.required,
      tag: field.tag,
    }))
  ).toEqual(
    expect.arrayContaining([
      { required: true, tag: "attachment_1" },
      { required: false, tag: "note" },
    ])
  );
  const copiedWorkbook = readSpreadsheetWorkbook(
    await readObject(copy.templateDraft.objectKey)
  );
  expect(
    [...copiedWorkbook.cells.values()].some(
      (cell) => cell.value === oldUrl || cell.value === oldText
    )
  ).toBe(false);
  expect(
    (await prisma.form.findUniqueOrThrow({ where: { id: form.id } })).status
  ).toBe("published");
  expect(
    await prisma.manifestField.findMany({
      orderBy: { position: "asc" },
      where: { manifestId: form.publishedTemplate.manifest.id },
    })
  ).toEqual(
    manifestBefore?.toSorted(
      (left, right) => (left.position ?? 0) - (right.position ?? 0)
    )
  );
  expect(
    (
      await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
      })
    ).data
  ).toEqual(submission.data);
  expect(await readObject(submission.objectKey)).toEqual(submissionBytes);
}, 120_000);
