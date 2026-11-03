// Run with RUN_XLSX_HYPERLINK_HTTP=1, an isolated DATABASE_URL, and a disposable ONLYOFFICE service.
// ONLYOFFICE_DOCUMENT_BASE_URL must point to this test's listener, reachable from ONLYOFFICE.
// oxlint-disable no-await-in-loop unicorn/no-await-expression-member -- Follow public operations in their persisted order.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { z } from "zod";

import { createApp } from "../../src/app";
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
import { spreadsheetDraftFieldData } from "../../src/forms/spreadsheet-fields";
import { createOnlyOfficeAuthorization } from "../../src/onlyoffice";
import { deleteObject, putObject, readObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { cellHyperlinkFixture } from "../fixtures/spreadsheet-hyperlinks";
import {
  fixtureBindings,
  fixtureWorkbook,
  mutatePart,
} from "../spreadsheet-unit/fixture";

const enabled = process.env.RUN_XLSX_HYPERLINK_HTTP === "1";
const editorSchema = z.object({
  bridge: z.object({ capabilities: z.record(z.string(), z.string()) }),
  config: z.object({
    document: z.object({ key: z.string(), url: z.string() }),
  }),
});
type Editor = z.infer<typeof editorSchema>;
const operationSchema = z.object({
  operation: z.object({
    error: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    status: z.string(),
  }),
});
const formId = crypto.randomUUID();
const publicId = crypto.randomUUID().replaceAll("-", "");
const objects = new Set<string>();
const users: string[] = [];
const bindings = fixtureBindings();
const target = "https://example.com/report?a=1&b=2#section";
let snapshot: Uint8Array | null = null;
let admin = "";
let user = "";
let responseId = "";
const native = enabled
  ? Bun.serve({
      fetch: () => new Response(snapshot),
      hostname: "127.0.0.1",
      port: 0,
    })
  : null;
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-fixture")),
    forceSave: () => Promise.resolve(native ? { url: native.url.href } : false),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
  pdmsProjects: null,
});

