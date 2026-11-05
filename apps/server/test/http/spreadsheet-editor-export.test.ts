// oxlint-disable unicorn/no-await-expression-member -- Keep HTTP assertions next to their requests.
import { afterAll, beforeAll, expect, mock, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { env } from "@onlyoffice/env/server";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import { createOnlyOfficeClient } from "../../src/onlyoffice";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook, mutatePart } from "../spreadsheet-unit/fixture";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Workbook export HTTP tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const internalOfficeUrl = "http://office.internal.test/onlyoffice";
const maxDownloadBytes = 64_000;
const upstream = mock<(url: string, init?: RequestInit) => Promise<Response>>();
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: createOnlyOfficeClient({
    fetch: upstream,
    internalUrl: internalOfficeUrl,
    maxDownloadBytes,
  }),
  pdmsProjects: null,
});
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
  upstream
    .mockReset()
    .mockResolvedValueOnce(new Response(safe))
    .mockResolvedValueOnce(new Response(external));
  const download = await exportRequest();
  expect(download.status).toBe(200);
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(safe);
  expect(upstream.mock.calls[0]?.[0]).toStartWith(
    `${internalOfficeUrl}/cache/files/data/${documentKey}_`
  );
  expect(upstream.mock.calls[0]?.[1]?.redirect).toBe("error");
  expect((await exportRequest({ format: "pdf" })).status).toBe(422);
  expect(upstream).toHaveBeenCalledTimes(2);
  const draft = await app.handle(
    new Request(`http://test.local/api/responses/${responseId}/draft/json`, {
      headers: { Authorization: `Bearer ${owner}` },
    })
  );
  expect(draft.status).toBe(200);
  expect(await draft.json()).toEqual({ value: 100 });
});

test("editor export uses the same configured client for the cache and PDF conversion", async () => {
  const pdf = new TextEncoder().encode("%PDF-fixture");
  const outputUrl = `${internalOfficeUrl}/converted/snapshot.pdf`;
  upstream
    .mockReset()
    .mockResolvedValueOnce(new Response(fixtureWorkbook()))
    .mockResolvedValueOnce(Response.json({ fileUrl: outputUrl }))
    .mockResolvedValueOnce(new Response(pdf));

  const download = await exportRequest({ format: "pdf" });
  expect(download.status).toBe(200);
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(pdf);
  expect(upstream.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    expect.stringMatching(/^\/onlyoffice\/cache\/files\/data\//u),
    "/onlyoffice/converter",
    "/onlyoffice/converted/snapshot.pdf",
  ]);
});

test("editor export enforces the configured download limit on the signed cache", async () => {
  upstream
    .mockReset()
    .mockResolvedValueOnce(new Response(new Uint8Array(maxDownloadBytes + 1)));
  const download = await exportRequest();
  expect(download.status).toBe(502);
  expect(await download.json()).toMatchObject({
    error: "workbook_capture_failed",
  });
});

test("editor export requires a lease that is still active", async () => {
  expect(
    (await exportRequest({ capability: inactiveLeaseCapability })).status
  ).toBe(409);
});
