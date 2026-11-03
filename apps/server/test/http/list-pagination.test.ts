import { expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { z } from "zod";

import { createApp } from "../../src/app";
import { bearerFor, createCredentialFixture } from "../fixtures/http";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Pagination HTTP tests require an isolated PostgreSQL database"
  );
}

const app = createApp({ legacySso: null });
const pageSchema = z.object({
  events: z.array(z.object({ id: z.string() })).optional(),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
  users: z.array(z.object({ id: z.string() })).optional(),
});

// oxlint-disable no-await-in-loop -- Exercise numbered navigation and validation sequentially through the HTTP boundary.
test("accounts and audit events expose exact totals, direct page navigation, stable ties and clamped empty pages", async () => {
  const password = crypto.randomUUID();
  const reviewer = await createCredentialFixture({
    email: `reviewer-${crypto.randomUUID()}@example.test`,
    name: "Pagination reviewer",
    password,
    role: "admin",
  });
  const bearer = await bearerFor(app, reviewer.email, password);
  const prefix = `page-${crypto.randomUUID()}`;
  const userIds = Array.from({ length: 41 }, () =>
    crypto.randomUUID()
  ).toSorted();
  const eventIds = Array.from({ length: 101 }, () => crypto.randomUUID())
    .toSorted()
    .toReversed();
  const targetId = crypto.randomUUID();
  await prisma.user.createMany({
    data: userIds.map((id, index) => ({
      email: `${prefix}-${index}@example.test`,
      id,
      name: `Pagination user ${index}`,
    })),
  });
  await prisma.auditEvent.createMany({
    data: eventIds.map((id) => ({
      action: "view_response",
      actorId: reviewer.id,
      createdAt: new Date("2026-11-03T00:00:00.000Z"),
      id,
      outcome: "success",
      safeMetadata: {},
      targetId,
      targetType: "response",
    })),
  });
  const get = (route: string) =>
    app.handle(
      new Request(`http://test.local${route}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
  try {
    const cases = [
      {
        ids: userIds,
        key: "users",
        pageSize: 20,
        route: `/api/admin/users?email=${prefix}`,
      },
      {
        ids: eventIds,
        key: "events",
        pageSize: 50,
        route: `/api/admin/audit-events?target=${targetId}`,
      },
    ] satisfies {
      route: string;
      key: "users" | "events";
      pageSize: number;
      ids: string[];
    }[];
    for (const entry of cases) {
      for (const page of [2, 1, 3, 999]) {
        const response = await get(`${entry.route}&page=${page}`);
        expect(response.status).toBe(200);
        const body = pageSchema.parse(await response.json());
        const clampedPage = Math.min(page, 3);
        expect(body.pagination).toEqual({
          page: clampedPage,
          pageSize: entry.pageSize,
          total: entry.ids.length,
          totalPages: 3,
        });
        expect(body[entry.key]?.map(({ id }) => id)).toEqual(
          entry.ids.slice(
            (clampedPage - 1) * entry.pageSize,
            clampedPage * entry.pageSize
          )
        );
      }
    }
    for (const route of [
      `/api/admin/users?email=missing-${prefix}`,
      `/api/admin/audit-events?target=missing-${targetId}`,
    ]) {
      const response = await get(`${route}&page=999`);
      expect(response.status).toBe(200);
      const body = pageSchema.parse(await response.json());
      expect(body.pagination).toMatchObject({
        page: 1,
        total: 0,
        totalPages: 1,
      });
      expect(body.users ?? body.events).toEqual([]);
    }
    for (const endpoint of [
      "/api/admin/forms",
      "/api/admin/results",
      "/api/admin/audit-events",
      "/api/admin/users",
      "/api/admin/account-links",
    ]) {
      for (const query of [
        "page=0",
        "page=-1",
        "page=1.5",
        "page=abc",
        "page=2147483648",
        "page=1&page=2",
        "cursor=old",
      ]) {
        const invalidResponse = await get(`${endpoint}?${query}`);
        expect(invalidResponse.status).toBe(400);
      }
      const guestResponse = await app.handle(
        new Request(`http://test.local${endpoint}`)
      );
      expect(guestResponse.status).toBe(401);
    }
  } finally {
    // Audit records remain immutable until the isolated test database is discarded.
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
