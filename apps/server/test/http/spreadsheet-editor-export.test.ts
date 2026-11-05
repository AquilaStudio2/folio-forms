// oxlint-disable unicorn/no-await-expression-member -- Keep HTTP assertions next to their requests.
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { env } from "@onlyoffice/env/server";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook, mutatePart } from "../spreadsheet-unit/fixture";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Workbook export HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const app = createApp({ legacySso: null, omniRoute: null, pdmsProjects: null });
const formId = crypto.randomUUID();
const responseId = crypto.randomUUID();
const templateId = crypto.randomUUID();
const documentKey = `response-${responseId}-${crypto.randomUUID()}`;
const users: string[] = [];
let owner = "";
let otherOwnerSession = "";
let otherUser = "";
let exportCapability = "";
let saveCapability = "";
let inactiveLeaseCapability = "";

const snapshotUrl = (
  key = documentKey,
  expires = Math.floor(Date.now() / 1000) + 60
) => {
  const url = new URL(env.ONLYOFFICE_URL);
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/cache/files/data/${key}_1234/output.xlsx/fill.xlsx`;
  url.search = new URLSearchParams({
    expires: String(expires),
    filename: "fill.xlsx",
    md5: "a".repeat(22),
    shardkey: key,
  }).toString();
  return url.href;
};

const exportRequest = ({
  bearer = owner,
  capability = exportCapability,
  format = "xlsx",
  url = snapshotUrl(),
}: {
  bearer?: string;
  capability?: string;
  format?: string;
  url?: string;
} = {}) =>
  app.handle(
    new Request(
      `http://test.local/api/responses/${responseId}/editor-export/${format}`,
      {
        body: JSON.stringify({ snapshotUrl: url }),
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(capability ? { "X-Editor-Capability": capability } : {}),
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    )
  );

beforeAll(async () => {
  const password = "Workbook-export-fixture-password!";
  const user = await createCredentialFixture({
    email: `owner-${formId}@example.test`,
    name: "Owner",
    password,
  });
  users.push(user.id);
  const other = await createCredentialFixture({
    email: `other-${formId}@example.test`,
    name: "Other user",
    password,
  });
  users.push(other.id);
  owner = await bearerFor(app, user.email, password);
  otherOwnerSession = await bearerFor(app, user.email, password);
  otherUser = await bearerFor(app, other.email, password);

  await prisma.form.create({
    data: {
      documentKind: "xlsx",
      id: formId,
      publicId: formId.replaceAll("-", ""),
      publishedTemplate: {
        create: {
          contentHash: "fixture",
          documentKey: `template-${templateId}`,
          id: templateId,
          objectKey: `tests/${formId}/template.xlsx`,
          version: 1,
        },
      },
      status: "published",
      title: "Workbook export fixture",
      version: 1,
    },
  });
  await prisma.response.create({
    data: {
      draftData: { value: 100 },
      draftDocumentKey: documentKey,
      draftObjectKey: `tests/${formId}/response.xlsx`,
      formId,
      id: responseId,
      publishedTemplateId: templateId,
      publishedVersion: 1,
      spreadsheetInitialized: true,
      userId: user.id,
    },
  });
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${owner}` },
    })
  );
  const lease = await claimEditorLease(
    identity,
    "response",
    responseId,
    formId
  );
  const scope = {
    documentKey,
    formId,
    targetId: responseId,
    targetType: "response",
  } as const;
  exportCapability = actionEditorCapability(
    identity,
    scope,
    "export-workbook",
    lease
  );
  saveCapability = actionEditorCapability(identity, scope, "save-draft", lease);
  inactiveLeaseCapability = actionEditorCapability(
    identity,
    scope,
    "export-workbook",
    { ...lease, id: crypto.randomUUID() }
  );
});

afterAll(async () => {
  await prisma.editorLease.deleteMany({ where: { targetId: responseId } });
  await prisma.response.deleteMany({ where: { id: responseId } });
  // The published Form fixture stays immutable until the isolated database is removed.
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

test("editor export requires the owner and the browser session holding the export capability", async () => {
  expect((await exportRequest({ bearer: "" })).status).toBe(401);
  expect((await exportRequest({ capability: "" })).status).toBe(401);
  expect((await exportRequest({ bearer: otherOwnerSession })).status).toBe(403);
  expect((await exportRequest({ bearer: otherUser })).status).toBe(403);
  expect((await exportRequest({ capability: saveCapability })).status).toBe(
    403
  );
  expect((await exportRequest({ format: "docx" })).status).toBe(404);
});

test("editor export rejects a different origin, different workbook, or expired cache entry", async () => {
  const differentOrigin = new URL(snapshotUrl());
  differentOrigin.hostname = "outside.example.test";
  expect((await exportRequest({ url: differentOrigin.href })).status).toBe(400);
  expect(
    (
      await exportRequest({
        url: snapshotUrl(`response-${crypto.randomUUID()}`),
      })
    ).status
  ).toBe(400);
  expect(
    (await exportRequest({ url: snapshotUrl(documentKey, 1) })).status
  ).toBe(400);
});

test("editor export copies safe workbook bytes and blocks external resources before PDF conversion", async () => {
  const safe = new Uint8Array(fixtureWorkbook());
  const external = mutatePart(safe, "xl/_rels/workbook.xml.rels", (xml) =>
    xml.replace(
      "</Relationships>",
      '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" TargetMode="External" Target="https://outside.example.test/remote.png"/></Relationships>'
    )
  );
  const upstream = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(safe))
    .mockResolvedValueOnce(new Response(external));
  try {
    const download = await exportRequest();
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(safe);
    expect(new URL(String(upstream.mock.calls[0]?.[0])).origin).toBe(
      new URL(env.ONLYOFFICE_INTERNAL_URL).origin
    );
    expect(upstream.mock.calls[0]?.[1]?.redirect).toBe("error");
    expect((await exportRequest({ format: "pdf" })).status).toBe(422);
  } finally {
    upstream.mockRestore();
  }
  const draft = await app.handle(
    new Request(`http://test.local/api/responses/${responseId}/draft/json`, {
      headers: { Authorization: `Bearer ${owner}` },
    })
  );
  expect(draft.status).toBe(200);
  expect(await draft.json()).toEqual({ value: 100 });
});

test("editor export requires a lease that is still active", async () => {
  expect(
    (await exportRequest({ capability: inactiveLeaseCapability })).status
  ).toBe(409);
});
