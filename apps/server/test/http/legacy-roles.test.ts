// oxlint-disable func-style no-await-in-loop no-await-expression-member complexity -- Role-sync scenarios keep awaited state assertions beside each sequential transition.
import { afterEach, expect, spyOn, test } from "bun:test";

import { auth } from "@onlyoffice/auth";
import { prisma } from "@onlyoffice/db";
import { startLegacySsoMock } from "prefill-mock/mock";
import type { LegacySsoMockServer } from "prefill-mock/mock";

import * as passwordSession from "../../src/auth/password-session";
import { editorAuthorization } from "../../src/editor/authorization";
import { verifyEditorCapability } from "../../src/onlyoffice";
import {
  bearerFor,
  createCredentialFixture,
  formCreationRequest,
  jsonHeaders,
} from "../fixtures/http";
import type { EditorConfigBody } from "../fixtures/http";
import {
  claimLegacySsoBearer,
  completeAuthenticatedLegacySsoCallback,
  completeLegacySsoCallback,
  cookiePairFrom,
  createLegacySsoTestApp,
  legacyAccountLinkSnapshot,
  legacySsoCallbackUrl,
  legacySsoFailedLocation,
  legacySsoPendingLocation,
  legacySsoWebOrigin,
  startLegacySsoBrowser,
  submitLegacyAccountLinkReview,
} from "../fixtures/legacy-sso";

function redirectLocation(response: Response): string {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("The SSO response did not return a redirect");
  }
  return location;
}

const mocks: LegacySsoMockServer[] = [];
afterEach(() => {
  for (const mock of mocks.splice(0)) {
    mock.close();
  }
});

