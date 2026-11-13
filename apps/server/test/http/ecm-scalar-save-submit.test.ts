// oxlint-disable no-await-in-loop complexity -- Exercise real isolated HTTP, PostgreSQL, storage and native Builder; poll public Operations across process boundaries.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { unzipSync, strFromU8 } from "fflate";
import { z } from "zod";

import { createApp } from "../../src/app";
import type { EditorCapabilityIdentity } from "../../src/auth/identity";
import { requireIdentity } from "../../src/auth/identity";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { processSpreadsheet } from "../../src/documents/spreadsheets/engine";
import { protectSpreadsheet } from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import { actionEditorCapability } from "../../src/editor/authorization";
import type { EditorLeaseGrant } from "../../src/editor/leases";
import { claimEditorLease } from "../../src/editor/leases";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { attachmentSchema } from "../../src/responses/attachment-data";
import { putObject, readObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook, mutatePart } from "../spreadsheet-unit/fixture";

const fixtureValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("The isolated fixture did not supply its required value");
  }
  return value;
};

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Scalar HTTP tests require isolated PostgreSQL and object storage"
  );
}
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_year",
      id: "folio_year",
      key: "fiscal_year",
      label: "ปี",
      type: "text",
    },
    {
      anchor: "folio_number",
      id: "folio_number",
      key: "docs_number",
      label: "เลขหนังสือ",
      type: "text",
    },
    {
      anchor: "folio_proof",
      attachment: { category: "หลักฐาน" },
      id: "folio_proof",
      key: "proof",
      label: "หลักฐาน",
      required: true,
      type: "text",
    },
    {
      anchor: "folio_other",
      attachment: { category: "อื่น" },
      id: "folio_other",
      key: "other",
      label: "เอกสารอื่น",
      type: "text",
    },
    {
      anchor: "folio_notes1",
      id: "folio_notes1",
      key: "notes1",
      label: "หมายเหตุ1",
      type: "text",
    },
    {
      anchor: "folio_notes2",
      id: "folio_notes2",
      key: "notes2",
      label: "หมายเหตุ2",
      type: "text",
    },
    {
      anchor: "folio_notes3",
      id: "folio_notes3",
      key: "notes3",
      label: "หมายเหตุ3",
      type: "text",
    },
  ],
  table: null,
  version: 1,
});
const snapshots = new Map<string, Uint8Array>();
const received: {
  name: string;
  bytes: Uint8Array;
  year: unknown;
  number: unknown;
  category: unknown;
  template: unknown;
  token: string;
}[] = [];
const deleted: string[] = [];
const providerFiles = new Map<string, { bytes: Uint8Array; token: string }>();
let deleteFails = false;
let logins = 0;
let nextMode: "ok" | "malformed" | "body-failure" | "store-then-reject" = "ok";
let customLink: string | null = null;
let customToken: string | null = null;
let receiveBarrier: { enter: () => void; release: Promise<void> } | null = null;
let captureBarrier: { enter: () => void; release: Promise<void> } | null = null;
const provider = Bun.serve({
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/login")) {
      logins += 1;
      return Response.json({
        data: {
          expire: new Date(Date.now() + 3_600_000).toISOString(),
          token: "scalar-test-service-token",
        },
        msg: "ok",
        status: 200,
      });
    }
    if (request.method === "GET" && url.pathname.startsWith("/files/")) {
      const saved = providerFiles.get(url.pathname);
      return saved
        ? new Response(new Uint8Array(saved.bytes))
        : new Response(null, { status: 404 });
    }
    expect(request.headers.get("Authorization")).toBe(
      "Bearer scalar-test-service-token"
    );
    if (url.pathname.endsWith("/file") && request.method === "DELETE") {
      const token = fixtureValue(url.searchParams.get("token"));
      deleted.push(token);
      if (deleteFails) {
        return Response.json(
          { data: null, msg: "fixture cleanup unavailable", status: 500 },
          { status: 500 }
        );
      }
      for (const [path, saved] of providerFiles) {
        if (saved.token === token) {
          providerFiles.delete(path);
        }
      }
      return Response.json({ data: null, msg: "ok", status: 200 });
    }
    if (url.pathname.endsWith("/file") && request.method === "POST") {
      const body = await request.formData();
      const file = body.get("documentFile");
      if (!(file instanceof File)) {
        return new Response(null, { status: 400 });
      }
      const token =
        customToken ?? crypto.randomUUID().replaceAll("-", "").repeat(2);
      received.push({
        bytes: new Uint8Array(await file.arrayBuffer()),
        category: body.get("documentCategory"),
        name: file.name,
        number: body.get("documentNumber"),
        template: body.get("template"),
        token,
        year: body.get("documentYear"),
      });
      const intent = await prisma.ecmAttachmentVersion.findFirstOrThrow({
        where: { filename: file.name },
      });
      expect(intent).toMatchObject({
        category: body.get("documentCategory"),
        documentNumber: body.get("documentNumber"),
        fiscalYear: body.get("documentYear"),
        sizeBytes: fixtureValue(received.at(-1)).bytes.byteLength,
        state: "started",
      });
      expect(intent.sentAt).not.toBeNull();
      expect(
        await prisma.ecmAttachmentBatch.findUnique({
          where: { operationId: intent.operationId },
        })
      ).toMatchObject({ responseId: intent.responseId, state: "sending" });
      const barrier = receiveBarrier;
      if (barrier) {
        receiveBarrier = null;
        barrier.enter();
        await barrier.release;
      }
      const link =
        customLink ?? `${provider.url.origin}/files/${crypto.randomUUID()}`;
      providerFiles.set(new URL(link).pathname, {
        bytes: fixtureValue(received.at(-1)).bytes,
        token,
      });
      if (nextMode === "store-then-reject") {
        return Response.json(
          {
            data: null,
            msg: "fixture wrote bytes before failing",
            status: 422,
          },
          { status: 422 }
        );
      }
      if (nextMode === "malformed") {
        return Response.json({
          data: [],
          msg: "fixture incomplete receipt",
          status: 200,
        });
      }
      if (nextMode === "body-failure") {
        return Response.json({
          data: [
            {
              file_link: `${provider.url.origin}/files/unknown`,
              file_token: token,
            },
          ],
          msg: "fixture body failure",
          status: 500,
        });
      }
      return Response.json({
        data: [{ file_link: link, file_token: token }],
        msg: "ok",
        status: 200,
      });
    }
    return new Response(null, { status: 404 });
  },
  hostname: "127.0.0.1",
  port: 0,
});
const previousEnvironment = Object.fromEntries(
  [
    "ECM_API_URL",
    "ECM_USERNAME",
    "ECM_PASSWORD",
    "ECM_TOKEN_ENCRYPTION_KEY",
  ].map((key) => [key, process.env[key]])
);
process.env.ECM_API_URL = provider.url.origin;
process.env.ECM_USERNAME = `scalar-${crypto.randomUUID()}`;
process.env.ECM_PASSWORD = "scalar-test-only-password";
process.env.ECM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
    downloadEditorWorkbook: async ({ documentKey }) => {
      const barrier = captureBarrier;
      if (barrier) {
        barrier.enter();
        await barrier.release;
      }
      const snapshot = snapshots.get(documentKey);
      if (!snapshot) {
        throw new Error("No native snapshot for this document");
      }
      return snapshot;
    },
    forceSave: () => Promise.resolve(true),
  },
  pdmsProjects: null,
});
let nativeTemplate: Uint8Array;
beforeAll(async () => {
  const jobBase = new URL(
    process.env.ONLYOFFICE_DOCUMENT_BASE_URL ?? "http://localhost:3000"
  );
  if (
    !jobBase.port ||
    jobBase.port === "3000" ||
    ![
      "localhost",
      "127.0.0.1",
      "host.lima.internal",
      "host.docker.internal",
    ].includes(jobBase.hostname)
  ) {
    throw new Error("Scalar native Builder requires isolated callback port");
  }
  app.listen({ hostname: "0.0.0.0", port: Number(jobBase.port) });
  const raw = fixtureWorkbook({
    cells: [
      { address: "B1", value: "2570" },
      { address: "B2", value: "DOC.42" },
    ],
    merges: [],
    names: {
      _folio_upload_poc_folio_other: "'Form'!$B$4",
      _folio_upload_poc_folio_proof: "'Form'!$B$3",
      folio_notes1: "'Form'!$B$5",
      folio_notes2: "'Form'!$B$6",
      folio_notes3: "'Form'!$B$7",
      folio_number: "'Form'!$B$2",
      folio_other: "'Form'!$B$4",
      folio_proof: "'Form'!$B$3",
      folio_year: "'Form'!$B$1",
    },
  });
  const builtResult = await processSpreadsheet(raw, { bindings });
  const { workbook: built } = builtResult;
  nativeTemplate = protectSpreadsheet(
    built,
    resolveSpreadsheetContract(bindings, readSpreadsheetWorkbook(built))
  );
});
afterAll(async () => {
  await app.stop();
  await provider.stop(true);
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
});
const replaceCell = (bytes: Uint8Array, address: string, value: string) =>
  mutatePart(bytes, "xl/worksheets/sheet1.xml", (xml) => {
    const cell = `<c r="${address}" t="inlineStr"><is><t>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</t></is></c>`;
    const existing = new RegExp(
      `<c\\b(?=[^>]*\\br="${address}")[^>]*(?:/>|>[\\s\\S]*?</c>)`,
      "u"
    );
    if (existing.test(xml)) {
      return xml.replace(existing, cell);
    }
    const row = address.replace(/^[A-Z]+/u, "");
    const existingRow = new RegExp(
      `(<row\\b(?=[^>]*\\br="${row}")[^>]*>)([\\s\\S]*?)(</row>)`,
      "u"
    );
    if (existingRow.test(xml)) {
      return xml.replace(existingRow, `$1$2${cell}$3`);
    }
    return xml.replace(
      "</sheetData>",
      `<row r="${row}">${cell}</row></sheetData>`
    );
  });
