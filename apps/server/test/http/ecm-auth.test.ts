// oxlint-disable unicorn/no-await-expression-member -- Keep sequential HTTP assertions adjacent to their requests, matching the existing HTTP suites.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { Prisma, prisma } from "@onlyoffice/db";
import type { Elysia } from "elysia";

import { createApp } from "../../src/app";
import { requireIdentity } from "../../src/auth/identity";
import type { EcmConfiguration, EcmRuntime } from "../../src/ecm/client";
import { actionEditorCapability } from "../../src/editor/authorization";
import { claimEditorLease } from "../../src/editor/leases";
import { bearerFor, createCredentialFixture } from "../fixtures/http";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "ECM auth HTTP tests require isolated PostgreSQL DATABASE_URL"
  );
}
const id = crypto.randomUUID();
const formId = crypto.randomUUID();
const templateId = crypto.randomUUID();
const publicId = crypto.randomUUID().replaceAll("-", "");
const documentKey = `ecm-auth-${id}`;
const baseApp = createApp({ ecm: null, legacySso: null, omniRoute: null });
let bearer = "";
let capability = "";
let adminId = "";
const providers: {
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
}[] = [];
const accountKeys: string[] = [];

beforeAll(async () => {
  const password = "Isolated-ECM-auth-fixture-2026!";
  const admin = await createCredentialFixture({
    email: `ecm-auth-${id}@example.test`,
    name: "ECM Admin",
    password,
    role: "admin",
  });
  adminId = admin.id;
  bearer = await bearerFor(baseApp, admin.email, password);
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
          objectKey: `tests/${id}/unused.xlsx`,
        },
      },
      title: "Auth isolation",
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
});
afterAll(async () => {
  await Promise.all(providers.map((provider) => provider.stop(true)));
  await Promise.all(
    accountKeys.map((key) =>
      prisma.$executeRaw(
        Prisma.sql`DELETE FROM "ecm_auth_states" WHERE "account_key" = ${key}`
      )
    )
  );
  await prisma.editorLease.deleteMany({ where: { targetId: templateId } });
  await prisma.form.deleteMany({ where: { id: formId } });
  if (adminId) {
    await prisma.user.deleteMany({ where: { id: adminId } });
  }
});

const requestCategories = (app: Pick<Elysia, "handle">) =>
  app.handle(
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
const requestBindings = (app: Pick<Elysia, "handle">) =>
  app.handle(
    new Request(
      `http://test.local/api/admin/forms/${publicId}/spreadsheet-bindings`,
      {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Editor-Capability": capability,
        },
      }
    )
  );
const success = (
  token = "provider-token",
  now = Date.now(),
  lifetime = 3_600_000
) =>
  Response.json({
    data: { expire: new Date(now + lifetime).toISOString(), token },
  });
const categories = () => Response.json({ data: [{ id: 5, type: "หลักฐาน" }] });
const scenario = (
  handler: (request: Request) => Response | Promise<Response>,
  runtime: Partial<EcmRuntime> = {}
) => {
  const provider = Bun.serve({
    fetch: handler,
    hostname: "127.0.0.1",
    port: 0,
  });
  providers.push(provider);
  const configuration: EcmConfiguration = {
    apiUrl: provider.url.origin,
    encryptionKey: Buffer.alloc(32, 9).toString("base64"),
    password: "isolated-service-password",
    username: `folio-${crypto.randomUUID()}`,
  };
  const accountKey = createHash("sha256")
    .update(
      `${provider.url.origin}/api/beeecm/public\0${configuration.username}`
    )
    .digest("hex");
  accountKeys.push(accountKey);
  const app = () =>
    createApp({
      ecm: configuration,
      ecmRuntime: runtime,
      legacySso: null,
      omniRoute: null,
    });
  return { accountKey, app, configuration };
};

