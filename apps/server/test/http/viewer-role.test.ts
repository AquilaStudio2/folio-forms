// oxlint-disable func-style no-await-in-loop no-await-expression-member complexity -- Authorization scenarios observe HTTP boundaries with isolated persisted fixtures.
import { expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { putObject } from "../../src/storage";
import { docxXmlFixture, contentControlDocument } from "../fixtures/documents";
import {
  bearerFor,
  createCredentialFixture,
  jsonHeaders,
} from "../fixtures/http";

const app = createApp({
  legacySso: null,
  onlyOffice: {
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-viewer")),
    forceSave: () => Promise.resolve(true),
  },
});

async function fixture() {
  const password = "Viewer-regression-password!";
  const viewer = await createCredentialFixture({
    email: `viewer-${crypto.randomUUID()}@example.test`,
    name: "VIEWER",
    password,
  });
  await prisma.user.update({
    data: { role: "viewer" },
    where: { id: viewer.id },
  });
  const owner = await createCredentialFixture({
    email: `owner-${crypto.randomUUID()}@example.test`,
    name: "Owner",
    password,
  });
  const objectKey = `tests/viewer/${crypto.randomUUID()}.docx`;
  await putObject(
    objectKey,
    docxXmlFixture({ document: contentControlDocument("") })
  );
  const form = await prisma.form.create({
    data: {
      publicId: crypto.randomUUID().replaceAll("-", ""),
      publishedTemplate: {
        create: {
          contentHash: "fixture",
          documentKey: crypto.randomUUID(),
          manifest: {
            create: {
              configurationHash: "fixture",
              fields: {
                create: {
                  label: "Name",
                  position: 0,
                  tag: "name",
                  type: "text",
                },
              },
            },
          },
          objectKey,
          version: 1,
        },
      },
      status: "published",
      title: "Viewer shared results",
      version: 1,
    },
    include: { publishedTemplate: true },
  });
  const { publishedTemplate } = form;
  if (!publishedTemplate) {
    throw new Error("The published fixture template is missing");
  }
  const response = await prisma.response.create({
    data: {
      formId: form.id,
      publishedTemplateId: publishedTemplate.id,
      publishedVersion: 1,
      status: "submitted",
      userId: owner.id,
    },
  });
  const submission = await prisma.submission.create({
    data: {
      data: { name: "Saved answer" },
      documentKey: crypto.randomUUID(),
      formId: form.id,
      objectKey,
      responseId: response.id,
      userId: owner.id,
    },
  });
  const ownDraft = await prisma.response.create({
    data: {
      draftData: { name: "Old own draft" },
      draftDocumentKey: crypto.randomUUID(),
      draftObjectKey: objectKey,
      formId: form.id,
      publishedTemplateId: publishedTemplate.id,
      publishedVersion: 1,
      status: "draft",
      userId: viewer.id,
    },
  });
  const draftOwner = await prisma.user.create({
    data: {
      email: `draft-owner-${crypto.randomUUID()}@example.test`,
      enabled: true,
      id: crypto.randomUUID(),
      name: "Draft owner",
    },
  });
  const foreignDraft = await prisma.response.create({
    data: {
      draftData: { name: "Other saved draft" },
      draftDocumentKey: crypto.randomUUID(),
      draftObjectKey: objectKey,
      formId: form.id,
      publishedTemplateId: publishedTemplate.id,
      publishedVersion: 1,
      status: "draft",
      userId: draftOwner.id,
    },
  });
  const viewerBearer = await bearerFor(app, viewer.email, password);
  const ownerBearer = await bearerFor(app, owner.email, password);
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    token = viewerBearer
  ) =>
    app.handle(
      new Request(`http://test.local${path}`, {
        headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  return {
    foreignDraft,
    form,
    objectKey,
    ownDraft,
    ownerBearer,
    request,
    response,
    submission,
    viewer,
  };
}

test("VIEWER reads everyone's saved result list, detail and read-only preview", async () => {
  const f = await fixture();
  const list = await f.request(`/api/admin/results?form=${f.form.publicId}`);
  expect(list.status).toBe(200);
  expect(await list.json()).toMatchObject({
    results: expect.arrayContaining([
      expect.objectContaining({ id: f.response.id }),
      expect.objectContaining({ id: f.ownDraft.id }),
    ]),
  });
  const detail = await f.request(`/api/admin/results/${f.response.id}`);
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({
    result: { data: { name: "Saved answer" } },
  });
  const preview = await f.request(
    `/api/admin/results/${f.ownDraft.id}/viewer-config`
  );
  expect(preview.status).toBe(200);
  const config = (await preview.json()) as {
    bridge?: unknown;
    config: { editorConfig: { callbackUrl?: unknown; plugins?: unknown } };
  };
  expect(config).toMatchObject({
    config: {
      document: {
        permissions: {
          comment: false,
          download: false,
          edit: false,
          fillForms: false,
          review: false,
        },
      },
      editorConfig: { mode: "view" },
    },
  });
  expect(config.bridge).toBeUndefined();
  expect(config.config.editorConfig.callbackUrl).toBeUndefined();
  expect(config.config.editorConfig.plugins).toBeUndefined();
  expect(
    (
      await f.request(
        `/api/admin/results/${f.response.id}`,
        "GET",
        undefined,
        f.ownerBearer
      )
    ).status
  ).toBe(403);
});

test("VIEWER reads submission history and downloads saved results from every owner", async () => {
  const f = await fixture();
  for (const path of [
    `/api/submissions/${f.submission.id}/data`,
    `/api/submissions/${f.submission.id}/corrections`,
    `/api/responses/${f.response.id}/corrections`,
    `/api/submissions/${f.submission.id}/json`,
    `/api/submissions/${f.submission.id}/docx`,
    `/api/submissions/${f.submission.id}/pdf`,
    `/api/responses/${f.foreignDraft.id}/draft/json`,
    `/api/responses/${f.foreignDraft.id}/draft/docx`,
    `/api/responses/${f.foreignDraft.id}/draft/pdf`,
  ]) {
    const result = await f.request(path);
    expect({ path, status: result.status }).toEqual({ path, status: 200 });
  }
  // Viewing a saved Draft also permits its available exports.
  const foreignDraft = await f.request(
    `/api/responses/${f.ownDraft.id}/draft/json`,
    "GET",
    undefined,
    f.ownerBearer
  );
  expect(foreignDraft.status).toBe(403);
  const detail = await f.request(`/api/submissions/${f.submission.id}/data`);
  expect(await detail.json()).toMatchObject({
    data: { name: "Saved answer" },
    submission: { userEmail: expect.any(String) },
  });
});

test("VIEWER cannot mutate even their own old responses or obtain editing credentials", async () => {
  const f = await fixture();
  for (const [method, path] of [
    ["POST", `/api/forms/${f.form.publicId}/start`],
    [
      "GET",
      `/api/forms/${f.form.publicId}/editor-config?responseId=${f.ownDraft.id}`,
    ],
    ["POST", `/api/forms/${f.form.publicId}/draft`],
    ["POST", `/api/forms/${f.form.publicId}/submit`],
    ["DELETE", `/api/responses/${f.ownDraft.id}`],
    ["GET", `/api/admin/results/${f.response.id}/correction/editor-config`],
    ["POST", `/api/admin/results/${f.response.id}/correction`],
    ["POST", `/api/editor-leases/${crypto.randomUUID()}/renew`],
    ["DELETE", `/api/editor-leases/${crypto.randomUUID()}`],
    ["POST", "/api/admin/forms"],
    ["PATCH", `/api/admin/forms/${f.form.publicId}`],
    ["DELETE", `/api/admin/forms/${f.form.publicId}`],
    ["POST", "/api/admin/users"],
    ["PATCH", `/api/admin/users/${f.viewer.id}`],
    ["POST", "/api/admin/ai-authoring/sessions"],
  ] as const) {
    const result = await f.request(
      path,
      method,
      method === "GET" || method === "DELETE" ? undefined : {}
    );
    expect({ path, status: result.status }).toEqual({ path, status: 403 });
  }
  const saved = await f.request(`/api/admin/results/${f.ownDraft.id}`);
  expect(await saved.json()).toMatchObject({
    result: { data: { name: "Old own draft" } },
  });
  for (const path of [
    "/api/admin/users",
    "/api/admin/forms",
    "/api/admin/account-links",
    "/api/admin/audit-events",
    "/api/admin/ai-authoring",
  ]) {
    expect({ path, status: (await f.request(path)).status }).toEqual({
      path,
      status: 403,
    });
  }
});

test("Admin account management represents and preserves mapped VIEWER accounts", async () => {
  const f = await fixture();
  const password = "Viewer-admin-password!";
  const admin = await createCredentialFixture({
    email: `admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  const list = await f.request(
    `/api/admin/users?role=viewer&email=${encodeURIComponent(f.viewer.email)}`,
    "GET",
    undefined,
    token
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toMatchObject({
    users: expect.arrayContaining([
      expect.objectContaining({ id: f.viewer.id, role: "viewer" }),
    ]),
  });
  const edit = await f.request(
    `/api/admin/users/${f.viewer.id}`,
    "PATCH",
    { email: `changed-${crypto.randomUUID()}@example.test` },
    token
  );
  expect(edit.status).toBe(200);
  expect(await edit.json()).toMatchObject({
    user: { id: f.viewer.id, role: "viewer" },
  });
});