async function fixture({
  roles = [],
  role = "user",
  lastMappedRole = null,
  mustChangePassword = false,
}: {
  roles?: string[];
  role?: "admin" | "user";
  lastMappedRole?: "admin" | "user" | null;
  mustChangePassword?: boolean;
} = {}) {
  const password = "Folio-role-sync-password";
  const user = await createCredentialFixture({
    email: `sso-role-${crypto.randomUUID()}@example.com`,
    mustChangePassword,
    name: "Original Folio profile",
    password,
    role,
  });
  const identity = {
    email: user.email,
    email_verified: false,
    name: "PDMS name",
    roles,
    sub: crypto.randomUUID(),
  };
  const providerId = `pdms-role-${crypto.randomUUID()}`;
  const clientId = `folio-${crypto.randomUUID()}`;
  const clientSecret = `test-client-secret-${crypto.randomUUID()}`;
  const account = await prisma.account.create({
    data: {
      accountId: identity.sub,
      id: crypto.randomUUID(),
      issuer: providerId,
      lastMappedRole,
      providerId,
      userId: user.id,
    },
  });
  const mock = startLegacySsoMock({
    callbackUrl: legacySsoCallbackUrl,
    clientId,
    clientSecret,
    identity,
  });
  mocks.push(mock);
  const app = createLegacySsoTestApp({
    authorizeUrl: mock.authorizeUrl,
    callbackUrl: legacySsoCallbackUrl,
    clientId,
    clientSecret,
    exchangeUrl: mock.exchangeUrl,
    providerId,
  });
  const handle = (request: Request) => app.handle(request);
  const localBearer = await bearerFor(app, user.email, password);
  return {
    account,
    app,
    handle,
    identity,
    localBearer,
    password,
    providerId,
    user,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const readSession = (f: Fixture, token: string) =>
  f.handle(
    new Request("https://folio.example.test/api/session", {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
const readAccount = (f: Fixture) =>
  prisma.account.findUniqueOrThrow({ where: { id: f.account.id } });
const readUser = (f: Fixture) =>
  prisma.user.findUniqueOrThrow({ where: { id: f.user.id } });

async function login(f: Fixture) {
  const callback = await completeLegacySsoCallback(f.handle);
  expect(callback.status).toBe(303);
  const bearer = await claimLegacySsoBearer(f.handle, callback);
  return { bearer, callback };
}

async function stageSwitch(
  f: Fixture,
  initiator: Fixture,
  returnTo = "/admin"
) {
  const { callback } = await completeAuthenticatedLegacySsoCallback(
    f.handle,
    initiator.localBearer,
    returnTo
  );
  expect(callback.headers.get("location")).toBe(
    new URL("/legacy-sso/confirm", legacySsoWebOrigin).href
  );
  const cookie = cookiePairFrom(callback, "__Host-folio-sso-switch");
  const headers = {
    ...jsonHeaders,
    Authorization: `Bearer ${initiator.localBearer}`,
    Cookie: cookie,
    Origin: legacySsoWebOrigin,
  };
  const details = await f.handle(
    new Request("https://folio.example.test/api/legacy-sso/switch", { headers })
  );
  expect(details.status).toBe(200);
  const snapshot = (await details.json()) as {
    confirmationFingerprint: string;
    returnTo: string;
  };
  const decide = (decision: "confirm" | "cancel") =>
    f.handle(
      new Request(
        `https://folio.example.test/api/legacy-sso/switch/${decision}`,
        {
          body: JSON.stringify({
            confirmationFingerprint: snapshot.confirmationFingerprint,
          }),
          headers,
          method: "POST",
        }
      )
    );
  return { decide, snapshot };
}

for (const [roles, expected] of [
  [["admin (กปม.)"], "admin"],
  [["เจ้าหน้าที่ กปม."], "admin"],
  [["other", "เจ้าหน้าที่ กปม.", "another"], "admin"],
  [[], "user"],
  [
    [
      "admin",
      "Admin (กปม.)",
      " admin (กปม.)",
      "admin (กปม.) ",
      "เจ้าหน้าที่ กปม.อื่น",
    ],
    "user",
  ],
] as const) {
  test(`SSO initializes exact mapping ${JSON.stringify(roles)} as ${expected}`, async () => {
    const f = await fixture({ roles: [...roles] });
    const { callback, bearer } = await login(f);
    expect(callback.headers.get("location")).toBe(
      new URL(
        expected === "admin" ? "/admin" : "/dashboard",
        legacySsoWebOrigin
      ).href
    );
    const session = await readSession(f, bearer);
    expect(await session.json()).toMatchObject({
      session: { isSso: true },
      user: { id: f.user.id, role: expected },
    });
    const account = await readAccount(f);
    expect(account.lastMappedRole).toBe(expected);
    expect(account.lastSsoRoleGeneration).not.toBeNull();
    expect(await readUser(f)).toMatchObject({
      email: f.user.email,
      id: f.user.id,
      name: "Original Folio profile",
    });
    expect((await readSession(f, f.localBearer)).status).toBe(
      expected === "admin" ? 401 : 200
    );
    const adminAccess = await f.handle(
      new Request("https://folio.example.test/api/admin/users", {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    expect(adminAccess.status).toBe(expected === "admin" ? 200 : 403);
  });
}

test("first-time SSO provisions and maps Admin without a credential account", async () => {
  const f = await fixture({ roles: ["admin (กปม.)"] });
  f.identity.email = `new-sso-admin-${crypto.randomUUID()}@example.com`;
  f.identity.sub = crypto.randomUUID();
  const { bearer } = await login(f);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: f.identity.email },
  });
  expect(user).toMatchObject({
    emailVerified: false,
    mustChangePassword: false,
    role: "admin",
  });
  expect(
    await prisma.account.count({
      where: { providerId: "credential", userId: user.id },
    })
  ).toBe(0);
  expect(await (await readSession(f, bearer)).json()).toMatchObject({
    user: { id: user.id, role: "admin" },
  });
});

test("unchanged mapping preserves manual role, mapping changes override globally and revoke only effective changes", async () => {
  const f = await fixture();
  const reviewer = await fixture({ role: "admin" });
  const first = await login(f);
  const manualPromotion = await f.handle(
    new Request(`https://folio.example.test/api/admin/users/${f.user.id}`, {
      body: JSON.stringify({ role: "admin" }),
      headers: {
        ...jsonHeaders,
        Authorization: `Bearer ${reviewer.localBearer}`,
      },
      method: "PATCH",
    })
  );
  expect(manualPromotion.status).toBe(200);
  expect((await readAccount(f)).lastMappedRole).toBe("user");
  expect((await readSession(f, first.bearer)).status).toBe(401);
  const localAdminBearer = await bearerFor(f.app, f.user.email, f.password);
  const manualRoleLogin = await login(f);
  expect((await readUser(f)).role).toBe("admin");
  expect((await readAccount(f)).lastMappedRole).toBe("user");
  expect((await readSession(f, localAdminBearer)).status).toBe(200);
  f.identity.roles = ["เจ้าหน้าที่ กปม."];
  const mappedAdmin = await login(f);
  expect((await readAccount(f)).lastMappedRole).toBe("admin");
  expect((await readSession(f, manualRoleLogin.bearer)).status).toBe(200);
  expect((await readSession(f, localAdminBearer)).status).toBe(200);
  const audit = await prisma.auditEvent.findFirstOrThrow({
    orderBy: { createdAt: "desc" },
    where: { action: "sync_legacy_sso_role", targetId: f.user.id },
  });
  expect(audit.actorId).toBeNull();
  expect(audit.safeMetadata).toMatchObject({
    mappedRole: "admin",
    previousMappedRole: "user",
    previousRole: "admin",
    role: "admin",
    source: "pdms_sso",
  });
  f.identity.roles = [];
  const demoted = await login(f);
  expect((await readUser(f)).role).toBe("user");
  expect((await readAccount(f)).lastMappedRole).toBe("user");
  for (const token of [
    manualRoleLogin.bearer,
    mappedAdmin.bearer,
    localAdminBearer,
  ]) {
    expect((await readSession(f, token)).status).toBe(401);
  }
  expect((await readSession(f, demoted.bearer)).status).toBe(200);
});

test("unchanged Admin mapping preserves a manually downgraded User", async () => {
  const f = await fixture({
    lastMappedRole: "admin",
    role: "user",
    roles: ["admin (กปม.)"],
  });
  const oldSessionCount = await prisma.session.count({
    where: { userId: f.user.id },
  });
  const { bearer } = await login(f);
  expect((await readUser(f)).role).toBe("user");
  expect((await readAccount(f)).lastMappedRole).toBe("admin");
  expect((await readSession(f, f.localBearer)).status).toBe(200);
  expect(await prisma.session.count({ where: { userId: f.user.id } })).toBe(
    oldSessionCount + 1
  );
  expect((await readSession(f, bearer)).status).toBe(200);
});

test("switch cancellation preserves null baseline and role; confirmation applies the mapping once", async () => {
  const f = await fixture({ roles: ["admin (กปม.)"] });
  const initiator = await fixture({ role: "admin" });
  const original = await readAccount(f);
  const cancelled = await stageSwitch(f, initiator);
  expect((await readUser(f)).role).toBe("user");
  expect(await readAccount(f)).toEqual(original);
  expect((await cancelled.decide("cancel")).status).toBe(200);
  expect(await readAccount(f)).toEqual(original);
  expect((await readUser(f)).role).toBe("user");
  expect((await readSession(f, f.localBearer)).status).toBe(200);
  const confirmed = await stageSwitch(f, initiator);
  const response = await confirmed.decide("confirm");
  expect(response.status).toBe(200);
  expect(await response.clone().json()).toMatchObject({ returnTo: "/admin" });
  const token = await claimLegacySsoBearer(f.handle, response);
  expect((await readUser(f)).role).toBe("admin");
  expect((await readAccount(f)).lastMappedRole).toBe("admin");
  expect((await readSession(f, token)).status).toBe(200);
  expect((await readSession(f, f.localBearer)).status).toBe(401);
  expect((await readSession(initiator, initiator.localBearer)).status).toBe(
    200
  );
  expect((await confirmed.decide("confirm")).status).toBe(401);
});

test("later successful SSO fences an older callback even when it did not change the effective role", async () => {
  const f = await fixture({
    lastMappedRole: "admin",
    role: "admin",
    roles: ["admin (กปม.)"],
  });
  const older = await startLegacySsoBrowser(f.handle);
  const authorization = await fetch(older.authorizationUrl, {
    redirect: "manual",
  });
  const callbackUrl = redirectLocation(authorization);
  const current = await login(f);
  const newestMapping = await readAccount(f);
  f.identity.roles = [];
  const stale = await f.handle(
    new Request(callbackUrl, { headers: { Cookie: older.preLoginCookie } })
  );
  expect(stale.headers.get("location")).toBe(legacySsoFailedLocation);
  expect(await readAccount(f)).toEqual(newestMapping);
  expect((await readUser(f)).role).toBe("admin");
  expect((await readSession(f, current.bearer)).status).toBe(200);
});

test("older staged confirmation cannot undo a later successful mapped login", async () => {
  const f = await fixture({ lastMappedRole: "user" });
  const initiator = await fixture();
  const older = await stageSwitch(f, initiator, "/dashboard");
  f.identity.roles = ["admin (กปม.)"];
  const latest = await login(f);
  const mapping = await readAccount(f);
  expect((await older.decide("confirm")).status).toBe(409);
  expect(await readAccount(f)).toEqual(mapping);
  expect((await readUser(f)).role).toBe("admin");
  expect((await readSession(f, latest.bearer)).status).toBe(200);
});

test("confirmation rechecks effective role after preparing the session", async () => {
  const f = await fixture({ lastMappedRole: "user" });
  const initiator = await fixture();
  const staged = await stageSwitch(f, initiator, "/dashboard");
  const context = await auth.$context;
  const originalCreate = context.internalAdapter.createSession.bind(
    context.internalAdapter
  );
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const create = spyOn(
    context.internalAdapter,
    "createSession"
  ).mockImplementation(async (...args) => {
    const session = await originalCreate(...args);
    entered.resolve();
    await release.promise;
    return session;
  });
  const pending = staged.decide("confirm");
  try {
    await entered.promise;
    await prisma.user.update({
      data: { role: "admin" },
      where: { id: f.user.id },
    });
    release.resolve();
    const response = await pending;
    expect(response.status).toBe(409);
    expect((await readUser(f)).role).toBe("admin");
    expect((await readAccount(f)).lastSsoRoleGeneration).toBeNull();
    expect(
      await prisma.session.count({ where: { isSso: true, userId: f.user.id } })
    ).toBe(0);
  } finally {
    release.resolve();
    await pending.catch(() => {});
    create.mockRestore();
  }
});

test("reviewed local Admin linking requires approval and a fresh SSO before role initialization", async () => {
  const f = await fixture({ role: "admin", roles: ["เจ้าหน้าที่ กปม."] });
  await prisma.account.delete({ where: { id: f.account.id } });
  const reviewer = await fixture({ role: "admin" });
  const pending = await completeLegacySsoCallback(f.handle);
  expect(pending.headers.get("location")).toBe(legacySsoPendingLocation);
  const request = await prisma.legacyAccountLinkRequest.findUniqueOrThrow({
    where: {
      providerId_subject: { providerId: f.providerId, subject: f.identity.sub },
    },
  });
  const oldBrowser = await startLegacySsoBrowser(f.handle);
  const snapshot = await legacyAccountLinkSnapshot(
    f.handle,
    reviewer.localBearer,
    request.id
  );
  const approval = await submitLegacyAccountLinkReview(
    f.handle,
    reviewer.localBearer,
    snapshot,
    "approve"
  );
  expect(approval.status).toBe(200);
  expect(
    await prisma.account.count({ where: { providerId: f.providerId } })
  ).toBe(0);
  const authorization = await fetch(oldBrowser.authorizationUrl, {
    redirect: "manual",
  });
  const old = await f.handle(
    new Request(redirectLocation(authorization), {
      headers: { Cookie: oldBrowser.preLoginCookie },
    })
  );
  expect(old.headers.get("location")).toBe(legacySsoFailedLocation);
  const completed = await login(f);
  expect((await readSession(f, completed.bearer)).status).toBe(200);
  const mapping = await prisma.account.findUniqueOrThrow({
    where: {
      providerId_accountId: {
        accountId: f.identity.sub,
        providerId: f.providerId,
      },
    },
  });
  expect(mapping).toMatchObject({ lastMappedRole: "admin", userId: f.user.id });
  expect((await readUser(f)).role).toBe("admin");
});

test("last enabled Admin downgrade rejects login without changing mapping, sessions, or generation", async () => {
  const f = await fixture({ lastMappedRole: "admin", role: "admin" });
  const others = await prisma.user.findMany({
    select: { id: true },
    where: { enabled: true, id: { not: f.user.id }, role: "admin" },
  });
  await prisma.user.updateMany({
    data: { enabled: false },
    where: { id: { in: others.map(({ id }) => id) } },
  });
  try {
    const before = await readAccount(f);
    const callback = await completeLegacySsoCallback(f.handle);
    expect(callback.headers.get("location")).toBe(
      new URL("/login?legacySso=final_admin_required", legacySsoWebOrigin).href
    );
    expect(await readAccount(f)).toEqual(before);
    expect((await readUser(f)).role).toBe("admin");
    expect((await readSession(f, f.localBearer)).status).toBe(200);
    expect(
      await prisma.session.count({ where: { isSso: true, userId: f.user.id } })
    ).toBe(0);
    await fixture({ role: "admin" });
    const recovered = await login(f);
    expect((await readUser(f)).role).toBe("user");
    expect((await readAccount(f)).lastMappedRole).toBe("user");
    expect((await readSession(f, recovered.bearer)).status).toBe(200);
    expect((await readSession(f, f.localBearer)).status).toBe(401);
  } finally {
    await prisma.user.updateMany({
      data: { enabled: true },
      where: { id: { in: others.map(({ id }) => id) } },
    });
  }
});

test("failed transfer persistence rolls back role, baseline, watermark and revocations", async () => {
  const f = await fixture({ roles: ["admin (กปม.)"] });
  const before = await readAccount(f);
  const sessions = await prisma.session.count({ where: { userId: f.user.id } });
  const constraintName = `role_transfer_${crypto.randomUUID().replaceAll("-", "")}`;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "verification" ADD CONSTRAINT "${constraintName}" CHECK ("identifier" <> 'legacy-sso-session') NOT VALID`
  );
  try {
    await expect(completeLegacySsoCallback(f.handle)).rejects.toBeInstanceOf(
      Error
    );
    expect(await readAccount(f)).toEqual(before);
    expect((await readUser(f)).role).toBe("user");
    expect(await prisma.session.count({ where: { userId: f.user.id } })).toBe(
      sessions
    );
    expect((await readSession(f, f.localBearer)).status).toBe(200);
    expect(
      await prisma.auditEvent.count({
        where: { action: "sync_legacy_sso_role", targetId: f.user.id },
      })
    ).toBe(0);
  } finally {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "verification" DROP CONSTRAINT IF EXISTS "${constraintName}"`
    );
  }
});

test("SSO Admin temporary-password bypass permits account mutation and local session remains restricted", async () => {
  const f = await fixture({
    lastMappedRole: "admin",
    mustChangePassword: true,
    role: "admin",
    roles: ["admin (กปม.)"],
  });
  const { bearer } = await login(f);
  expect(await (await readSession(f, bearer)).json()).toMatchObject({
    session: { isSso: true },
    user: { mustChangePassword: false, role: "admin" },
  });
  const request = (token: string) =>
    f.handle(
      new Request("https://folio.example.test/api/admin/users", {
        body: JSON.stringify({
          email: `sso-created-${crypto.randomUUID()}@example.com`,
          name: "SSO-created User",
          role: "user",
        }),
        headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
        method: "POST",
      })
    );
  expect((await request(bearer)).status).toBe(200);
  expect((await request(f.localBearer)).status).toBe(403);
  expect((await readUser(f)).mustChangePassword).toBe(true);
});

test("prepared session creation failure cannot change a linked account role or baseline", async () => {
  const f = await fixture({ roles: ["admin (กปม.)"] });
  const before = await readAccount(f);
  const context = await auth.$context;
  const create = spyOn(
    context.internalAdapter,
    "createSession"
  ).mockRejectedValueOnce(new Error("Isolated prepared session failure"));
  try {
    await expect(completeLegacySsoCallback(f.handle)).rejects.toBeInstanceOf(
      Error
    );
    expect(await readAccount(f)).toEqual(before);
    expect((await readUser(f)).role).toBe("user");
    expect((await readSession(f, f.localBearer)).status).toBe(200);
    expect(
      await prisma.session.count({ where: { isSso: true, userId: f.user.id } })
    ).toBe(0);
  } finally {
    create.mockRestore();
  }
});

test("SSO Admin editor capabilities authorize editing and fail after a mapped demotion", async () => {
  const f = await fixture({ roles: ["เจ้าหน้าที่ กปม."] });
  await fixture({ role: "admin" });
  const { bearer } = await login(f);
  const created = await f.handle(
    formCreationRequest({
      authorization: bearer,
      source: "blank",
      title: "SSO Admin editable form",
    })
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { form: { publicId: string } };
  const editor = await f.handle(
    new Request(
      `https://folio.example.test/api/admin/forms/${body.form.publicId}/editor-config`,
      { headers: { Authorization: `Bearer ${bearer}` } }
    )
  );
  expect(editor.status).toBe(200);
  const config = (await editor.json()) as EditorConfigBody;
  const capability = config.bridge.capabilities["save-template"];
  if (!capability) {
    throw new Error(
      "SSO Admin editor did not receive a save-template capability"
    );
  }
  expect(verifyEditorCapability(capability)).toMatchObject({
    actorId: f.user.id,
    isSso: true,
    role: "admin",
  });
  const request = () =>
    new Request("https://folio.example.test/editor-action", {
      headers: { "X-Editor-Capability": capability },
    });
  expect((await editorAuthorization(request())).actor).toMatchObject({
    id: f.user.id,
    isSso: true,
    role: "admin",
  });
  f.identity.roles = [];
  await login(f);
  await expect(editorAuthorization(request())).rejects.toMatchObject({
    code: "invalid_editor_capability",
    httpStatus: 401,
  });
});

test("postcommit authoring cleanup failure preserves the completed role sync and usable transferred session", async () => {
  const f = await fixture({ roles: ["admin (กปม.)"] });
  const cleanup = spyOn(
    passwordSession,
    "endAiAuthoringSessions"
  ).mockRejectedValueOnce(new Error("Isolated cleanup failure"));
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const { bearer } = await login(f);
    expect((await readUser(f)).role).toBe("admin");
    expect((await readAccount(f)).lastMappedRole).toBe("admin");
    expect((await readSession(f, f.localBearer)).status).toBe(401);
    expect((await readSession(f, bearer)).status).toBe(200);
    expect(log).toHaveBeenCalledWith(
      "Could not finish authoring cleanup after SSO role change"
    );
  } finally {
    cleanup.mockRestore();
    log.mockRestore();
  }
});
