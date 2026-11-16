// oxlint-disable no-await-in-loop unicorn/no-await-expression-member -- HTTP journeys keep requests and their observable results together.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { prisma, Prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { EcmClient } from "../../src/ecm/client";
import { bearerFor, createCredentialFixture } from "../fixtures/http";

interface Mapping {
  id: string;
  template_name: string;
  document_category_id: number;
}
const mappingBody = async (response: Response) =>
  (await response.json()) as { template: Mapping };
const listBody = async (response: Response) =>
  (await response.json()) as { templates: Mapping[] };
const run = crypto.randomUUID();
const users: string[] = [];
const tokens: Record<string, string> = {};
let providerReads = 0;
let fileWrites = 0;
let outage = false;
const provider = Bun.serve({
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/login")) {
      return Response.json({
        data: {
          expire: new Date(Date.now() + 86_400_000 * 15).toISOString(),
          token: "catalog-test-secret",
        },
      });
    }
    if (path.endsWith("/document/category")) {
      providerReads += 1;
      return outage
        ? new Response("unavailable", { status: 503 })
        : Response.json([
            { id: 11, type: "หัวข้อเดียวกัน" },
            { id: 12, type: "หัวข้อเดียวกัน" },
          ]);
    }
    fileWrites += 1;
    return new Response("unexpected", { status: 500 });
  },
  hostname: "127.0.0.1",
  port: 0,
});
const app = createApp({
  ecm: {
    apiUrl: provider.url.origin,
    encryptionKey: Buffer.alloc(32, 7).toString("base64"),
    password: "test-only",
    username: run,
  },
  legacySso: null,
  omniRoute: null,
});
const request = (method: string, path = "", body?: unknown, role = "admin") =>
  app.handle(
    new Request(`http://test.local/api/admin/storage-templates${path}`, {
      headers: {
        ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}),
        "Content-Type": "application/json",
      },
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
beforeAll(async () => {
  for (const role of ["admin", "viewer", "user"] as const) {
    const user = await createCredentialFixture({
      email: `${run}-${role}@example.test`,
      name: role,
      password: "Catalog-fixture-password-2026!",
      role,
    });
    users.push(user.id);
    tokens[role] = await bearerFor(
      app,
      user.email,
      "Catalog-fixture-password-2026!"
    );
  }
});
afterAll(async () => {
  await prisma.storageTemplate.deleteMany({
    where: { template_name: { contains: run } },
  });
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM ecm_auth_states WHERE account_key = ${new EcmClient({ apiUrl: provider.url.origin, encryptionKey: Buffer.alloc(32, 7).toString("base64"), password: "test-only", username: run }).accountKey()}`
  );
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await provider.stop(true);
});

test("Admin persists, filters, renames, moves and deletes local catalog without provider file writes", async () => {
  const categories = await request("GET", "/categories");
  expect(await categories.json()).toEqual({
    categories: [
      { id: 11, type: "หัวข้อเดียวกัน" },
      { id: 12, type: "หัวข้อเดียวกัน" },
    ],
  });
  const created = await request("POST", "", {
    document_category_id: 11,
    template_name: `${run}-ต้นฉบับ`,
  });
  expect(created.status).toBe(200);
  const { template } = await mappingBody(created);
  expect(
    (await listBody(await request("GET", "?document_category_id=11"))).templates
  ).toContainEqual(template);
  const moved = await request("PATCH", `/${template.id}`, {
    document_category_id: 12,
    template_name: `${run}-แก้ไข`,
  });
  expect(moved.status).toBe(200);
  expect(
    (
      await listBody(await request("GET", "?document_category_id=11"))
    ).templates.some((row) => row.id === template.id)
  ).toBe(false);
  expect(
    (await listBody(await request("GET", "?document_category_id=12"))).templates
  ).toContainEqual({
    ...template,
    document_category_id: 12,
    template_name: `${run}-แก้ไข`,
  });
  outage = true;
  expect((await request("GET", "/categories")).status).toBe(503);
  expect(
    (
      await request("PATCH", `/${template.id}`, {
        document_category_id: 12,
        template_name: `${run}-offline`,
      })
    ).status
  ).toBe(200);
  expect(
    (
      await request("PATCH", `/${template.id}`, {
        document_category_id: 11,
        template_name: `${run}-offline`,
      })
    ).status
  ).toBe(503);
  expect(
    (await request("DELETE", `/${template.id}`, { confirm: false })).status
  ).toBe(400);
  expect(
    (await request("DELETE", `/${template.id}`, { confirm: true })).status
  ).toBe(200);
  expect(
    (await listBody(await request("GET"))).templates.some(
      (row) => row.id === template.id
    )
  ).toBe(false);
  outage = false;
  expect(fileWrites).toBe(0);
});

test("catalog rejects forged categories, unsafe names and global duplicate races", async () => {
  for (const name of [
    "",
    "   ",
    "bad/name",
    "bad\\name",
    "bad\nname",
    "bad:name",
    "bad?name",
  ]) {
    expect(
      (
        await request("POST", "", {
          document_category_id: 11,
          template_name: name,
        })
      ).status
    ).toBe(400);
  }
  for (const category of [999, "11", 1.2, null]) {
    expect(
      (
        await request("POST", "", {
          document_category_id: category,
          template_name: `${run}-invalid`,
        })
      ).status
    ).toBe(400);
  }
  const responses = await Promise.all(
    [11, 12].map((document_category_id) =>
      request("POST", "", {
        document_category_id,
        template_name: `${run}-race`,
      })
    )
  );
  expect(responses.map((response) => response.status).toSorted()).toEqual([
    200, 409,
  ]);
  const another = await mappingBody(
    await request("POST", "", {
      document_category_id: 12,
      template_name: `${run}-other`,
    })
  );
  expect(
    (
      await request("PATCH", `/${another.template.id}`, {
        document_category_id: 12,
        template_name: `${run}-race`,
      })
    ).status
  ).toBe(409);
  const preserved = ` ${run}-spaces `;
  expect(
    (
      await mappingBody(
        await request("POST", "", {
          document_category_id: 11,
          template_name: preserved,
        })
      )
    ).template.template_name
  ).toBe(preserved);
  expect(fileWrites).toBe(0);
});

test("management denies unauthenticated, User, Viewer and disabled Admin before provider access", async () => {
  const reads = providerReads;
  await prisma.user.update({
    data: { enabled: false },
    where: { id: users[0] },
  });
  try {
    for (const role of ["missing", "user", "viewer", "admin"]) {
      for (const [method, path, body] of [
        ["GET", "", undefined],
        ["GET", "/categories", undefined],
        ["POST", "", {}],
        ["PATCH", `/${crypto.randomUUID()}`, {}],
        ["DELETE", `/${crypto.randomUUID()}`, { confirm: true }],
      ] as const) {
        expect([401, 403]).toContain(
          (await request(method, path, body, role)).status
        );
      }
    }
  } finally {
    await prisma.user.update({
      data: { enabled: true },
      where: { id: users[0] },
    });
  }
  expect(providerReads).toBe(reads);
  expect(fileWrites).toBe(0);
});