interface Fixture {
  bearer: string;
  form: { id: string; publicId: string };
  response: { id: string };
  identity: EditorCapabilityIdentity;
  lease: EditorLeaseGrant;
  documentKey: string;
}
const envelopeSchema = z.object({
  operationCapability: z.string(),
  operationId: z.string(),
});
const pollSchema = z.object({
  operation: z.object({
    result: z.record(z.string(), z.unknown()).nullish(),
    status: z.string(),
  }),
});
const fixture = async (
  values: { year?: string; number?: string } = {}
): Promise<Fixture> => {
  nextMode = "ok";
  customLink = null;
  customToken = null;
  deleteFails = false;
  const id = crypto.randomUUID();
  const password = "Scalar-isolated-fixture-password!";
  const user = await createCredentialFixture({
    email: `scalar-${id}@example.test`,
    name: "Scalar User",
    password,
  });
  const bearer = await bearerFor(app, user.email, password);
  const documentKey = `scalar-${id}`;
  const objectKey = `tests/scalar/${id}/draft.xlsx`;
  await putObject(objectKey, nativeTemplate);
  let snapshot = nativeTemplate;
  if (values.year !== undefined) {
    snapshot = replaceCell(snapshot, "B1", values.year);
  }
  if (values.number !== undefined) {
    snapshot = replaceCell(snapshot, "B2", values.number);
  }
  snapshots.set(documentKey, snapshot);
  const form = await prisma.form.create({
    data: {
      documentKind: "xlsx",
      publicId: id.replaceAll("-", ""),
      publishedTemplate: {
        create: {
          contentHash: "scalar-fixture",
          documentKey: `template-${id}`,
          manifest: {
            create: {
              configurationHash: "scalar-fixture",
              fields: {
                create: spreadsheetManifestFieldData(bindings),
              },
            },
          },
          objectKey,
          version: 1,
        },
      },
      status: "published",
      title: "Scalar receipt fixture",
      version: 1,
    },
    include: { publishedTemplate: true },
  });
  if (!form.publishedTemplate) {
    throw new Error("Missing fixture template");
  }
  const response = await prisma.response.create({
    data: {
      draftDocumentKey: documentKey,
      draftObjectKey: objectKey,
      formId: form.id,
      publishedTemplateId: form.publishedTemplate.id,
      publishedVersion: 1,
      spreadsheetInitialized: true,
      userId: user.id,
    },
  });
  const identity = await requireIdentity(
    new Request("http://test.local", {
      headers: { Authorization: `Bearer ${bearer}` },
    })
  );
  const lease = await claimEditorLease(
    identity,
    "response",
    response.id,
    form.id
  );
  return { bearer, documentKey, form, identity, lease, response };
};
const send = (
  f: Fixture,
  files: Record<string, File>,
  action: "draft" | "submit" = "draft",
  checkpoint = crypto.randomUUID(),
  extra: Record<string, unknown> = {}
) => {
  const body = new FormData();
  body.set(
    "payload",
    JSON.stringify({
      checkpoint,
      documentKey: f.documentKey,
      fillMethod: "onlyoffice",
      responseId: f.response.id,
      snapshotUrl: "http://office.test/cache/snapshot.xlsx",
      ...extra,
    })
  );
  for (const [binding, file] of Object.entries(files)) {
    body.set(`attachment:${binding}`, file);
  }
  const capability = actionEditorCapability(
    f.identity,
    {
      documentKey: f.documentKey,
      formId: f.form.id,
      targetId: f.response.id,
      targetType: "response",
    },
    action === "submit" ? "submit" : "save-draft",
    f.lease
  );
  return app.handle(
    new Request(`http://test.local/api/forms/${f.form.publicId}/${action}`, {
      body,
      headers: {
        Authorization: `Bearer ${f.bearer}`,
        "X-Editor-Capability": capability,
      },
      method: "POST",
    })
  );
};
const recover = (f: Fixture, checkpoint: string) =>
  app.handle(
    new Request(
      `http://test.local/api/responses/${f.response.id}/attachment-operations/${checkpoint}/recover`,
      {
        body: JSON.stringify({
          action: "save-draft",
          documentKey: f.documentKey,
        }),
        headers: {
          Authorization: `Bearer ${f.bearer}`,
          "Content-Type": "application/json",
          "X-Editor-Capability": actionEditorCapability(
            f.identity,
            {
              documentKey: f.documentKey,
              formId: f.form.id,
              targetId: f.response.id,
              targetType: "response",
            },
            "save-draft",
            f.lease
          ),
        },
        method: "POST",
      }
    )
  );
