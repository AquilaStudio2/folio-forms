// oxlint-disable prefer-await-to-callbacks unicorn/no-await-expression-member no-empty-function -- Exercise transaction callbacks and HTTP responses with no-op infrastructure in an isolated subprocess.
// No database or object storage is connected.
import { mock } from "bun:test";
import assert from "node:assert/strict";

import { Elysia } from "elysia";

import type { Operation } from "../../src/model-types";

const operation = {
  documentKey: "draft-key",
  id: crypto.randomUUID(),
  status: "processing",
  type: "submit_response",
};
let callbackError: Error | undefined;
let consumed = false;
let canonicalReads = 0;
let finalized: unknown[] = [];
const finished = Promise.withResolvers<undefined>();
const failureDetails: unknown[][] = [];
class ValidationError extends Error {
  override name = "ValidationError";
  errors = [{ address: "U2", message: "Required field: name (U2)" }];
}
mock.module("@onlyoffice/db", () => ({
  OperationStatus: {
    completed: "completed",
    failed: "failed",
    pending: "pending",
    processing: "processing",
  },
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        callbackClaim: { create: () => Promise.resolve({}) },
        operation: { updateMany: () => Promise.resolve({ count: 1 }) },
      }),
    operation: { findUnique: () => Promise.resolve(operation) },
  },
}));
mock.module("../../src/http/input", () => ({
  readJsonRecord: (request: Request) => request.json(),
}));
mock.module("../../src/documents/spreadsheets/engine", () => ({
  registerSpreadsheetBuilderRoutes: () => {},
}));
mock.module("../../src/documents/spreadsheets/workbook", () => ({
  XLSX_CONTENT_TYPE: "application/octet-stream",
}));
mock.module("../../src/operations/spreadsheet-document", () => ({
  SpreadsheetValidationError: ValidationError,
}));
mock.module("../../src/responses/native-document", () => ({
  nativePdfDocument: () => Promise.resolve(new Uint8Array()),
}));
mock.module("../../src/operations/object-cleanup", () => ({
  cleanupTerminalOperationObjects: () => Promise.resolve(),
}));
mock.module("../../src/storage", () => ({
  DOCX_CONTENT_TYPE: "application/octet-stream",
  objectExists: () => Promise.resolve(true),
  readObject: () => {
    canonicalReads += 1;
    return Promise.resolve(new Uint8Array([1]));
  },
  streamObject: () => new Uint8Array(),
}));
mock.module("../../src/operations/lifecycle", () => ({
  callbackClaimLifetimeSeconds: 300,
  consumeCallbackClaim: () => {
    consumed = true;
    return Promise.resolve("claimed");
  },
  operationDocumentKey: () => Promise.resolve("old-canonical.xlsx"),
  updateOperationFailed: (...args: unknown[]) => {
    failureDetails.push(args);
    return Promise.resolve(true);
  },
}));
mock.module("../../src/operations/callback", () => ({
  finalizeCallback: (...args: unknown[]) => {
    if (callbackError) {
      return Promise.reject(callbackError);
    }
    finalized = args;
    finished.resolve();
    return Promise.resolve();
  },
  maxCallbackBodyBytes: 65_536,
}));
const {
  createOnlyOfficeClient,
  createOnlyOfficeAuthorization,
  createCallbackUserdata,
} = await import("../../src/onlyoffice");
const { registerOnlyOfficeRoutes } =
  await import("../../src/routes/onlyoffice");
const { launchForceSave } = await import("../../src/operations/force-save");
const app = new Elysia();
registerOnlyOfficeRoutes(app, {
  allowedCallbackOrigins: new Set(),
  callbackMaximumBytes: 1024,
});
const postCallback = () => {
  const payload = {
    key: operation.documentKey,
    status: 6,
    userdata: createCallbackUserdata({
      documentKey: operation.documentKey,
      operationId: operation.id,
      operationType: "submit_response",
    }),
  };
  return app.handle(
    new Request("http://localhost/onlyoffice/callback", {
      body: JSON.stringify(payload),
      headers: { Authorization: createOnlyOfficeAuthorization(payload) },
      method: "POST",
    })
  );
};
const validationError = new ValidationError();
callbackError = validationError;
assert.deepEqual(await (await postCallback()).json(), { error: 0 });
assert.ok(consumed);
assert.equal(failureDetails[0]?.[1], "callback_processing_failed");
assert.deepEqual(failureDetails[0]?.[3], {
  errorMessage: "ตรวจสอบช่องกรอกที่ระบุก่อนส่งคำตอบ",
  validationErrors: validationError.errors,
});
callbackError = new Error("storage unavailable");
assert.deepEqual(await (await postCallback()).json(), { error: 1 });
callbackError = undefined;

const cachedUrl = "http://onlyoffice/cache/latest.xlsx";
const client = (body: unknown) =>
  createOnlyOfficeClient({
    fetch: Object.assign(() => Promise.resolve(Response.json(body)), {
      preconnect: () => {},
    }),
    internalUrl: "http://onlyoffice",
  });
assert.equal(await client({ error: 0 }).forceSave("key", "userdata"), true);
assert.equal(await client({ error: 4 }).forceSave("key", "userdata"), false);
assert.deepEqual(
  await client({ error: 4, url: cachedUrl }).forceSave("key", "userdata"),
  { url: cachedUrl }
);
await assert.rejects(
  client({ error: 4, url: "https://attacker.example/file.xlsx" }).forceSave(
    "key",
    "userdata"
  ),
  /disallowed/u
);
await assert.rejects(
  client({ error: 6 }).forceSave("key", "userdata"),
  /failed/u
);

const allowed = new Set(["http://onlyoffice"]);
launchForceSave(
  operation as Operation,
  client({ error: 4, url: cachedUrl }),
  allowed
);
await finished.promise;
assert.equal(canonicalReads, 0);
assert.deepEqual(finalized, [
  operation.id,
  { key: operation.documentKey, status: 6, url: cachedUrl },
  undefined,
  allowed,
]);
console.log("force-save recovery passed");
