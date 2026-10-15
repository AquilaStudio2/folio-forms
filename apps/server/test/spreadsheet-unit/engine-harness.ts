// oxlint-disable no-await-in-loop -- Each failure scenario checks cleanup before reusing the isolated fake transport.
// Run only in the child process launched by engine.test.ts. Module mocks and
// global fetch cannot leak into the app's other test files.
import { mock } from "bun:test";
import assert from "node:assert/strict";

import { Elysia } from "elysia";

import { fixtureWorkbook } from "./fixture";

mock.module("@onlyoffice/env/server", () => ({
  env: {
    BETTER_AUTH_SECRET: "spreadsheet-engine-test-only-auth-secret-123456",
    EDITOR_CAPABILITY_SECRET: "spreadsheet-engine-test-only-secret-654321",
    ONLYOFFICE_DOCUMENT_BASE_URL: "http://application.test",
    ONLYOFFICE_INTERNAL_URL: "http://builder.test:8080",
    ONLYOFFICE_JWT_SECRET: "spreadsheet-engine-test-only-secret-123456",
    ONLYOFFICE_URL: "https://public-builder.test",
    PREFILL_HANDOFF_SECRET:
      "spreadsheet-engine-test-only-prefill-secret-123456",
  },
}));

const { processSpreadsheet, registerSpreadsheetBuilderRoutes } =
  await import("../../src/documents/spreadsheets/engine");
const app = new Elysia();
registerSpreadsheetBuilderRoutes(app);
app.compile();
const status = async (url: string | URL) => {
  const response = await app.handle(new Request(String(url)));
  return response.status;
};
const bytes = fixtureWorkbook();
let lastInput = "";
let downloads = 0;
let requests = 0;
let heartbeat = 0;
let scenario: "success" | "poll" | "hostile" | "error" | "invalid" = "success";

globalThis.fetch = (async (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
) => {
  const url = String(input);
  assert.equal(init?.redirect, "error");
  if (url === "http://builder.test:8080/docbuilder") {
    requests += 1;
    const payload = JSON.parse(String(init?.body)) as {
      url?: string;
      key?: string;
    };
    if (payload.url) {
      const scriptResponse = await app.handle(new Request(payload.url));
      assert.equal(scriptResponse.status, 200);
      assert.equal(scriptResponse.headers.get("cache-control"), "no-store");
      lastInput = payload.url.replace("script.js?", "input.xlsx?");
      const workbookResponse = await app.handle(new Request(lastInput));
      assert.equal(workbookResponse.status, 200);
      assert.deepEqual(
        new Uint8Array(await workbookResponse.arrayBuffer()),
        bytes
      );
      assert.equal(await status(lastInput.split("?")[0] ?? lastInput), 404);
      const wrong = new URL(lastInput);
      wrong.searchParams.set("token", "invalid");
      assert.equal(await status(wrong), 404);
      const script = await scriptResponse.text();
      assert.ok(script.includes("Api.RecalculateAllFormulas"));
      if (scenario === "poll") {
        return Response.json({ end: false, key: "test-job" });
      }
    } else {
      assert.equal(payload.key, "test-job");
    }
    if (scenario === "hostile") {
      return Response.json({
        end: true,
        urls: { "canonical.xlsx": "http://untrusted.test/private" },
      });
    }
    if (scenario === "error") {
      return Response.json({ error: -3 });
    }
    if (scenario === "invalid") {
      return Response.json({ end: false });
    }
    return Response.json({
      end: true,
      urls: {
        "canonical.pdf": "http://builder.test:8080/result.pdf",
        "canonical.xlsx": "https://public-builder.test/result.xlsx",
      },
    });
  }
  downloads += 1;
  if (url === "http://builder.test:8080/result.xlsx") {
    return new Response(new Uint8Array(bytes));
  }
  if (url === "http://builder.test:8080/result.pdf") {
    return new Response("%PDF-fixture");
  }
  throw new Error(`Unexpected network request: ${url}`);
}) as typeof fetch;

const result = await processSpreadsheet(bytes, { pdf: true });
assert.deepEqual(result.workbook, bytes);
assert.equal(new TextDecoder().decode(result.pdf), "%PDF-fixture");
assert.equal(downloads, 2);
assert.equal(await status(lastInput), 404);

scenario = "poll";
requests = 0;
await processSpreadsheet(bytes, {
  heartbeat: () => {
    heartbeat += 1;
    return Promise.resolve();
  },
});
assert.equal(requests, 2);
assert.equal(heartbeat, 1);
assert.equal(await status(lastInput), 404);

for (const mode of ["hostile", "error", "invalid"] as const) {
  scenario = mode;
  const prior: number = downloads;
  await assert.rejects(processSpreadsheet(bytes));
  assert.equal(downloads, prior);
  assert.equal(await status(lastInput), 404);
}
await assert.rejects(
  processSpreadsheet(new Uint8Array(25 * 1024 * 1024 + 1)),
  /too large/u
);
process.stdout.write("engine boundary passed\n");