const poll = async (f: Fixture, accepted: Response) => {
  expect(accepted.status).toBe(202);
  const envelope = envelopeSchema.parse(await accepted.json());
  const deadline = Date.now() + 90_000;
  for (;;) {
    const result = await app.handle(
      new Request(`http://test.local/api/operations/${envelope.operationId}`, {
        headers: {
          Authorization: `Bearer ${f.bearer}`,
          "X-Editor-Capability": envelope.operationCapability,
        },
      })
    );
    expect(result.status).toBe(200);
    const payload = pollSchema.parse(await result.json());
    if (!["pending", "processing"].includes(payload.operation.status)) {
      return { ...envelope, ...payload.operation };
    }
    if (Date.now() >= deadline) {
      throw new Error("Scalar save did not settle");
    }
    // Native Builder and HTTP worker run outside this process; fake timers cannot advance their work.
    await Bun.sleep(50);
  }
};
const fillFirstReceiptBudget = (f: Fixture) => {
  // Each fixture receipt has a 36-character public id and 64-character token. Leave room for exactly its first complete object.
  const firstReceiptData = {
    docs_number: "DOC.42",
    fiscal_year: "2570",
    notes1: "ก".repeat(30_000),
    notes2: "ข".repeat(30_000),
    notes3: "",
    other: null,
    proof: {
      file_link: `${provider.url.origin}/files/${"a".repeat(36)}`,
      file_token: "a".repeat(64),
      original_name: "Original.BIN",
      size_bytes: 4,
    },
  };
  const remaining =
    262_144 -
    new TextEncoder().encode(JSON.stringify(firstReceiptData)).byteLength;
  const notes3 =
    "ค".repeat(Math.floor(remaining / 3)) + "a".repeat(remaining % 3);
  snapshots.set(
    f.documentKey,
    replaceCell(
      replaceCell(
        replaceCell(nativeTemplate, "B5", firstReceiptData.notes1),
        "B6",
        firstReceiptData.notes2
      ),
      "B7",
      notes3
    )
  );
};