// Controlled clock and provider barriers exercise races without wall-clock sleeps.
test("independent Folio instances share one PostgreSQL login and persist encrypted Bearer only", async () => {
  const entered = Promise.withResolvers<undefined>();
  const joined = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let logins = 0;
  const fixture = scenario(
    async (request) => {
      if (new URL(request.url).pathname.endsWith("/login")) {
        logins += 1;
        entered.resolve();
        await release.promise;
        return success("encrypted-fixture-bearer");
      }
      expect(request.headers.get("Authorization")).toBe(
        "Bearer encrypted-fixture-bearer"
      );
      return categories();
    },
    {
      sleep: async () => {
        joined.resolve();
        await release.promise;
      },
    }
  );
  const first = requestCategories(fixture.app());
  await entered.promise;
  const second = requestCategories(fixture.app());
  await joined.promise;
  release.resolve();
  const responses = await Promise.all([first, second]);
  for (const response of responses) {
    expect(response.status).toBe(200);
  }
  const bodies = await Promise.all(
    responses.map((response) => response.json())
  );
  expect(bodies).toEqual([
    { categories: ["หลักฐาน"] },
    { categories: ["หลักฐาน"] },
  ]);
  expect(logins).toBe(1);
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
    Prisma.sql`SELECT * FROM "ecm_auth_states" WHERE "account_key" = ${fixture.accountKey}`
  );
  expect(rows).toHaveLength(1);
  expect(
    JSON.stringify(rows, (_key, value) =>
      typeof value === "bigint" ? String(value) : value
    )
  ).not.toContain("encrypted-fixture-bearer");
  expect(
    JSON.stringify(rows, (_key, value) =>
      typeof value === "bigint" ? String(value) : value
    )
  ).not.toContain("isolated-service-password");
});