const request = (
  path: string,
  token: string,
  body?: unknown,
  capability = false
) =>
  app.handle(
    new Request(`http://test.local${path}`, {
      headers: {
        "Content-Type": "application/json",
        [capability ? "X-Editor-Capability" : "Authorization"]: capability
          ? token
          : `Bearer ${token}`,
      },
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
const openEditor = async (path: string, token: string): Promise<Editor> => {
  const response = await request(path, token);
  expect(response.status).toBe(200);
  return editorSchema.parse(await response.json());
};
const editorBytes = async (editor: Editor) => {
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
  body: Record<string, unknown> = {}
) => {
  const token = editor.bridge.capabilities[name];
  if (!token) {
    throw new Error(`Missing ${name} capability`);
  }
  const response = await request(
    path,
    token,
    {
      documentKey: editor.config.document.key,
      ...(name === "save-template" || name === "publish" ? {} : { data: {} }),
      ...body,
    },
    true
  );
  if (response.status !== 202) {
    const failure = z
      .object({ error: z.string().optional(), message: z.string().optional() })
      .parse(await response.json());
    throw new Error(
      `Action ${name} returned ${response.status}: ${JSON.stringify(failure)}`
    );
  }
  expect(response.status).toBe(202);
  const operation = z
    .object({ operationCapability: z.string(), operationId: z.string() })
    .parse(await response.json());
  for (let count = 0; count < 600; count += 1) {
    const poll = await request(
      `/api/operations/${operation.operationId}`,
      operation.operationCapability,
      undefined,
      true
    );
    expect(poll.status).toBe(200);
    const result = operationSchema.parse(await poll.json()).operation;
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }
    await Bun.sleep(20);
  }
  throw new Error("Hyperlink operation did not finish");
};
const expectLink = (bytes: Uint8Array, href = target) => {
  const workbook = readSpreadsheetWorkbook(bytes);
  expect(
    workbook.hyperlinks.find((link) => link.range.firstRow === 0)?.target
  ).toBe(href);
};

describe.skipIf(!enabled)("XLSX hyperlink HTTP lifecycle", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("An isolated DATABASE_URL is required");
    }
    const port = Number(
      new URL(process.env.ONLYOFFICE_DOCUMENT_BASE_URL ?? "").port
    );
    if (!port) {
      throw new Error("The test requires a dedicated document listener port");
    }
    app.listen({ hostname: "0.0.0.0", port });
    const password = crypto.randomUUID();
    const adminIdentity = await createCredentialFixture({
      email: `hyperlink-admin-${formId}@example.test`,
      name: "Hyperlink admin",
      password,
      role: "admin",
    });
    const userIdentity = await createCredentialFixture({
      email: `hyperlink-user-${formId}@example.test`,
      name: "Hyperlink user",
      password,
    });
    users.push(adminIdentity.id, userIdentity.id);
    admin = await bearerFor(app, adminIdentity.email, password);
    user = await bearerFor(app, userIdentity.email, password);
    const objectKey = `tests/hyperlinks/${formId}/template.xlsx`;
    objects.add(objectKey);
    snapshot = cellHyperlinkFixture(fixtureWorkbook(), { target });
    await putObject(objectKey, snapshot, XLSX_CONTENT_TYPE);
    await prisma.form.create({
      data: {
        createdBy: adminIdentity.id,
        documentKind: "xlsx",
        id: formId,
        publicId,
        templateDraft: {
          create: {
            documentKey: `hyperlink-template-${formId}`,
            fieldRules: { create: spreadsheetDraftFieldData(bindings) },
            objectKey,
          },
        },
        title: "Hyperlink lifecycle",
      },
    });
  }, 30_000);

  afterAll(async () => {
    native?.stop(true);
    const operations = await prisma.operation.findMany({ where: { formId } });
    for (const operation of operations) {
      if (operation.stagingObjectKey) {
        objects.add(operation.stagingObjectKey);
      }
      const { metadata } = operation;
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata)
      ) {
        continue;
      }
      for (const key of [
        "finalObjectKey",
        "stagedObjectKey",
        "nativeCaptureObjectKey",
      ]) {
        const value = metadata[key];
        if (typeof value === "string") {
          objects.add(value);
        }
      }
    }
    const leases = await prisma.editorLease.findMany({
      where: { holderUserId: { in: users } },
    });
    for (const lease of leases) {
      if (lease.workspaceObjectKey) {
        objects.add(lease.workspaceObjectKey);
      }
    }
    const [draft, published, responses] = await Promise.all([
      prisma.templateDraft.findUnique({ where: { formId } }),
      prisma.publishedTemplate.findUnique({ where: { formId } }),
      prisma.response.findMany({ where: { formId } }),
    ]);
    if (draft) {
      objects.add(draft.objectKey);
    }
    if (published) {
      objects.add(published.objectKey);
    }
    for (const response of responses) {
      if (response.draftObjectKey) {
        objects.add(response.draftObjectKey);
      }
    }
    // Published templates are immutable. Dispose the isolated database after this suite.
    await Promise.all([...objects].map(deleteObject));
    await app.stop();
  });

  test("save/publish, user draft/resume/submit, downloads, corrections and resubmission retain hyperlinks", async () => {
    const templatePath = `/api/admin/forms/${publicId}/editor-config`;
    const anchors = [
      ["folio_agency", "'Form'!$A$1:$B$1"],
      ["folio_date", "'Form'!$D$1"],
      ["folio_body", "'Form'!$A$4:$D$8"],
    ];
    let editor = await openEditor(templatePath, admin);
    expect(
      await action(
        editor,
        `/api/admin/forms/${publicId}/save`,
        "save-template",
        { spreadsheetAnchors: anchors }
      )
    ).toMatchObject({ status: "completed" });
    editor = await openEditor(templatePath, admin);
    snapshot = await editorBytes(editor);
    expectLink(snapshot);
    expect(
      await action(editor, `/api/admin/forms/${publicId}/publish`, "publish", {
        spreadsheetAnchors: anchors,
      })
    ).toMatchObject({ status: "completed" });

    const start = await request(`/api/forms/${publicId}/start`, user, {});
    expect(start.status).toBe(200);
    responseId = z
      .object({ response: z.object({ id: z.string() }) })
      .parse(await start.json()).response.id;
    const userPath = `/api/forms/${publicId}/editor-config?responseId=${responseId}`;
    editor = await openEditor(userPath, user);
    const initialized = await editorBytes(editor);
    const input = await processSpreadsheet(unprotectSpreadsheet(initialized), {
      bindings,
      values: [
        {
          address: "A1",
          hyperlink: { target, tooltip: "User report" },
          value: target,
        },
        { address: "A4", value: 2 },
        { address: "B4", value: true },
        { address: "C4", value: "Row note" },
      ],
    });
    snapshot = protectSpreadsheet(
      input.workbook,
      resolveSpreadsheetContract(
        bindings,
        readSpreadsheetWorkbook(input.workbook)
      )
    );
    expect(
      await action(editor, `/api/forms/${publicId}/draft`, "save-draft", {
        responseId,
      })
    ).toMatchObject({ status: "completed" });
    const saved = await prisma.response.findUniqueOrThrow({
      where: { id: responseId },
    });
    expect(saved.draftData).toMatchObject({ agency: target });
    if (!saved.draftObjectKey) {
      throw new Error("Missing saved draft");
    }
    objects.add(saved.draftObjectKey);
    expectLink(await readObject(saved.draftObjectKey));

    editor = await openEditor(userPath, user);
    snapshot = await editorBytes(editor);
    expectLink(snapshot);
    const relationPath = "xl/worksheets/_rels/sheet1.xml.rels";
    snapshot = mutatePart(snapshot, relationPath, (xml) =>
      xml.replace("/relationships/hyperlink", "/relationships/image")
    );
    expect(
      await action(editor, `/api/forms/${publicId}/draft`, "save-draft", {
        responseId,
      })
    ).toMatchObject({
      error: "invalid_template",
      errorMessage: "External document resources are not allowed",
      status: "failed",
    });
    const afterRejectedSave = await prisma.response.findUniqueOrThrow({
      where: { id: responseId },
    });
    expect(afterRejectedSave.draftObjectKey).toBe(saved.draftObjectKey);
    expect(afterRejectedSave.draftData).toEqual(saved.draftData);
    snapshot = await readObject(saved.draftObjectKey);
    expect(
      await action(editor, `/api/forms/${publicId}/submit`, "submit", {
        responseId,
      })
    ).toMatchObject({ status: "completed" });
    const submission = await prisma.submission.findFirstOrThrow({
      where: { responseId },
    });
    objects.add(submission.objectKey);
    const download = await request(
      `/api/submissions/${submission.id}/xlsx`,
      user
    );
    expect(download.status).toBe(200);
    expectLink(new Uint8Array(await download.arrayBuffer()));
    expect(
      (await request(`/api/submissions/${submission.id}/pdf`, user)).status
    ).toBe(200);

    const correctionPath = `/api/admin/results/${responseId}/correction`;
    editor = await openEditor(`${correctionPath}/editor-config`, admin);
    const correctedTarget = "https://example.com/corrected";
    const corrected = await processSpreadsheet(
      unprotectSpreadsheet(await editorBytes(editor)),
      {
        bindings,
        values: [
          {
            address: "A1",
            hyperlink: { target: correctedTarget },
            value: "Corrected report",
          },
        ],
      }
    );
    snapshot = corrected.workbook;
    expect(
      await action(
        editor,
        `${correctionPath}/workspace`,
        "save-correction-workspace"
      )
    ).toMatchObject({ status: "completed" });
    editor = await openEditor(`${correctionPath}/editor-config`, admin);
    snapshot = await editorBytes(editor);
    expectLink(snapshot, correctedTarget);
    expect(
      await action(editor, correctionPath, "save-correction", {
        reason: "Update report link",
      })
    ).toMatchObject({ status: "completed" });
    const correction = await prisma.correction.findFirstOrThrow({
      where: { responseId },
    });
    objects.add(correction.objectKey);
    expectLink(await readObject(correction.objectKey), correctedTarget);
    const revisedDownload = await request(
      `/api/submissions/${submission.id}/xlsx`,
      user
    );
    expect(revisedDownload.status).toBe(200);
    expectLink(
      new Uint8Array(await revisedDownload.arrayBuffer()),
      correctedTarget
    );

    expect(
      (await request(`/api/forms/${publicId}/start`, user, {})).status
    ).toBe(200);
    editor = await openEditor(userPath, user);
    expect(editor.config.document.key).toBeTruthy();
    expectLink(await readObject(submission.objectKey));
  }, 120_000);
});