const draft = async (f: Fixture) => {
  const result = await app.handle(
    new Request(`http://test.local/api/responses/${f.response.id}/draft/json`, {
      headers: { Authorization: `Bearer ${f.bearer}` },
    })
  );
  expect(result.status).toBe(200);
  return z.record(z.string(), z.unknown()).parse(await result.json());
};
const file = (bytes = new Uint8Array([0, 255, 7, 1]), name = "Original.BIN") =>
  new File([bytes], name, { type: "application/x-encrypted-private" });

test("negative checkpoint recovery fences a paused original sender before a retained File can save again", async () => {
  const f = await fixture();
  const retainedFile = file();
  const checkpoint = crypto.randomUUID();
  const started = received.length;
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  captureBarrier = {
    enter: () => {
      entered.resolve();
    },
    release: released.promise,
  };
  const lateSender = send(
    f,
    { folio_proof: retainedFile },
    "draft",
    checkpoint
  );
  try {
    await entered.promise;
    const lookup = await app.handle(
      new Request(
        `http://test.local/api/responses/${f.response.id}/attachment-operations/${checkpoint}`,
        { headers: { Authorization: `Bearer ${f.bearer}` } }
      )
    );
    expect(lookup.status).toBe(404);
    const recovery = await recover(f, checkpoint);
    expect(recovery.status).toBe(200);
    const proof = z
      .object({
        admission: z.literal("not-admitted"),
        lease: z.object({ expiresAt: z.string(), id: z.uuid() }),
      })
      .parse(await recovery.json());
    expect(proof.lease.id).not.toBe(f.lease.id);
    expect(received.length).toBe(started);
    expect(await draft(f)).toEqual({});
    captureBarrier = null;
    released.resolve();
    const rejected = await lateSender;
    expect(rejected.status).toBe(409);
    expect(received.length).toBe(started);
    expect(
      await prisma.ecmAttachmentBatch.count({
        where: {
          actorId: f.identity.id,
          checkpoint,
          responseId: f.response.id,
        },
      })
    ).toBe(0);
    const identity = await requireIdentity(
      new Request("http://test.local", {
        headers: { Authorization: `Bearer ${f.bearer}` },
      })
    );
    f.lease = await claimEditorLease(
      identity,
      "response",
      f.response.id,
      f.form.id
    );
    expect(f.lease.id).toBe(proof.lease.id);
    const accepted = await poll(
      f,
      await send(f, { folio_proof: retainedFile })
    );
    expect(accepted.status).toBe("completed");
    expect(received.length).toBe(started + 1);
    expect([...fixtureValue(received[started]).bytes]).toEqual([0, 255, 7, 1]);
    const canonical = await draft(f);
    expect(attachmentSchema.parse(canonical.proof).original_name).toBe(
      retainedFile.name
    );
  } finally {
    captureBarrier = null;
    released.resolve();
    await lateSender;
  }
});

