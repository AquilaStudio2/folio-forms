import { expect, test } from "bun:test";

import { createApp } from "../../src/app";
import { bearerFor, createCredentialFixture } from "../fixtures/http";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Admin date filter tests require an isolated PostgreSQL DATABASE_URL"
  );
}

const app = createApp({ legacySso: null });
const endpoints = ["/api/admin/results", "/api/admin/audit-events"];
const impossible = [
  "2026-02-30",
  "2026-13-01",
  "2026-04-31",
  "2025-02-29",
  "2026-02-30T23:59:59.999Z",
  "2026-01-01T24:00:00Z",
  "2026-01-01T12:60:00Z",
  "2026-01-01T12:00:60Z",
  "yesterday",
  "2026-1-1",
  "2026-01-01T10:00:00+02:00",
];
const valid = ["2024-02-29", "2026-02-28T23:59:59.999Z", "2026-02-28T23:59:59Z"];

test("admin results and audit date filters reject non-existent dates", async () => {
  const password = "Correct-horse-battery-1";
  const admin = await createCredentialFixture({
    email: `dates-${crypto.randomUUID()}@example.test`,
    name: "Dates Admin",
    password,
    role: "admin",
  });
  const bearer = await bearerFor(app, admin.email, password);
  const get = (path: string) =>
    app.handle(
      new Request(`http://test.local${path}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
  for (const endpoint of endpoints) {
    for (const key of ["from", "to"]) {
      for (const value of impossible) {
        const response = await get(
          `${endpoint}?${key}=${encodeURIComponent(value)}`
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: "invalid_request",
          message: `${key} is invalid`,
        });
      }
      for (const value of valid) {
        const response = await get(
          `${endpoint}?${key}=${encodeURIComponent(value)}`
        );
        expect(response.status).toBe(200);
      }
    }
  }
});
