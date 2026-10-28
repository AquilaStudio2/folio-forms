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
  signIn,
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
  const ownDraftId = crypto.randomUUID();
  const ownDraftObjectKey = `responses/${ownDraftId}/draft.docx`;
  await putObject(
    ownDraftObjectKey,
    docxXmlFixture({ document: contentControlDocument("") })
  );
  const ownDraft = await prisma.response.create({
    data: {
      draftData: { name: "Old own draft" },
      draftDocumentKey: crypto.randomUUID(),
      draftObjectKey: ownDraftObjectKey,
      formId: form.id,
      id: ownDraftId,
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

test("Admin creates local VIEWER with temporary password and mandatory replacement before results", async () => {
  const f = await fixture();
  const password = "Local-viewer-admin-password!";
  const admin = await createCredentialFixture({
    email: `local-admin-${crypto.randomUUID()}@example.test`,
    name: "Local Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  const email = `local-viewer-${crypto.randomUUID()}@example.test`;
  const created = await f.request(
    "/api/admin/users",
    "POST",
    { email: ` ${email.toUpperCase()} `, name: "Local Viewer", role: "viewer" },
    token
  );
  expect(created.status).toBe(200);
  const result = (await created.json()) as {
    temporaryPassword: string;
    user: { id: string };
  };
  const { temporaryPassword } = result;
  expect(typeof temporaryPassword).toBe("string");
  expect(result).toMatchObject({
    temporaryPassword: expect.any(String),
    user: { email, enabled: true, mustChangePassword: true, role: "viewer" },
  });
  const temporaryToken = await bearerFor(app, email, temporaryPassword);
  expect(
    await (
      await f.request("/api/session", "GET", undefined, temporaryToken)
    ).json()
  ).toMatchObject({ user: { mustChangePassword: true, role: "viewer" } });
  expect(
    await (
      await f.request("/api/admin/results", "GET", undefined, temporaryToken)
    ).json()
  ).toMatchObject({ error: "password_change_required" });
  const replaced = await f.request(
    "/api/account/password",
    "POST",
    {
      currentPassword: temporaryPassword,
      newPassword: "Local-viewer-new-password!",
    },
    temporaryToken
  );
  expect(replaced.status).toBe(200);
  expect(
    (await f.request("/api/session", "GET", undefined, temporaryToken)).status
  ).toBe(401);
  const currentToken = await bearerFor(
    app,
    email,
    "Local-viewer-new-password!"
  );
  expect(
    await (
      await f.request("/api/session", "GET", undefined, currentToken)
    ).json()
  ).toMatchObject({ user: { mustChangePassword: false, role: "viewer" } });
  expect(
    (
      await f.request(
        `/api/admin/results/${f.response.id}`,
        "GET",
        undefined,
        currentToken
      )
    ).status
  ).toBe(200);
  expect(
    (
      await f.request(
        `/api/forms/${f.form.publicId}/start`,
        "POST",
        {},
        currentToken
      )
    ).status
  ).toBe(403);
  expect(
    (await f.request("/api/admin/users", "GET", undefined, currentToken)).status
  ).toBe(403);
  const duplicate = await f.request(
    "/api/admin/users",
    "POST",
    { email, name: "Duplicate", role: "viewer" },
    token
  );
  expect(duplicate.status).toBe(409);
  for (const role of ["VIEWER", "viewers", "unknown"]) {
    expect(
      (
        await f.request(
          "/api/admin/users",
          "POST",
          {
            email: `invalid-${crypto.randomUUID()}@example.test`,
            name: "Invalid",
            role,
          },
          token
        )
      ).status
    ).toBe(400);
  }
});

test("Admin changes User to VIEWER and revokes existing sessions without changing saved responses", async () => {
  const f = await fixture();
  const password = "Viewer-role-change-password!";
  const admin = await createCredentialFixture({
    email: `change-admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  const target = await createCredentialFixture({
    email: `change-user-${crypto.randomUUID()}@example.test`,
    name: "User",
    password,
  });
  const oldToken = await bearerFor(app, target.email, password);
  const changed = await f.request(
    `/api/admin/users/${target.id}`,
    "PATCH",
    { role: "viewer" },
    token
  );
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({
    user: { id: target.id, role: "viewer" },
  });
  expect(
    (await f.request("/api/session", "GET", undefined, oldToken)).status
  ).toBe(401);
  const currentToken = await bearerFor(app, target.email, password);
  expect(
    await (
      await f.request("/api/session", "GET", undefined, currentToken)
    ).json()
  ).toMatchObject({ user: { id: target.id, role: "viewer" } });
  expect(
    (
      await f.request(
        `/api/admin/results/${f.response.id}`,
        "GET",
        undefined,
        currentToken
      )
    ).status
  ).toBe(200);
  expect(
    (
      await f.request(
        `/api/forms/${f.form.publicId}/start`,
        "POST",
        {},
        currentToken
      )
    ).status
  ).toBe(403);
  expect(
    await (await f.request(`/api/admin/results/${f.response.id}`)).json()
  ).toMatchObject({ result: { data: { name: "Saved answer" } } });
});

test("User and VIEWER role changes have neutral audit events while Admin transitions retain their meaning", async () => {
  const f = await fixture();
  const password = "Viewer-audit-password!";
  const admin = await createCredentialFixture({
    email: `audit-admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  const changed = await f.request(
    `/api/admin/users/${f.viewer.id}`,
    "PATCH",
    { role: "user" },
    token
  );
  expect(changed.status).toBe(200);
  const audits = await f.request(
    `/api/admin/audit-events?target=${f.viewer.id}`,
    "GET",
    undefined,
    token
  );
  expect(await audits.json()).toMatchObject({
    events: expect.arrayContaining([
      expect.objectContaining({
        action: "update_user",
        safeMetadata: { change: "role_changed" },
      }),
    ]),
  });
});

test("Admin supports all six role transitions with session invalidation and meaningful audits", async () => {
  const f = await fixture();
  const password = "Viewer-transition-password!";
  const admin = await createCredentialFixture({
    email: `transition-admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  for (const [initial, role, action, change] of [
    ["admin", "user", "demote_user", "demoted"],
    ["admin", "viewer", "demote_user", "demoted"],
    ["user", "admin", "promote_user", "promoted"],
    ["user", "viewer", "update_user", "role_changed"],
    ["viewer", "admin", "promote_user", "promoted"],
    ["viewer", "user", "update_user", "role_changed"],
  ] as const) {
    const target = await createCredentialFixture({
      email: `transition-${crypto.randomUUID()}@example.test`,
      name: "Transition target",
      password,
      role: initial,
    });
    const oldToken = await bearerFor(app, target.email, password);
    const changed = await f.request(
      `/api/admin/users/${target.id}`,
      "PATCH",
      { role },
      token
    );
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({
      user: { id: target.id, role },
    });
    expect(
      (await f.request("/api/session", "GET", undefined, oldToken)).status
    ).toBe(401);
    const currentToken = await bearerFor(app, target.email, password);
    expect(
      await (
        await f.request("/api/session", "GET", undefined, currentToken)
      ).json()
    ).toMatchObject({ user: { id: target.id, role } });
    expect(
      (
        await f.request(
          `/api/admin/results/${f.response.id}`,
          "GET",
          undefined,
          currentToken
        )
      ).status
    ).toBe(role === "user" ? 403 : 200);
    expect(
      (await f.request("/api/admin/users", "GET", undefined, currentToken))
        .status
    ).toBe(role === "admin" ? 200 : 403);
    const audits = await f.request(
      `/api/admin/audit-events?target=${target.id}`,
      "GET",
      undefined,
      token
    );
    expect(await audits.json()).toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ action, safeMetadata: { change } }),
      ]),
    });
    const unchanged = await f.request(
      `/api/admin/users/${target.id}`,
      "PATCH",
      { role },
      token
    );
    expect(unchanged.status).toBe(200);
    expect(
      (await f.request("/api/session", "GET", undefined, currentToken)).status
    ).toBe(401);
  }
});

test("restoring VIEWER to User never revives editor credentials from a revoked session", async () => {
  const f = await fixture();
  const password = "Viewer-editor-restore-password!";
  const admin = await createCredentialFixture({
    email: `restore-admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  expect(
    (
      await f.request(
        `/api/admin/users/${f.viewer.id}`,
        "PATCH",
        { role: "user" },
        token
      )
    ).status
  ).toBe(200);
  const userToken = await bearerFor(
    app,
    f.viewer.email,
    "Viewer-regression-password!"
  );
  const editor = await f.request(
    `/api/forms/${f.form.publicId}/editor-config?responseId=${f.ownDraft.id}`,
    "GET",
    undefined,
    userToken
  );
  expect(editor.status).toBe(200);
  const config = (await editor.json()) as {
    bridge: { capabilities: { "save-draft": string } };
    config: { document: { key: string } };
  };
  const save = () =>
    app.handle(
      new Request(`http://test.local/api/forms/${f.form.publicId}/draft`, {
        body: JSON.stringify({
          data: { name: "Unauthorized change" },
          documentKey: config.config.document.key,
          responseId: f.ownDraft.id,
        }),
        headers: {
          ...jsonHeaders,
          "X-Editor-Capability": config.bridge.capabilities["save-draft"],
        },
        method: "POST",
      })
    );
  expect(
    (
      await f.request(
        `/api/admin/users/${f.viewer.id}`,
        "PATCH",
        { role: "viewer" },
        token
      )
    ).status
  ).toBe(200);
  expect((await save()).status).toBe(401);
  expect(
    (
      await f.request(
        `/api/admin/users/${f.viewer.id}`,
        "PATCH",
        { role: "user" },
        token
      )
    ).status
  ).toBe(200);
  expect((await save()).status).toBe(409);
  const saved = await f.request(
    `/api/admin/results/${f.ownDraft.id}`,
    "GET",
    undefined,
    token
  );
  expect(await saved.json()).toMatchObject({
    result: { data: { name: "Old own draft" } },
  });
});

test("local VIEWER reset, disable, enable and email change preserve role and revoke access", async () => {
  const f = await fixture();
  const password = "Viewer-lifecycle-admin-password!";
  const admin = await createCredentialFixture({
    email: `lifecycle-admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  const oldToken = await bearerFor(
    app,
    f.viewer.email,
    "Viewer-regression-password!"
  );
  const path = `/api/admin/users/${f.viewer.id}`;
  expect(
    (await f.request(path, "PATCH", { enabled: false }, token)).status
  ).toBe(200);
  expect(
    (await f.request("/api/session", "GET", undefined, oldToken)).status
  ).toBe(401);
  expect(
    (await signIn(app, f.viewer.email, "Viewer-regression-password!")).status
  ).toBe(401);
  const reset = await f.request(`${path}/password-reset`, "POST", {}, token);
  expect(reset.status).toBe(200);
  const resetBody = (await reset.json()) as { temporaryPassword: string };
  const { temporaryPassword } = resetBody;
  expect(resetBody).toMatchObject({
    user: { enabled: false, mustChangePassword: true, role: "viewer" },
  });
  expect((await signIn(app, f.viewer.email, temporaryPassword)).status).toBe(
    401
  );
  expect(
    (await f.request(path, "PATCH", { enabled: true }, token)).status
  ).toBe(200);
  expect(
    (await signIn(app, f.viewer.email, "Viewer-regression-password!")).status
  ).toBe(401);
  const temporaryToken = await bearerFor(
    app,
    f.viewer.email,
    temporaryPassword
  );
  expect(
    await (
      await f.request("/api/admin/results", "GET", undefined, temporaryToken)
    ).json()
  ).toMatchObject({ error: "password_change_required" });
  const permanentPassword = "Viewer-reset-permanent-password!";
  expect(
    (
      await f.request(
        "/api/account/password",
        "POST",
        { currentPassword: temporaryPassword, newPassword: permanentPassword },
        temporaryToken
      )
    ).status
  ).toBe(200);
  const currentToken = await bearerFor(app, f.viewer.email, permanentPassword);
  const newEmail = `updated-viewer-${crypto.randomUUID()}@example.test`;
  const edited = await f.request(path, "PATCH", { email: newEmail }, token);
  expect(await edited.json()).toMatchObject({
    user: {
      email: newEmail,
      enabled: true,
      mustChangePassword: false,
      role: "viewer",
    },
  });
  expect(
    (await f.request("/api/session", "GET", undefined, currentToken)).status
  ).toBe(401);
  expect((await signIn(app, f.viewer.email, permanentPassword)).status).toBe(
    401
  );
  const updatedToken = await bearerFor(app, newEmail, permanentPassword);
  expect(
    await (
      await f.request("/api/session", "GET", undefined, updatedToken)
    ).json()
  ).toMatchObject({ user: { email: newEmail, role: "viewer" } });
  expect(
    (await f.request("/api/admin/results", "GET", undefined, updatedToken))
      .status
  ).toBe(200);
});

test("VIEWER account deletion preserves response erasure and cleanup preconditions", async () => {
  const f = await fixture();
  const password = "Viewer-erasure-admin-password!";
  const admin = await createCredentialFixture({
    email: `erasure-admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  const path = `/api/admin/users/${f.viewer.id}`;
  expect(
    (await f.request(path, "DELETE", { confirm: false }, token)).status
  ).toBe(400);
  const guarded = await f.request(path, "DELETE", { confirm: true }, token);
  expect(guarded.status).toBe(409);
  expect(await guarded.json()).toMatchObject({
    error: "personal_data_remains",
  });
  expect(
    (
      await f.request(
        `/api/admin/results/${f.ownDraft.id}`,
        "GET",
        undefined,
        token
      )
    ).status
  ).toBe(200);
  expect(
    (
      await f.request(
        `/api/admin/responses/${f.ownDraft.id}`,
        "DELETE",
        { confirm: true },
        token
      )
    ).status
  ).toBe(200);
  const deleted = await f.request(path, "DELETE", { confirm: true }, token);
  expect(deleted.status).toBe(200);
  expect(await deleted.json()).toEqual({ deleted: true });
  expect(
    (await signIn(app, f.viewer.email, "Viewer-regression-password!")).status
  ).toBe(401);
});

test("last enabled Admin cannot become VIEWER, disable or delete and concurrent demotions retain an Admin", async () => {
  const f = await fixture();
  const password = "Viewer-last-admin-password!";
  const first = await createCredentialFixture({
    email: `last-admin-a-${crypto.randomUUID()}@example.test`,
    name: "Admin A",
    password,
    role: "admin",
  });
  const second = await createCredentialFixture({
    email: `last-admin-b-${crypto.randomUUID()}@example.test`,
    name: "Admin B",
    password,
    role: "admin",
  });
  const others = await prisma.user.findMany({
    select: { id: true },
    where: {
      enabled: true,
      id: { notIn: [first.id, second.id] },
      role: "admin",
    },
  });
  await prisma.user.updateMany({
    data: { enabled: false },
    where: { id: { in: others.map(({ id }) => id) } },
  });
  try {
    const firstToken = await bearerFor(app, first.email, password);
    const secondToken = await bearerFor(app, second.email, password);
    const outcomes = await Promise.all([
      f.request(
        `/api/admin/users/${first.id}`,
        "PATCH",
        { role: "viewer" },
        firstToken
      ),
      f.request(
        `/api/admin/users/${second.id}`,
        "PATCH",
        { role: "viewer" },
        secondToken
      ),
    ]);
    expect(outcomes.map(({ status }) => status).toSorted()).toEqual([200, 409]);
    const survivor = outcomes[0]?.status === 409 ? first : second;
    const token = outcomes[0]?.status === 409 ? firstToken : secondToken;
    for (const [method, body] of [
      ["PATCH", { role: "viewer" }],
      ["PATCH", { enabled: false }],
      ["DELETE", { confirm: true }],
    ] as const) {
      const blocked = await f.request(
        `/api/admin/users/${survivor.id}`,
        method,
        body,
        token
      );
      expect(blocked.status).toBe(409);
      expect(await blocked.json()).toMatchObject({
        error: "final_admin_required",
      });
    }
    expect(
      await (
        await f.request(
          "/api/admin/users?role=admin&enabled=true",
          "GET",
          undefined,
          token
        )
      ).json()
    ).toMatchObject({
      users: [
        expect.objectContaining({
          enabled: true,
          id: survivor.id,
          role: "admin",
        }),
      ],
    });
  } finally {
    await prisma.user.updateMany({
      data: { enabled: true },
      where: { id: { in: others.map(({ id }) => id) } },
    });
  }
});

test("VIEWER filtering combines email and status and paginates without losing role labels", async () => {
  const f = await fixture();
  const password = "Viewer-filter-admin-password!";
  const admin = await createCredentialFixture({
    email: `filter-admin-${crypto.randomUUID()}@example.test`,
    name: "Admin",
    password,
    role: "admin",
  });
  const token = await bearerFor(app, admin.email, password);
  const prefix = `viewer-pages-${crypto.randomUUID()}`;
  await prisma.user.createMany({
    data: Array.from({ length: 21 }, (_, index) => ({
      email: `${prefix}-${index}@example.test`,
      enabled: true,
      id: crypto.randomUUID(),
      name: "Viewer page",
      role: "viewer" as const,
    })),
  });
  const path = `/api/admin/users?role=viewer&enabled=true&email=${prefix}`;
  const first = (await (
    await f.request(path, "GET", undefined, token)
  ).json()) as { users: { id: string; role: string }[]; nextCursor: string };
  expect(first.users).toHaveLength(20);
  expect(first.users.every(({ role }) => role === "viewer")).toBe(true);
  const second = (await (
    await f.request(
      `${path}&cursor=${first.nextCursor}`,
      "GET",
      undefined,
      token
    )
  ).json()) as {
    users: { id: string; role: string }[];
    nextCursor: string | null;
  };
  expect(second.users).toHaveLength(1);
  expect(second.users[0]?.role).toBe("viewer");
  expect(second.nextCursor).toBeNull();
  expect(
    new Set([...first.users, ...second.users].map(({ id }) => id)).size
  ).toBe(21);
});