test("explicit Draft accepts original scalar File bytes and reopens canonical receipt, not the editable cell URL", async () => {
  const f = await fixture();
  const start = received.length;
  const result = await poll(f, await send(f, { folio_proof: file() }));
  expect(result.status).toBe("completed");
  const data = await draft(f);
  expect(data).toMatchObject({
    docs_number: "DOC.42",
    fiscal_year: "2570",
    other: null,
    proof: { original_name: "Original.BIN", size_bytes: 4 },
  });
  const proof = attachmentSchema.parse(data.proof);
  const publicFile = await fetch(proof.file_link);
  expect([...new Uint8Array(await publicFile.arrayBuffer())]).toEqual([
    0, 255, 7, 1,
  ]);
  expect(Object.keys(proof).toSorted()).toEqual([
    "file_link",
    "file_token",
    "original_name",
    "size_bytes",
  ]);
  expect(received.length - start).toBe(1);
  expect([...fixtureValue(received[start]).bytes]).toEqual([0, 255, 7, 1]);
  expect(received[start]).toMatchObject({
    category: "หลักฐาน",
    number: "DOC.42",
    template: "0",
    year: "2570",
  });
  expect(fixtureValue(received[start]).name).toMatch(
    /^DOC\.42-.+-หลักฐาน\.BIN$/u
  );
  const saved = await prisma.response.findUniqueOrThrow({
    where: { id: f.response.id },
  });
  const workbook = await readObject(fixtureValue(saved.draftObjectKey));
  expect(readSpreadsheetWorkbook(workbook).cells.get("B3")?.value).toBe(
    proof.file_link
  );
  const xml = Object.values(unzipSync(workbook))
    .map((part) => strFromU8(part))
    .join("\n");
  expect(xml).not.toContain(proof.file_token);
  expect(xml).not.toContain("scalar-test-service-token");
  expect(xml).toContain("sheetProtection");
  expect(
    await prisma.ecmAttachmentReference.count({
      where: { responseId: f.response.id },
    })
  ).toBe(1);
  f.documentKey = fixtureValue(saved.draftDocumentKey);
  snapshots.set(f.documentKey, workbook);
  const before = received.length;
  const beforeLogin = logins;
  const reused = await poll(f, await send(f, {}));
  expect(reused.status).toBe("completed");
  expect(received.length).toBe(before);
  expect(logins).toBe(beforeLogin);
});