test("cache persistence queued past the shared auth deadline cannot authorize a category request", async () => {
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let categoryRequests = 0;
  const fixture = scenario(async (request) => {
    if (new URL(request.url).pathname.endsWith("/login")) {
      entered.resolve();
      await release.promise;
      return success("late-persisted-bearer");
    }
    categoryRequests += 1;
    return categories();
  });
  const app = fixture.app();
  const response = requestCategories(app);
  await entered.promise;
  try {
    await prisma.$transaction(
      async (tx) => {
        const [owned] = await tx.$queryRaw<{ deadline: Date; pid: number }[]>(
          Prisma.sql`SELECT "deadline", pg_backend_pid() AS pid FROM "ecm_auth_states" WHERE "account_key" = ${fixture.accountKey} AND "status" = 'loading' AND "owner" IS NOT NULL FOR UPDATE`
        );
        if (!owned) {
          throw new Error("Expected this fixture's active auth job");
        }
        release.resolve();
        let queued = false;
        for (let attempt = 0; attempt < 200; attempt += 1) {
          // oxlint-disable-next-line no-await-in-loop -- Observe the actual cache UPDATE waiting on this fixture's row lock.
          const [waiting] = await prisma.$queryRaw<{ blocked: boolean }[]>(
            Prisma.sql`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND ${owned.pid} = ANY(pg_blocking_pids(pid))) AS blocked`
          );
          if (waiting?.blocked) {
            queued = true;
            break;
          }
          // oxlint-disable-next-line no-await-in-loop -- Poll a PostgreSQL lock barrier, not an assumed request duration.
          await Bun.sleep(10);
        }
        expect(queued).toBe(true);
        // Hold the exact row until its persisted real deadline, without shortening production's 30s job budget.
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_sleep_until(${owned.deadline}::timestamptz + interval '1 millisecond')`
        );
      },
      { timeout: 60_000 }
    );
  } finally {
    release.resolve();
    await response;
  }
  expect((await response).status).toBe(503);
  expect(categoryRequests).toBe(0);
  expect((await requestBindings(app)).status).toBe(200);
}, 120_000);

test("one shared auth job retries transient failures at 1s and 2s, never a fourth attempt", async () => {
  let now = Date.now();
  const start = now;
  const times: number[] = [];
  let permitSuccess = true;
  const fixture = scenario(
    (request) => {
      if (new URL(request.url).pathname.endsWith("/login")) {
        times.push(now - start);
        return times.length === 3 && permitSuccess
          ? success("third-attempt", now)
          : new Response(null, { status: 503 });
      }
      return categories();
    },
    {
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      },
    }
  );
  expect((await requestCategories(fixture.app())).status).toBe(200);
  expect(times).toEqual([0, 1000, 3000]);
  permitSuccess = false;
  now += 3_600_000;
  const failed = await requestCategories(fixture.app());
  expect(failed.status).toBe(503);
  expect(times).toHaveLength(6);
  expect((await requestBindings(fixture.app())).status).toBe(200);
});

for (const status of [400, 401, 403]) {
  test(`permanent ECM HTTP ${status} does not retry or invalidate Folio session`, async () => {
    let logins = 0;
    let categoryRequests = 0;
    const fixture = scenario((request) => {
      if (new URL(request.url).pathname.endsWith("/login")) {
        logins += 1;
        return Response.json(
          { password: "must-not-leak", token: "must-not-leak" },
          { status }
        );
      }
      categoryRequests += 1;
      return categories();
    });
    const response = await requestCategories(fixture.app());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("must-not-leak");
    expect(logins).toBe(1);
    expect(categoryRequests).toBe(0);
    expect((await requestBindings(fixture.app())).status).toBe(200);
  });
}

for (const expire of [
  "2026-12-01 12:00:00",
  "2027-02-30T12:00:00Z",
  "not-a-date",
]) {
  test(`unverified expiry ${expire} stops authentication without guessed lifetime`, async () => {
    let logins = 0;
    const fixture = scenario(() => {
      logins += 1;
      return Response.json({ data: { expire, token: "never-usable" } });
    });
    expect((await requestCategories(fixture.app())).status).toBe(503);
    expect(logins).toBe(1);
  });
}

test("shared auth deadline bounds later attempts and honors Retry-After instead of exceeding 30s", async () => {
  let now = Date.now();
  const budgets: number[] = [];
  let logins = 0;
  const fixture = scenario(
    () => {
      logins += 1;
      now += 15_000;
      return new Response(null, { status: 503 });
    },
    {
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      },
      timeoutSignal: (milliseconds) => {
        budgets.push(milliseconds);
        return new AbortController().signal;
      },
    }
  );
  expect((await requestCategories(fixture.app())).status).toBe(503);
  expect(logins).toBe(2);
  expect(budgets).toEqual([15_000, 14_000]);
  let retryLogins = 0;
  const retry = scenario(
    () => {
      retryLogins += 1;
      return new Response(null, {
        headers: { "Retry-After": "31" },
        status: 429,
      });
    },
    {
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      },
    }
  );
  expect((await requestCategories(retry.app())).status).toBe(503);
  expect(retryLogins).toBe(1);
});

test("valid Retry-After is respected inside the shared deadline", async () => {
  let now = Date.now();
  const start = now;
  const times: number[] = [];
  const fixture = scenario(
    (request) => {
      if (new URL(request.url).pathname.endsWith("/login")) {
        times.push(now - start);
        return times.length === 1
          ? new Response(null, { headers: { "Retry-After": "2" }, status: 429 })
          : success("retry-after", now);
      }
      return categories();
    },
    {
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      },
    }
  );
  expect((await requestCategories(fixture.app())).status).toBe(200);
  expect(times).toEqual([0, 2000]);
});

test("expiry must cover the request budget plus skew; unchanged safe token needs no new login", async () => {
  let now = Date.now();
  let logins = 0;
  const fixture = scenario(
    (request) => {
      if (new URL(request.url).pathname.endsWith("/login")) {
        logins += 1;
        return success(`short-${logins}`, now, 46_000);
      }
      return categories();
    },
    { now: () => now }
  );
  const app = fixture.app();
  expect((await requestCategories(app)).status).toBe(200);
  expect((await requestCategories(app)).status).toBe(200);
  expect(logins).toBe(1);
  now += 2000;
  expect((await requestCategories(app)).status).toBe(200);
  expect(logins).toBe(2);
});

test("late category 401 cannot clear a newer generation and never resends the rejected category request", async () => {
  let now = Date.now();
  let logins = 0;
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const receivedTokens: string[] = [];
  const fixture = scenario(
    async (request) => {
      if (new URL(request.url).pathname.endsWith("/login")) {
        logins += 1;
        return success(`generation-${logins}`, now);
      }
      const token = request.headers.get("Authorization") ?? "";
      receivedTokens.push(token);
      if (token === "Bearer generation-1") {
        entered.resolve();
        await release.promise;
        return new Response(null, { status: 401 });
      }
      return categories();
    },
    { now: () => now }
  );
  const oldRequest = requestCategories(fixture.app());
  await entered.promise;
  now += 3_600_000;
  expect((await requestCategories(fixture.app())).status).toBe(200);
  release.resolve();
  expect((await oldRequest).status).toBe(503);
  expect((await requestCategories(fixture.app())).status).toBe(200);
  expect(logins).toBe(2);
  expect(receivedTokens).toEqual([
    "Bearer generation-1",
    "Bearer generation-2",
    "Bearer generation-2",
  ]);
});

test("an abandoned expired job fails its waiter; a late owner cannot overwrite the next generation", async () => {
  let now = Date.now();
  let logins = 0;
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const fixture = scenario(
    async (request) => {
      if (new URL(request.url).pathname.endsWith("/login")) {
        logins += 1;
        const current = logins;
        if (current === 1) {
          entered.resolve();
          await release.promise;
        }
        return success(`owner-${current}`, now);
      }
      expect(request.headers.get("Authorization")).toBe("Bearer owner-2");
      return categories();
    },
    { now: () => now, timeoutSignal: () => new AbortController().signal }
  );
  const old = requestCategories(fixture.app());
  await entered.promise;
  now += 40_000;
  expect((await requestCategories(fixture.app())).status).toBe(503);
  expect((await requestCategories(fixture.app())).status).toBe(200);
  release.resolve();
  expect((await old).status).toBe(503);
  expect((await requestCategories(fixture.app())).status).toBe(200);
  expect(logins).toBe(2);
});

test("unset and unsafe ECM configuration leave ordinary Forms available without service fallback", async () => {
  for (const ecm of [
    null,
    {
      apiUrl: "https://user:password@example.test",
      encryptionKey: Buffer.alloc(32, 1).toString("base64"),
      password: "secret",
      username: "folio",
    },
    {
      apiUrl: "http://remote.example.test",
      encryptionKey: "not-a-key",
      password: "secret",
      username: "folio",
    },
  ]) {
    const app = createApp({ ecm, legacySso: null, omniRoute: null });
    // oxlint-disable-next-line no-await-in-loop -- Verify each unsafe configuration fails before checking its unaffected Form access.
    expect((await requestCategories(app)).status).toBe(503);
    // oxlint-disable-next-line no-await-in-loop -- This read proves the preceding integration error did not revoke the Folio session.
    expect((await requestBindings(app)).status).toBe(200);
  }
});

test("concurrent waiters share one failed three-attempt budget rather than starting individual jobs", async () => {
  let now = Date.now();
  let logins = 0;
  const entered = Promise.withResolvers<undefined>();
  const joined = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const exhausted = Promise.withResolvers<undefined>();
  const fixture = scenario(
    async () => {
      logins += 1;
      if (logins === 1) {
        entered.resolve();
        await release.promise;
      }
      if (logins === 3) {
        exhausted.resolve();
      }
      return new Response(null, { status: 503 });
    },
    {
      now: () => now,
      sleep: async (milliseconds) => {
        if (milliseconds >= 1000) {
          now += milliseconds;
        } else {
          joined.resolve();
          await exhausted.promise;
        }
      },
    }
  );
  const first = requestCategories(fixture.app());
  await entered.promise;
  const second = requestCategories(fixture.app());
  await joined.promise;
  release.resolve();
  expect((await first).status).toBe(503);
  expect((await second).status).toBe(503);
  expect(logins).toBe(3);
});

test("credential redirects are permanent and cannot forward secrets to another origin", async () => {
  let redirectedRequests = 0;
  const destination = Bun.serve({
    fetch: () => {
      redirectedRequests += 1;
      return success();
    },
    hostname: "127.0.0.1",
    port: 0,
  });
  providers.push(destination);
  let logins = 0;
  const fixture = scenario(() => {
    logins += 1;
    return new Response(null, {
      headers: { Location: destination.url.href },
      status: 307,
    });
  });
  expect((await requestCategories(fixture.app())).status).toBe(503);
  expect(logins).toBe(1);
  expect(redirectedRequests).toBe(0);
});

test("User and Viewer cannot obtain category authoring access or cause ECM login", async () => {
  let providerRequests = 0;
  const fixture = scenario(() => {
    providerRequests += 1;
    return success();
  });
  for (const role of ["user", "viewer"] as const) {
    const password = "Isolated-role-fixture-2026!";
    // oxlint-disable-next-line no-await-in-loop -- Keep each role fixture's creation and cleanup paired.
    const user = await createCredentialFixture({
      email: `ecm-${role}-${id}@example.test`,
      name: role,
      password,
      role,
    });
    try {
      // oxlint-disable-next-line no-await-in-loop -- Authenticate the current role before exercising its denied authoring routes.
      const token = await bearerFor(baseApp, user.email, password);
      for (const path of ["editor-config", "attachment-categories"]) {
        // oxlint-disable-next-line no-await-in-loop -- Observe each denied route before checking that no provider request occurred.
        const response = await fixture
          .app()
          .handle(
            new Request(
              `http://test.local/api/admin/forms/${publicId}/${path}`,
              { headers: { Authorization: `Bearer ${token}` } }
            )
          );
        expect([401, 403]).toContain(response.status);
      }
    } finally {
      // oxlint-disable-next-line no-await-in-loop -- Always settle the current role fixture before creating another.
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }
  expect(providerRequests).toBe(0);
});