test.each([0, 1, 9_999_999, 10_000_000])(
  "scalar accepts %i actual bytes including encrypted and extensionless originals",
  async (size) => {
    const f = await fixture();
    const start = received.length;
    const bytes = new Uint8Array(size);
    if (size) {
      bytes[0] = 255;
      bytes[size - 1] = 7;
    }
    const result = await poll(
      f,
      await send(f, { folio_proof: file(bytes, "encrypted-original") })
    );
    expect(result.status).toBe("completed");
    expect(fixtureValue(received[start]).bytes).toEqual(bytes);
    expect(fixtureValue(received[start]).name).toMatch(/-หลักฐาน$/u);
    const data = await draft(f);
    expect(data.proof).toMatchObject({
      original_name: "encrypted-original",
      size_bytes: size,
    });
  }
);

test("oversize actual bytes and forged binding fail before provider writes and keep canonical Draft", async () => {
  const f = await fixture();
  const start = received.length;
  const oversized = await send(f, {
    folio_proof: file(new Uint8Array(10_000_001)),
  });
  expect(oversized.status).toBe(413);
  const forged = await send(f, { folio_forged: file() });
  expect(forged.status).toBe(400);
  expect(received.length).toBe(start);
  expect(await draft(f)).toEqual({});
});

test.each([
  { year: "" },
  { year: "25701" },
  { number: "" },
  { number: "DOC/42" },
  { number: "DOC\\42" },
])(
  "metadata %j rejects before writes and preserves canonical Draft",
  async (values) => {
    const f = await fixture(values);
    const start = received.length;
    const result = await poll(f, await send(f, { folio_proof: file() }));
    expect(result.status).toBe("failed");
    expect(result.result?.errorMessage).toMatch(/fiscal_year|docs_number/u);
    expect(received.length).toBe(start);
    expect(await draft(f)).toEqual({});
  }
);

test("direct Submit durably commits a required zero-byte attachment and exactly one Submission", async () => {
  const f = await fixture();
  const checkpoint = crypto.randomUUID();
  const result = await poll(
    f,
    await send(
      f,
      { folio_proof: file(new Uint8Array(), "empty") },
      "submit",
      checkpoint
    )
  );
  expect(result.status).toBe("completed");
  const submissions = await prisma.submission.findMany({
    where: { responseId: f.response.id },
  });
  expect(submissions).toHaveLength(1);
  expect(fixtureValue(submissions[0]).data).toMatchObject({
    proof: { original_name: "empty", size_bytes: 0 },
  });
  const beforeRecovery = received.length;
  const recovered = await app.handle(
    new Request(
      `http://test.local/api/responses/${f.response.id}/attachment-operations/${checkpoint}`,
      { headers: { Authorization: `Bearer ${f.bearer}` } }
    )
  );
  expect(recovered.status).toBe(200);
  expect(
    z
      .object({
        action: z.literal("submit"),
        operationId: z.string(),
        status: z.literal("completed"),
      })
      .parse(await recovered.json())
  ).toMatchObject({ action: "submit", operationId: result.operationId });
  const wrongAction = await send(f, {}, "draft", checkpoint);
  expect(wrongAction.status).toBe(409);
  expect(received.length).toBe(beforeRecovery);
  const replay = await send(
    f,
    { folio_proof: file(new Uint8Array(), "empty") },
    "submit",
    checkpoint
  );
  expect(replay.status).toBe(202);
  expect(envelopeSchema.parse(await replay.json()).operationId).toBe(
    result.operationId
  );
});

test("multi-scalar Folio failure after verified receipts is atomic and never reuses canceled identities", async () => {
  const f = await fixture();
  const start = received.length;
  const startDeletes = deleted.length;
  fillFirstReceiptBudget(f);
  const result = await poll(
    f,
    await send(f, {
      folio_other: file(new Uint8Array([9]), "other"),
      folio_proof: file(),
    })
  );
  expect(result.status).toBe("failed");
  expect(await draft(f)).toEqual({});
  expect(received.length - start).toBe(2);
  expect(deleted.slice(startDeletes).toSorted()).toEqual(
    [
      fixtureValue(received[start]).token,
      fixtureValue(received[start + 1]).token,
    ].toSorted()
  );
  snapshots.set(f.documentKey, nativeTemplate);
  const retried = await poll(
    f,
    await send(f, {
      folio_other: file(new Uint8Array([9]), "other"),
      folio_proof: file(),
    })
  );
  expect(retried.status).toBe("completed");
  expect(fixtureValue(received[start + 2]).name).not.toBe(
    fixtureValue(received[start]).name
  );
  expect(fixtureValue(received[start + 3]).name).not.toBe(
    fixtureValue(received[start + 1]).name
  );
});

test.each(["malformed", "body-failure", "store-then-reject"] as const)(
  "%s after-send receipt holds mutation independently of failed Folio Operation",
  async (mode) => {
    const f = await fixture();
    nextMode = mode;
    const start = received.length;
    const checkpoint = crypto.randomUUID();
    const result = await poll(
      f,
      await send(
        f,
        { folio_other: file(), folio_proof: file() },
        "draft",
        checkpoint
      )
    );
    expect(result.status).toBe("failed");
    expect(received.length - start).toBe(1);
    const created = fixtureValue(received[start]);
    const stored = [...providerFiles.values()].find(
      (saved) => saved.token === created.token
    );
    expect(stored?.bytes).toEqual(created.bytes);
    expect(await draft(f)).toEqual({});
    const blocked = await send(f, { folio_proof: file() });
    expect(blocked.status).toBe(409);
    const replay = await send(f, { folio_proof: file() }, "draft", checkpoint);
    expect(replay.status).toBe(202);
    expect(envelopeSchema.parse(await replay.json()).operationId).toBe(
      result.operationId
    );
    const lookup = await app.handle(
      new Request(
        `http://test.local/api/responses/${f.response.id}/attachment-operations/${checkpoint}`,
        { headers: { Authorization: `Bearer ${f.bearer}` } }
      )
    );
    expect(lookup.status).toBe(200);
    expect(envelopeSchema.parse(await lookup.json()).operationId).toBe(
      result.operationId
    );
    const removal = await app.handle(
      new Request(`http://test.local/api/responses/${f.response.id}`, {
        headers: { Authorization: `Bearer ${f.bearer}` },
        method: "DELETE",
      })
    );
    expect(removal.status).toBe(409);
    expect(received.length - start).toBe(1);
  }
);

test("concurrent duplicate clicks and a lost accepted response resolve the original checkpoint without resend", async () => {
  const f = await fixture();
  const checkpoint = crypto.randomUUID();
  const start = received.length;
  const requests = await Promise.all([
    send(f, { folio_proof: file() }, "draft", checkpoint),
    send(f, { folio_proof: file() }, "draft", checkpoint),
  ]);
  const first = await poll(f, fixtureValue(requests[0]));
  const second = await poll(f, fixtureValue(requests[1]));
  expect(first.status).toBe("completed");
  expect(second.operationId).toBe(first.operationId);
  expect(received.length - start).toBe(1);
  const recovered = await recover(f, checkpoint);
  expect(recovered.status).toBe(200);
  expect(envelopeSchema.parse(await recovered.json()).operationId).toBe(
    first.operationId
  );
  const lease = await prisma.editorLease.findFirstOrThrow({
    where: { targetId: f.response.id, targetType: "response" },
  });
  expect(lease.id).toBe(f.lease.id);
});

test.each([262_144, 262_145])(
  "whole canonical JSON enforces %i UTF-8 bytes across Thai native answers and complete receipt metadata",
  async (target) => {
    const f = await fixture();
    customToken = crypto.randomUUID().replaceAll("-", "").repeat(2);
    customLink = `${provider.url.origin}/files/boundary`;
    const expected = {
      docs_number: "DOC.42",
      fiscal_year: "2570",
      notes1: "ก".repeat(30_000),
      notes2: "ข".repeat(30_000),
      notes3: "",
      other: null,
      proof: {
        file_link: customLink,
        file_token: customToken,
        original_name: "Original.BIN",
        size_bytes: 4,
      },
    };
    const remaining =
      target - new TextEncoder().encode(JSON.stringify(expected)).byteLength;
    const notes3 =
      "ค".repeat(Math.floor(remaining / 3)) + "a".repeat(remaining % 3);
    snapshots.set(
      f.documentKey,
      replaceCell(
        replaceCell(
          replaceCell(nativeTemplate, "B5", expected.notes1),
          "B6",
          expected.notes2
        ),
        "B7",
        notes3
      )
    );
    const result = await poll(f, await send(f, { folio_proof: file() }));
    expect(result.status).toBe(target === 262_144 ? "completed" : "failed");
    const data = await draft(f);
    if (target === 262_144) {
      expect(new TextEncoder().encode(JSON.stringify(data)).byteLength).toBe(
        target
      );
      expect(attachmentSchema.parse(data.proof).file_link).toBe(customLink);
    } else {
      expect(data).toEqual({});
      expect(deleted).toContain(customToken);
    }
  }
);

test("a revoked lease after send cannot commit a late receipt or partial document", async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  receiveBarrier = {
    enter: () => entered.resolve(),
    release: released.promise,
  };
  const accepted = await send(f, { folio_proof: file() });
  await entered.promise;
  await prisma.editorLease.delete({ where: { id: f.lease.id } });
  released.resolve();
  const result = await poll(f, accepted);
  expect(result.status).toBe("failed");
  expect(await draft(f)).toEqual({});
});

test("cell URLs and client receipt objects never establish attachment ownership or start auth", async () => {
  const f = await fixture();
  const start = received.length;
  const beforeLogin = logins;
  snapshots.set(
    f.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(f.documentKey)),
      "B3",
      "https://attacker.example/forged"
    )
  );
  const result = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      data: {
        proof: {
          file_link: "https://attacker.example/forged",
          file_token: "forged",
          original_name: "fake",
          size_bytes: 0,
        },
      },
    })
  );
  expect(result.status).toBe("completed");
  const data = await draft(f);
  expect(data.proof).toBeNull();
  expect(received.length).toBe(start);
  expect(logins).toBe(beforeLogin);
});

test("failed canceled-batch cleanup keeps an independent mutation fence while canonical Draft remains readable", async () => {
  const f = await fixture();
  const start = received.length;
  fillFirstReceiptBudget(f);
  deleteFails = true;
  const result = await poll(
    f,
    await send(f, { folio_other: file(), folio_proof: file() })
  );
  expect(result.status).toBe("failed");
  expect(await draft(f)).toEqual({});
  const blocked = await send(f, { folio_proof: file() });
  expect(blocked.status).toBe(409);
  expect(
    await prisma.ecmAttachmentBatch.findUnique({
      where: { operationId: result.operationId },
    })
  ).toMatchObject({ state: "cleanup-pending" });
  expect(received.length - start).toBe(2);
});

test("forged Response scope and expired lease cannot send provider bytes", async () => {
  const owner = await fixture();
  const other = await fixture();
  const start = received.length;
  const forged = await send(
    owner,
    { folio_proof: file() },
    "draft",
    crypto.randomUUID(),
    {
      responseId: other.response.id,
    }
  );
  expect(forged.status).toBe(404);
  await prisma.editorLease.delete({ where: { id: owner.lease.id } });
  const expired = await send(owner, { folio_proof: file() });
  expect(expired.status).toBe(409);
  expect(received.length).toBe(start);
  expect(await draft(owner)).toEqual({});
});
