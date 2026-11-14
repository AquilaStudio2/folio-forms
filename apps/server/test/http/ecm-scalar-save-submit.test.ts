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
import {
  protectSpreadsheet,
  unprotectSpreadsheet,
} from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import {
  spreadsheetXmlTree,
  spreadsheetXmlChildren,
  serializeSpreadsheetXml,
} from "../../src/documents/spreadsheets/xml";
import { actionEditorCapability } from "../../src/editor/authorization";
import type { EditorLeaseGrant } from "../../src/editor/leases";
import { claimEditorLease } from "../../src/editor/leases";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import {
  xlsxEditorOpening,
  createOnlyOfficeAuthorization,
  createCallbackUserdata,
} from "../../src/onlyoffice";
import {
  attachmentSchema,
  tableAttachmentSchema,
} from "../../src/responses/attachment-data";
import { jsonValue } from "../../src/responses/data";
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
const nativeSnapshotKeys = new Map<string, string>();
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
const deleteSnapshots: { token: string; data: unknown; references: number }[] =
  [];
const deleteSettlements = new Map<
  string,
  { resolve: (value?: undefined) => void }
>();
const providerFiles = new Map<string, { bytes: Uint8Array; token: string }>();
let deleteFails = false;
let deleteMalformed = false;
let logins = 0;
let nextMode:
  | "ok"
  | "malformed"
  | "body-failure"
  | "store-then-reject"
  | "unauthorized" = "ok";
let rejectUploadAt: number | null = null;
let customLink: string | null = null;
let customToken: string | null = null;
let receiveBarrier: { enter: () => void; release: Promise<void> } | null = null;
let receiptBarrier: { enter: () => void; release: Promise<void> } | null = null;
let loginBarrier: { enter: () => void; release: Promise<void> } | null = null;
let captureBarrier: { enter: () => void; release: Promise<void> } | null = null;
const originalReads: {
  authorization: string | null;
  cookie: string | null;
  path: string;
}[] = [];
const publicGets: string[] = [];
let originalReadMode: "ok" | "redirect" | "oversized" | "wrong-size" = "ok";
let deleteBarrier: { enter: () => void; release: Promise<void> } | null = null;
const provider = Bun.serve({
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && !url.pathname.startsWith("/snapshot/")) {
      publicGets.push(url.pathname);
    }
    if (request.method === "GET" && url.pathname.startsWith("/snapshot/")) {
      const nativeKey = decodeURIComponent(
        url.pathname.slice("/snapshot/".length)
      );
      const canonicalKey = nativeSnapshotKeys.get(nativeKey);
      const bytes = canonicalKey ? snapshots.get(canonicalKey) : undefined;
      return bytes
        ? new Response(new Uint8Array(bytes))
        : new Response(null, { status: 404 });
    }
    if (url.pathname.endsWith("/login")) {
      const login = loginBarrier;
      if (login) {
        loginBarrier = null;
        login.enter();
        await login.release;
      }
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
      originalReads.push({
        authorization: request.headers.get("authorization"),
        cookie: request.headers.get("cookie"),
        path: url.pathname,
      });
      if (originalReadMode === "redirect") {
        return Response.redirect(`${provider.url.origin}/redirect-target`, 302);
      }
      if (originalReadMode === "oversized") {
        return new Response(new Uint8Array(10_000_001));
      }
      if (originalReadMode === "wrong-size") {
        return new Response(new Uint8Array([1]));
      }
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
      const owned = await prisma.ecmAttachmentVersion.findUniqueOrThrow({
        where: { fileToken: token },
      });
      const canonical = await prisma.response.findUnique({
        select: { draftData: true },
        where: { id: owned.responseId },
      });
      deleteSnapshots.push({
        data: canonical?.draftData,
        references: await prisma.ecmAttachmentReference.count({
          where: { versionId: owned.id },
        }),
        token,
      });
      const deleting = deleteBarrier;
      if (deleting) {
        deleteBarrier = null;
        deleting.enter();
        await deleting.release;
      }
      if (deleteFails) {
        deleteSettlements.get(token)?.resolve();
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
      deleteSettlements.get(token)?.resolve();
      if (deleteMalformed) {
        return Response.json({
          data: [],
          msg: "fixture omitted deletion confirmation",
          status: 200,
        });
      }
      return Response.json({ data: null, msg: "ok", status: 200 });
    }
    if (url.pathname.endsWith("/file") && request.method === "POST") {
      if (nextMode === "unauthorized") {
        nextMode = "ok";
        return Response.json({ data: null, status: 401 }, { status: 401 });
      }
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
      if (received.length === rejectUploadAt) {
        return Response.json(
          { data: null, msg: "fixture rejected this file", status: 422 },
          { status: 422 }
        );
      }
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
      const receipt = receiptBarrier;
      if (receipt) {
        receiptBarrier = null;
        receipt.enter();
        await receipt.release;
      }
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
let heldNativeForceSave:
  | ((value: { documentServerKey: string; userdata: string }) => void)
  | null = null;
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
    downloadEditorWorkbook: async ({ documentServerKey }) => {
      const barrier = captureBarrier;
      if (barrier) {
        barrier.enter();
        await barrier.release;
      }
      const canonicalKey = nativeSnapshotKeys.get(documentServerKey);
      const snapshot = canonicalKey ? snapshots.get(canonicalKey) : undefined;
      if (!snapshot) {
        throw new Error("No native snapshot for this document");
      }
      return snapshot;
    },
    forceSave: (documentServerKey, userdata) => {
      const held = heldNativeForceSave;
      if (held) {
        heldNativeForceSave = null;
        held({ documentServerKey, userdata });
        return Promise.resolve(true);
      }
      return Promise.resolve({
        url: `${provider.url.origin}/snapshot/${encodeURIComponent(documentServerKey)}`,
      });
    },
  },
  onlyOfficeCallbackOrigins: [provider.url.origin],
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
  authSessionId: string;
  bearer: string;
  form: { id: string; publicId: string };
  response: { id: string };
  identity: EditorCapabilityIdentity;
  lease: EditorLeaseGrant;
  documentKey: string;
  documentServerKey: string;
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
  values: {
    year?: string;
    number?: string;
    table?: boolean;
    tableAttachments?: boolean;
    tableItemRequired?: boolean;
    project?: boolean;
    admin?: boolean;
    viewer?: boolean;
  } = {}
): Promise<Fixture> => {
  nextMode = "ok";
  customLink = null;
  customToken = null;
  deleteFails = false;
  deleteMalformed = false;
  rejectUploadAt = null;
  originalReadMode = "ok";
  const id = crypto.randomUUID();
  const password = "Scalar-isolated-fixture-password!";
  let role: "admin" | "viewer" | "user" = "user";
  if (values.admin) {
    role = "admin";
  } else if (values.viewer) {
    role = "viewer";
  }
  const user = await createCredentialFixture({
    email: `scalar-${id}@example.test`,
    name: "Scalar User",
    password,
    role,
  });
  const bearer = await bearerFor(app, user.email, password);
  const documentKey = `scalar-${id}`;
  const responseId = crypto.randomUUID();
  const objectKey = `responses/${responseId}/draft/${id}.xlsx`;
  const templateObjectKey = `tests/scalar/${id}/template.xlsx`;
  let template = nativeTemplate;
  let publishedBindings = bindings;
  if (values.table || values.tableAttachments) {
    publishedBindings = spreadsheetBindingSchema.parse({
      ...bindings,
      table: {
        anchor: "folio_rows",
        columns: [
          {
            id: "folio_item",
            key: "item",
            label: "รายการ",
            offset: 0,
            required: values.tableItemRequired ?? false,
            type: "text",
          },
          ...(values.tableAttachments
            ? [
                {
                  attachment: { category: "หลักฐาน" },
                  id: "folio_row_proof",
                  key: "proof",
                  label: "หลักฐานรายแถว",
                  offset: 1,
                  required: true,
                  type: "text",
                },
                {
                  attachment: { category: "อื่น" },
                  id: "folio_row_other",
                  key: "other",
                  label: "เอกสารอื่นรายแถว",
                  offset: 2,
                  type: "text",
                },
              ]
            : []),
        ],
        id: "folio_rows",
        key: "rows",
        label: "ตาราง",
      },
    });
    const withTable = mutatePart(nativeTemplate, "xl/workbook.xml", (xml) =>
      xml.replace(
        "</definedNames>",
        values.tableAttachments
          ? "<definedName name=\"folio_rows\">'Form'!$B$10:$D$13</definedName><definedName name=\"folio_columns_folio_rows\">'Form'!$B$10:$D$13</definedName><definedName name=\"folio_column_folio_item\">'Form'!$B$10:$B$13</definedName><definedName name=\"folio_column_folio_row_proof\">'Form'!$C$10:$C$13</definedName><definedName name=\"folio_column_folio_row_other\">'Form'!$D$10:$D$13</definedName><definedName name=\"_folio_upload_poc_folio_row_proof\">'Form'!$C$10:$C$13</definedName><definedName name=\"_folio_upload_poc_folio_row_other\">'Form'!$D$10:$D$13</definedName></definedNames>"
          : "<definedName name=\"folio_rows\">'Form'!$B$10:$B$11</definedName><definedName name=\"folio_columns_folio_rows\">'Form'!$B$10:$B$11</definedName><definedName name=\"folio_column_folio_item\">'Form'!$B$10:$B$11</definedName></definedNames>"
      )
    );
    const prepared = await processSpreadsheet(unprotectSpreadsheet(withTable), {
      bindings: publishedBindings,
    });
    template = protectSpreadsheet(
      prepared.workbook,
      resolveSpreadsheetContract(
        publishedBindings,
        readSpreadsheetWorkbook(prepared.workbook)
      )
    );
  }
  if (values.project) {
    publishedBindings = spreadsheetBindingSchema.parse({
      ...publishedBindings,
      fields: publishedBindings.fields.map((field) =>
        field.id === "folio_notes1"
          ? { ...field, source: "pdms-project-name", type: "dropdown" }
          : field
      ),
    });
    const prepared = await processSpreadsheet(unprotectSpreadsheet(template), {
      bindings: publishedBindings,
    });
    template = protectSpreadsheet(
      prepared.workbook,
      resolveSpreadsheetContract(
        publishedBindings,
        readSpreadsheetWorkbook(prepared.workbook)
      )
    );
  }
  await putObject(objectKey, template);
  await putObject(templateObjectKey, template);
  let snapshot = template;
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
                create: spreadsheetManifestFieldData(publishedBindings),
              },
            },
          },
          objectKey: templateObjectKey,
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
      id: responseId,
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
  const native = xlsxEditorOpening(
    documentKey,
    JSON.stringify([identity.id, identity.sessionId])
  );
  nativeSnapshotKeys.set(native.documentServerKey, documentKey);
  return {
    authSessionId: identity.sessionId,
    bearer,
    documentKey,
    documentServerKey: native.documentServerKey,
    form,
    identity,
    lease,
    response,
  };
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
    body.set(
      `attachment:${binding.startsWith("[") ? encodeURIComponent(binding) : binding}`,
      file
    );
  }
  const capability = actionEditorCapability(
    f.identity,
    {
      documentKey: f.documentKey,
      documentServerKey: f.documentServerKey,
      formId: f.form.id,
      targetId: f.response.id,
      targetType: "response",
      ...(typeof extra.pdmsCatalogSessionId === "string"
        ? { pdmsCatalogSessionId: extra.pdmsCatalogSessionId }
        : {}),
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
              documentServerKey: f.documentServerKey,
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
  let admissionError: string | undefined;
  if (accepted.status !== 202) {
    const body = z.object({ error: z.string(), message: z.string() }).safeParse(
      await accepted
        .clone()
        .json()
        .catch(() => null)
    );
    admissionError = body.success
      ? `${body.data.error.slice(0, 128)}: ${body.data.message.slice(0, 512)}`
      : "Admission returned no safe application error envelope";
  }
  expect(accepted.status, admissionError).toBe(202);
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
const tableRowsSchema = z.array(
  z.object({
    item: z.string().nullable(),
    other: tableAttachmentSchema.nullable(),
    proof: tableAttachmentSchema.nullable(),
  })
);
const file = (bytes = new Uint8Array([0, 255, 7, 1]), name = "Original.BIN") =>
  new File([bytes], name, { type: "application/x-encrypted-private" });

const followUpSchema = z.object({
  actorId: z.string().nullable(),
  canFence: z.boolean(),
  generation: z.number().nullable(),
  mutationHeld: z.boolean(),
  operationId: z.string(),
  responseDeleted: z.boolean(),
  responseId: z.string(),
  state: z.string(),
  versions: z.array(
    z.object({
      bindingId: z.string(),
      canDelete: z.boolean(),
      cleanupState: z.string().nullable(),
      confirmedAt: z.string().nullable(),
      confirmedBy: z.string().nullable(),
      deleteAttemptedAt: z.string().nullable(),
      evidence: z.record(z.string(), z.unknown()).nullable(),
      generation: z.number(),
      id: z.string(),
      referenced: z.boolean(),
      requestSettledAt: z.string().nullable(),
      rowIndex: z.number().nullable(),
      state: z.string(),
    })
  ),
});
const followUpFor = async (
  actor: Fixture,
  operationId: string,
  ready: (entry: z.infer<typeof followUpSchema>) => boolean = () => true
) => {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const response = await app.handle(
      new Request("http://test.local/api/admin/results/attachment-follow-up", {
        headers: { Authorization: `Bearer ${actor.bearer}` },
      })
    );
    expect(response.status).toBe(200);
    const payload = z
      .object({ followUps: z.array(followUpSchema) })
      .parse(await response.json());
    const entry = payload.followUps.find(
      (candidate) => candidate.operationId === operationId
    );
    if (entry && ready(entry)) {
      return entry;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Follow-up ${operationId} did not reach the observed request outcome`
      );
    }
    // Provider/native work runs outside fake time; poll public evidence until its actual durable transition.
    await Bun.sleep(25);
  }
};
const operatorAction = (
  actor: Fixture,
  operationId: string,
  action: "cancel" | "settle",
  body: unknown
) =>
  app.handle(
    new Request(
      `http://test.local/api/admin/results/attachment-follow-up/${operationId}/${action}`,
      {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${actor.bearer}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    )
  );

const resume = async (f: Fixture) => {
  const saved = await prisma.response.findUniqueOrThrow({
    where: { id: f.response.id },
  });
  f.documentKey = fixtureValue(saved.draftDocumentKey);
  f.documentServerKey = xlsxEditorOpening(
    f.documentKey,
    JSON.stringify([f.identity.id, f.authSessionId])
  ).documentServerKey;
  nativeSnapshotKeys.set(f.documentServerKey, f.documentKey);
  snapshots.set(
    f.documentKey,
    await readObject(fixtureValue(saved.draftObjectKey))
  );
};

test("table attachments retain physical gaps and attachment-only zero-byte rows across multiple columns", async () => {
  const f = await fixture({ tableAttachments: true });
  const uploads = received.length;
  const completed = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array(),
        "empty.TXT"
      ),
      [JSON.stringify(["folio_row_other", 2])]: file(
        new Uint8Array([7]),
        "other.BIN"
      ),
      [JSON.stringify(["folio_row_other", 3])]: file(
        new Uint8Array([9]),
        "last.BIN"
      ),
    })
  );
  expect(completed.status).toBe("completed");
  const saved = await draft(f);
  expect(saved.rows).toEqual([
    {
      item: null,
      other: {
        file_link: expect.any(String),
        file_token: expect.any(String),
        original_name: "other.BIN",
        row_index: 2,
        size_bytes: 1,
      },
      proof: {
        file_link: expect.any(String),
        file_token: expect.any(String),
        original_name: "empty.TXT",
        row_index: 2,
        size_bytes: 0,
      },
    },
    {
      item: null,
      other: {
        file_link: expect.any(String),
        file_token: expect.any(String),
        original_name: "last.BIN",
        row_index: 3,
        size_bytes: 1,
      },
      proof: null,
    },
  ]);
  expect(received.slice(uploads).map((entry) => [...entry.bytes])).toEqual([
    [],
    [7],
    [9],
  ]);
  await resume(f);
  const workbook = readSpreadsheetWorkbook(
    fixtureValue(snapshots.get(f.documentKey))
  );
  expect(workbook.cells.get("C10")?.value ?? null).toBeNull();
  expect(workbook.cells.get("C12")?.value).toBe(
    tableRowsSchema.parse(saved.rows)[0]?.proof?.file_link
  );
});

test("table attachment-only selected rows validate other required columns before any upload", async () => {
  const f = await fixture({ tableAttachments: true, tableItemRequired: true });
  const uploads = received.length;
  const result = await poll(
    f,
    await send(
      f,
      {
        folio_proof: file(),
        [JSON.stringify(["folio_row_proof", 2])]: file(
          new Uint8Array(),
          "empty.TXT"
        ),
      },
      "submit"
    )
  );
  expect(result.status).toBe("failed");
  expect(received.length).toBe(uploads);
  expect(await draft(f)).toEqual({});
});

test("table fully empty rows need no attachments but active ordinary rows require their column attachment", async () => {
  const empty = await fixture({
    tableAttachments: true,
    tableItemRequired: true,
  });
  const emptySubmission = await poll(
    empty,
    await send(empty, { folio_proof: file() }, "submit")
  );
  expect(emptySubmission.status).toBe("completed");
  const active = await fixture({
    tableAttachments: true,
    tableItemRequired: true,
  });
  snapshots.set(
    active.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(active.documentKey)),
      "B12",
      "รายการจริง"
    )
  );
  const uploads = received.length;
  const activeSubmission = await poll(
    active,
    await send(active, { folio_proof: file() }, "submit")
  );
  expect(activeSubmission.status).toBe("failed");
  expect(received.length).toBe(uploads);
});

test("table zero-byte required files submit with valid ordinary input at physical not compact indices", async () => {
  const f = await fixture({ tableAttachments: true, tableItemRequired: true });
  snapshots.set(
    f.documentKey,
    replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B12", "รายการจริง")
  );
  const result = await poll(
    f,
    await send(
      f,
      {
        folio_proof: file(),
        [JSON.stringify(["folio_row_proof", 2])]: file(
          new Uint8Array(),
          "empty.TXT"
        ),
      },
      "submit"
    )
  );
  expect(result.status).toBe("completed");
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: String(result.result?.submissionId) },
  });
  expect(
    z.object({ rows: tableRowsSchema }).parse(submission.data).rows
  ).toEqual([
    {
      item: "รายการจริง",
      other: null,
      proof: {
        file_link: expect.any(String),
        file_token: expect.any(String),
        original_name: "empty.TXT",
        row_index: 2,
        size_bytes: 0,
      },
    },
  ]);
});

test("table row shifts preserve exact versions and immutable send positions without ECM writes", async () => {
  const f = await fixture({ tableAttachments: true });
  const initial = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array(),
        "empty.TXT"
      ),
      [JSON.stringify(["folio_row_other", 3])]: file(
        new Uint8Array([9]),
        "last.BIN"
      ),
    })
  );
  expect(initial.status).toBe("completed");
  const before = await draft(f);
  await resume(f);
  const oldDocumentKey = f.documentKey;
  const uploads = received.length;
  const deletes = deleted.length;
  const result = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      rowChange: { action: "delete", index: 0 },
    })
  );
  expect(result.status).toBe("completed");
  expect(result.result?.attachmentTransition).toEqual({
    fromDocumentKey: oldDocumentKey,
    newRowCount: 3,
    oldRowCount: 4,
    rowMapping: [null, 0, 1, 2],
    tableBindingId: "folio_rows",
    toDocumentKey: result.result?.documentKey,
  });
  const saved = await draft(f);
  const previous = tableRowsSchema.parse(before.rows);
  expect(saved.rows).toEqual([
    { item: null, other: null, proof: { ...previous[0]?.proof, row_index: 1 } },
    { item: null, other: { ...previous[1]?.other, row_index: 2 }, proof: null },
  ]);
  const original = await prisma.ecmAttachmentVersion.findFirstOrThrow({
    where: { fileToken: String(previous[0]?.proof?.file_token) },
  });
  expect(original.rowIndex).toBe(2);
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  await resume(f);
  const unchanged = await poll(f, await send(f, {}));
  expect(unchanged.status).toBe("completed");
  expect(await draft(f)).toEqual(saved);
  expect(received.length).toBe(uploads);
});

test("table append preserves saved file slots and returns verified remount mapping without upload", async () => {
  const f = await fixture({ tableAttachments: true });
  const initial = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(),
    })
  );
  expect(initial.status).toBe("completed");
  const before = await draft(f);
  await resume(f);
  const uploads = received.length;
  const result = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      rowChange: { action: "insert", index: 4 },
    })
  );
  expect(result.status).toBe("completed");
  expect(result.result?.attachmentTransition).toMatchObject({
    newRowCount: 5,
    oldRowCount: 4,
    rowMapping: [0, 1, 2, 3],
  });
  expect(await draft(f)).toEqual(before);
  expect(received.length).toBe(uploads);
});

test("table stale snapshots and forged physical slots stop before external writes", async () => {
  const f = await fixture({ tableAttachments: true });
  const uploads = received.length;
  const forged = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 4])]: file(),
    })
  );
  expect(forged.status).toBe("failed");
  expect(received.length).toBe(uploads);
  const current = fixtureValue(snapshots.get(f.documentKey));
  expect(
    readSpreadsheetWorkbook(current).names.get("folio_rows")
  ).toMatchObject({
    firstRow: 9,
    lastRow: 12,
  });
  const altered = mutatePart(current, "xl/workbook.xml", (xml) => {
    const workbook = spreadsheetXmlTree(xml);
    const names = fixtureValue(
      spreadsheetXmlChildren(workbook, "definedNames")[0]
    );
    const table = fixtureValue(
      spreadsheetXmlChildren(names, "definedName").find(
        (name) => name.attributes.name === "folio_rows"
      )
    );
    table.children = ["'Form'!$B$10:$D$14"];
    return serializeSpreadsheetXml(workbook);
  });
  expect(
    readSpreadsheetWorkbook(altered).names.get("folio_rows")
  ).toMatchObject({
    firstRow: 9,
    lastRow: 13,
  });
  snapshots.set(f.documentKey, altered);
  const stale = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(),
    })
  );
  expect(stale.status).toBe("failed");
  expect(received.length).toBe(uploads);
  expect(await draft(f)).toEqual({});
});

test("table removals compact only empty rows and never cross-wire another attachment column", async () => {
  const f = await fixture({ tableAttachments: true });
  const initial = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array(),
        "empty.TXT"
      ),
      [JSON.stringify(["folio_row_other", 2])]: file(
        new Uint8Array([7]),
        "other.BIN"
      ),
      [JSON.stringify(["folio_row_other", 3])]: file(
        new Uint8Array([9]),
        "last.BIN"
      ),
    })
  );
  expect(initial.status).toBe("completed");
  const before = await draft(f);
  await resume(f);
  const uploads = received.length;
  const removed = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      attachmentRemovals: [
        { bindingId: "folio_row_proof", rowIndex: 2 },
        { bindingId: "folio_row_other", rowIndex: 2 },
      ],
    })
  );
  expect(removed.status).toBe("completed");
  const after = await draft(f);
  expect(after.rows).toEqual([tableRowsSchema.parse(before.rows)[1]]);
  expect(received.length).toBe(uploads);
});
test("table multi-column failure leaves the complete old Draft and never sends the next physical slot", async () => {
  const f = await fixture({ tableAttachments: true });
  const initial = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array([1]),
        "old.TXT"
      ),
    })
  );
  expect(initial.status).toBe("completed");
  const before = await draft(f);
  await resume(f);
  const uploads = received.length;
  rejectUploadAt = uploads + 2;
  const result = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array([2]),
        "replace.TXT"
      ),
      [JSON.stringify(["folio_row_other", 2])]: file(
        new Uint8Array([3]),
        "reject.BIN"
      ),
      [JSON.stringify(["folio_row_other", 3])]: file(
        new Uint8Array([4]),
        "not-sent.BIN"
      ),
    })
  );
  expect(result.status).toBe("failed");
  expect(received.slice(uploads).map((entry) => [...entry.bytes])).toEqual([
    [2],
    [3],
  ]);
  expect(await draft(f)).toEqual(before);
});

test("table metadata changes reupload saved original bytes for every physical slot using one root number and year", async () => {
  const f = await fixture({ tableAttachments: true });
  const initial = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array(),
        "empty.TXT"
      ),
      [JSON.stringify(["folio_row_other", 3])]: file(
        new Uint8Array([8]),
        "last.BIN"
      ),
    })
  );
  expect(initial.status).toBe("completed");
  await resume(f);
  snapshots.set(
    f.documentKey,
    replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B2", "DOC.43")
  );
  const uploads = received.length;
  const changed = await poll(f, await send(f, {}));
  expect(changed.status).toBe("completed");
  expect(
    received.slice(uploads).map((entry) => ({
      bytes: [...entry.bytes],
      category: entry.category,
      number: entry.number,
      year: entry.year,
    }))
  ).toEqual([
    { bytes: [], category: "หลักฐาน", number: "DOC.43", year: "2570" },
    { bytes: [8], category: "อื่น", number: "DOC.43", year: "2570" },
  ]);
  const saved = await draft(f);
  const rows = tableRowsSchema.parse(saved.rows);
  expect(rows[0]?.proof?.row_index).toBe(2);
  expect(rows[1]?.other?.row_index).toBe(3);
});

test("saved Draft reopen separates native opening keys without changing canonical bytes or attachments", async () => {
  const f = await fixture();
  const saved = await poll(f, await send(f, { folio_proof: file() }));
  expect(saved.status).toBe("completed");
  await resume(f);
  const canonical = await draft(f);
  const uploads = received.length;
  const deletes = deleted.length;
  const authentication = logins;
  const configSchema = z.object({
    bridge: z.object({}).passthrough(),
    config: z.object({
      document: z.object({ key: z.string(), url: z.string() }),
    }),
  });
  const opening = crypto.randomUUID();
  const open = async (openingId?: string) => {
    const response = await app.handle(
      new Request(
        `http://test.local/api/forms/${f.form.publicId}/editor-config?responseId=${f.response.id}&action=draft${openingId ? `&pdmsOpeningId=${openingId}` : ""}`,
        { headers: { Authorization: `Bearer ${f.bearer}` } }
      )
    );
    expect(response.status).toBe(200);
    return configSchema.parse(await response.json());
  };
  const first = await open(opening);
  const refreshed = await open(opening);
  expect(refreshed.config.document.key).toBe(first.config.document.key);
  const reopened = await open(crypto.randomUUID());
  expect(reopened.config.document.key).not.toBe(first.config.document.key);
  expect(first.bridge.documentKey).toBe(f.documentKey);
  expect(reopened.bridge.documentKey).toBe(f.documentKey);
  const direct = await open();
  const nextDirect = await open();
  expect(direct.config.document.key).not.toBe(nextDirect.config.document.key);
  expect(direct.bridge.documentKey).toBe(f.documentKey);
  const document = await app.handle(
    new Request(reopened.config.document.url, {
      headers: {
        Authorization: createOnlyOfficeAuthorization({
          url: reopened.config.document.url,
        }),
      },
    })
  );
  expect(document.status).toBe(200);
  const reopenedBytes: Uint8Array = new Uint8Array(
    await document.arrayBuffer()
  );
  expect(reopenedBytes).toEqual(fixtureValue(snapshots.get(f.documentKey)));
  const reopenedData = await draft(f);
  expect(reopenedData).toEqual(canonical);
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(logins).toBe(authentication);
  const malformed = await app.handle(
    new Request(
      `http://test.local/api/forms/${f.form.publicId}/editor-config?responseId=${f.response.id}&action=draft&pdmsOpeningId=not-an-opening`,
      { headers: { Authorization: `Bearer ${f.bearer}` } }
    )
  );
  expect(malformed.status).toBe(400);
});

test("read-only saved Draft viewers use independent native caches and retain canonical saved bytes", async () => {
  const f = await fixture();
  const saved = await poll(f, await send(f, { folio_proof: file() }));
  expect(saved.status).toBe("completed");
  await resume(f);
  const canonical = await draft(f);
  const canonicalBytes = fixtureValue(snapshots.get(f.documentKey));
  const admin = await fixture({ admin: true });
  const uploads = received.length;
  const authentication = logins;
  const view = async () => {
    const response = await app.handle(
      new Request(
        `http://test.local/api/admin/results/${f.response.id}/viewer-config`,
        { headers: { Authorization: `Bearer ${admin.bearer}` } }
      )
    );
    expect(response.status).toBe(200);
    return z
      .object({
        config: z.object({
          document: z.object({ key: z.string(), url: z.string() }),
        }),
      })
      .parse(await response.json());
  };
  const first = await view();
  const second = await view();
  expect(first.config.document.key).not.toBe(f.documentKey);
  expect(first.config.document.key).not.toBe(f.documentServerKey);
  expect(second.config.document.key).not.toBe(first.config.document.key);
  for (const viewer of [first, second]) {
    const response = await app.handle(
      new Request(viewer.config.document.url, {
        headers: {
          Authorization: createOnlyOfficeAuthorization({
            url: viewer.config.document.url,
          }),
        },
      })
    );
    expect(response.status).toBe(200);
    const viewerBytes: Uint8Array = new Uint8Array(
      await response.arrayBuffer()
    );
    expect(viewerBytes).toEqual(canonicalBytes);
  }
  const viewedData = await draft(f);
  expect(viewedData).toEqual(canonical);
  expect(received.length).toBe(uploads);
  expect(logins).toBe(authentication);
});

test("native callbacks reject canonical and foreign opening keys without consuming the admitted saved Draft operation", async () => {
  const f = await fixture({ table: true });
  const initial = await poll(f, await send(f, { folio_proof: file() }));
  expect(initial.status).toBe("completed");
  await resume(f);
  const canonical = await draft(f);
  const uploads = received.length;
  const authentication = logins;
  const captured = Promise.withResolvers<{
    documentServerKey: string;
    userdata: string;
  }>();
  heldNativeForceSave = captured.resolve;
  const accepted = await send(f, {}, "draft", crypto.randomUUID(), {
    rowChange: { action: "insert", index: 2 },
  });
  expect(accepted.status).toBe(202);
  const envelope = envelopeSchema.parse(await accepted.clone().json());
  const native = await captured.promise;
  expect(native.documentServerKey).not.toBe(f.documentKey);
  const deliverNativeSnapshot = async (key: string, userdata: string) => {
    const payload = {
      key,
      status: 6,
      url: `${provider.url.origin}/snapshot/${encodeURIComponent(native.documentServerKey)}`,
      userdata,
    };
    const response = await app.handle(
      new Request("http://test.local/onlyoffice/callback", {
        body: JSON.stringify(payload),
        headers: {
          Authorization: createOnlyOfficeAuthorization(payload),
          "Content-Type": "application/json",
        },
        method: "POST",
      })
    );
    return response.json();
  };
  const canonicalCallback = await deliverNativeSnapshot(
    f.documentKey,
    native.userdata
  );
  expect(canonicalCallback).toEqual({ error: 1 });
  const foreignKey = xlsxEditorOpening(
    f.documentKey,
    "foreign-opening"
  ).documentServerKey;
  const foreignCallback = await deliverNativeSnapshot(
    foreignKey,
    native.userdata
  );
  expect(foreignCallback).toEqual({ error: 1 });
  const foreignClaimCallback = await deliverNativeSnapshot(
    foreignKey,
    createCallbackUserdata({
      documentKey: f.documentKey,
      documentServerKey: foreignKey,
      operationId: envelope.operationId,
      operationType: "save_draft",
    })
  );
  expect(foreignClaimCallback).toEqual({ error: 1 });
  const heldDraft = await prisma.response.findUniqueOrThrow({
    select: { draftData: true, draftDocumentKey: true },
    where: { id: f.response.id },
  });
  const heldData = z.record(z.string(), z.unknown()).parse(heldDraft.draftData);
  expect(heldData).toEqual(canonical);
  expect(heldDraft.draftDocumentKey).toBe(f.documentKey);
  const held = await prisma.operation.findUniqueOrThrow({
    where: { id: envelope.operationId },
  });
  expect(held.status).toBe("processing");
  const admittedCallback = await deliverNativeSnapshot(
    native.documentServerKey,
    native.userdata
  );
  expect(admittedCallback).toEqual({ error: 0 });
  const completed = await poll(f, accepted);
  expect(completed.status).toBe("completed");
  const committed = await prisma.response.findUniqueOrThrow({
    where: { id: f.response.id },
  });
  expect(committed.draftDocumentKey).not.toBe(f.documentKey);
  const committedData = await draft(f);
  expect(committedData).toMatchObject({ proof: canonical.proof });
  const duplicateCallback = await deliverNativeSnapshot(
    native.documentServerKey,
    native.userdata
  );
  expect(duplicateCallback).toEqual({ error: 0 });
  const replayed = await prisma.response.findUniqueOrThrow({
    where: { id: f.response.id },
  });
  expect(replayed.draftDocumentKey).toBe(committed.draftDocumentKey);
  expect(received.length).toBe(uploads);
  expect(logins).toBe(authentication);
});

test("Draft metadata change refetches original bytes without reselection and cleans only the superseded version", async () => {
  const f = await fixture();
  const operationOutcome1 = await poll(
    f,
    await send(f, { folio_proof: file() })
  );
  expect(operationOutcome1.status).toBe("completed");
  const canonicalData2 = await draft(f);
  const old = attachmentSchema.parse(canonicalData2.proof);
  await resume(f);
  const uploads = received.length;
  const authentication = logins;
  const operationOutcome3 = await poll(f, await send(f, {}));
  expect(operationOutcome3.status).toBe("completed");
  expect(received.length).toBe(uploads);
  expect(logins).toBe(authentication);
  await resume(f);
  snapshots.set(
    f.documentKey,
    replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B2", "DOC.43")
  );
  const cleanup = Promise.withResolvers<undefined>();
  deleteSettlements.set(old.file_token, cleanup);
  const operationOutcome4 = await poll(f, await send(f, {}));
  expect(operationOutcome4.status).toBe("completed");
  await cleanup.promise;
  const canonicalData5 = await draft(f);
  const updated = attachmentSchema.parse(canonicalData5.proof);
  expect(updated.file_link).not.toBe(old.file_link);
  expect(updated.original_name).toBe("Original.BIN");
  expect([...fixtureValue(received.at(-1)).bytes]).toEqual([0, 255, 7, 1]);
  expect(fixtureValue(received.at(-1)).number).toBe("DOC.43");
  expect(fixtureValue(received.at(-1)).name.endsWith(".BIN")).toBe(true);
  expect(deleted).toContain(old.file_token);
  expect(
    fixtureValue(
      deleteSnapshots.find((entry) => entry.token === old.file_token)
    )
  ).toMatchObject({ data: { proof: updated }, references: 0 });
  const publicResponse6 = await fetch(old.file_link);
  expect(publicResponse6.status).toBe(404);
  const publicResponse7 = await fetch(updated.file_link);
  expect(publicResponse7.status).toBe(200);
});

test.each(["failed", "unknown"] as const)(
  "explicit Draft removal keeps a durable %s cleanup warning without retrying old DELETE",
  async (mode) => {
    const f = await fixture();
    const operationOutcome8 = await poll(
      f,
      await send(f, { folio_proof: file() })
    );
    expect(operationOutcome8.status).toBe("completed");
    const canonicalData9 = await draft(f);
    const old = attachmentSchema.parse(canonicalData9.proof);
    await resume(f);
    deleteFails = mode === "failed";
    deleteMalformed = mode === "unknown";
    const uploads = received.length;
    const deletes = deleted.length;
    const cleanup = Promise.withResolvers<undefined>();
    deleteSettlements.set(old.file_token, cleanup);
    const operationOutcome10 = await poll(
      f,
      await send(f, {}, "draft", crypto.randomUUID(), {
        attachmentRemovals: [{ bindingId: "folio_proof", rowIndex: null }],
        data: {
          proof: {
            file_link: "https://attacker.example/victim",
            file_token: "not-owned",
            original_name: "victim",
            size_bytes: 1,
          },
        },
      })
    );
    expect(operationOutcome10.status).toBe("completed");
    await cleanup.promise;
    expect(
      fixtureValue(
        deleteSnapshots.find((entry) => entry.token === old.file_token)
      )
    ).toMatchObject({ data: { proof: null }, references: 0 });
    const canonicalData11 = await draft(f);
    expect(canonicalData11.proof).toBeNull();
    expect(received.length).toBe(uploads);
    expect(deleted.slice(deletes)).toEqual([old.file_token]);
    const config = () =>
      app.handle(
        new Request(
          `http://test.local/api/forms/${f.form.publicId}/editor-config?responseId=${f.response.id}&action=draft`,
          { headers: { Authorization: `Bearer ${f.bearer}` } }
        )
      );
    const warning = z.object({
      bridge: z.object({
        uploadPoc: z.object({ cleanupWarning: z.string().min(1) }),
      }),
    });
    const editorResponse12 = await config();
    expect(editorResponse12.status).toBe(200);
    const editorResponse13 = await config();
    const before = warning.parse(await editorResponse13.json()).bridge.uploadPoc
      .cleanupWarning;
    await resume(f);
    deleteFails = false;
    deleteMalformed = false;
    const operationOutcome14 = await poll(f, await send(f, {}));
    expect(operationOutcome14.status).toBe("completed");
    expect(deleted.length).toBe(deletes + 1);
    const editorResponse15 = await config();
    expect(
      warning.parse(await editorResponse15.json()).bridge.uploadPoc
        .cleanupWarning
    ).toBe(before);
    const publicResponse16 = await fetch(old.file_link);
    expect(publicResponse16.status).toBe(mode === "failed" ? 200 : 404);
    const exported = await app.handle(
      new Request(
        `http://test.local/api/responses/${f.response.id}/draft/xlsx`,
        { headers: { Authorization: `Bearer ${f.bearer}` } }
      )
    );
    expect(exported.status).toBe(200);
    expect(
      readSpreadsheetWorkbook(
        new Uint8Array(await exported.arrayBuffer())
      ).cells.get("B3")?.value ?? null
    ).toBeNull();
    expect(deleted.length).toBe(deletes + 1);
  }
);

test("metadata refetch rejects redirects and actual oversized or mismatched bytes before any upload", async () => {
  for (const mode of ["redirect", "oversized", "wrong-size"] as const) {
    const f = await fixture();
    const operationOutcome17 = await poll(
      f,
      await send(f, { folio_proof: file() })
    );
    expect(operationOutcome17.status).toBe("completed");
    const canonical = await draft(f);
    await resume(f);
    snapshots.set(
      f.documentKey,
      replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B1", "2571")
    );
    const uploads = received.length;
    const deletes = deleted.length;
    const gets = publicGets.length;
    originalReadMode = mode;
    const operationOutcome18 = await poll(f, await send(f, {}));
    expect(operationOutcome18.status).toBe("failed");
    expect(await draft(f)).toEqual(canonical);
    expect(received.length).toBe(uploads);
    expect(publicGets.slice(gets)).toEqual([
      new URL(attachmentSchema.parse(canonical.proof).file_link).pathname,
    ]);
    expect(deleted.length).toBe(deletes);
    expect(fixtureValue(originalReads.at(-1))).toMatchObject({
      authorization: null,
      cookie: null,
    });
  }
  originalReadMode = "ok";
});

test.each([0, 10_000_000])(
  "metadata refetch preserves exactly %i original bytes",
  async (size) => {
    const f = await fixture();
    const bytes = new Uint8Array(size);
    if (size) {
      bytes[0] = 255;
      bytes[size - 1] = 7;
    }
    const operationOutcome19 = await poll(
      f,
      await send(f, { folio_proof: file(bytes, "boundary.BIN") })
    );
    expect(operationOutcome19.status).toBe("completed");
    const canonicalData20 = await draft(f);
    const old = attachmentSchema.parse(canonicalData20.proof);
    await resume(f);
    snapshots.set(
      f.documentKey,
      replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B1", "2571")
    );
    const cleanup = Promise.withResolvers<undefined>();
    deleteSettlements.set(old.file_token, cleanup);
    const operationOutcome21 = await poll(f, await send(f, {}));
    expect(operationOutcome21.status).toBe("completed");
    await cleanup.promise;
    expect(fixtureValue(received.at(-1)).bytes).toEqual(bytes);
    const canonicalData22 = await draft(f);
    expect(attachmentSchema.parse(canonicalData22.proof)).toMatchObject({
      original_name: "boundary.BIN",
      size_bytes: size,
    });
  }
);

test("a later original-fetch validation failure prevents every planned replacement upload", async () => {
  const f = await fixture();
  const operationOutcome23 = await poll(
    f,
    await send(f, {
      folio_other: file(new Uint8Array([3, 4, 5]), "other"),
      folio_proof: file(),
    })
  );
  expect(operationOutcome23.status).toBe("completed");
  const canonical = await draft(f);
  await resume(f);
  snapshots.set(
    f.documentKey,
    replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B1", "2571")
  );
  originalReadMode = "wrong-size";
  const uploads = received.length;
  const deletes = deleted.length;
  const authentication = logins;
  const operationOutcome24 = await poll(
    f,
    await send(f, { folio_proof: file(new Uint8Array([8]), "pending") })
  );
  expect(operationOutcome24.status).toBe("failed");
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(logins).toBe(authentication);
  expect(await draft(f)).toEqual(canonical);
  originalReadMode = "ok";
});

test("replacement wins over metadata refetch and invalid removal plans cannot write ECM", async () => {
  const f = await fixture();
  const operationOutcome25 = await poll(
    f,
    await send(f, { folio_proof: file() })
  );
  expect(operationOutcome25.status).toBe("completed");
  await resume(f);
  snapshots.set(
    f.documentKey,
    replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B2", "DOC.44")
  );
  const reads = originalReads.length;
  const operationOutcome26 = await poll(
    f,
    await send(f, {
      folio_proof: file(new Uint8Array([8, 9]), "replacement"),
    })
  );
  expect(operationOutcome26.status).toBe("completed");
  expect(originalReads.length).toBe(reads);
  expect([...fixtureValue(received.at(-1)).bytes]).toEqual([8, 9]);
  const canonicalData27 = await draft(f);
  expect(attachmentSchema.parse(canonicalData27.proof).original_name).toBe(
    "replacement"
  );
  await resume(f);
  const uploads = received.length;
  const deletes = deleted.length;
  for (const attachmentRemovals of [
    [{ bindingId: "folio_proof", rowIndex: 0 }],
    [{ bindingId: "foreign", rowIndex: null }],
    [
      { bindingId: "folio_proof", rowIndex: null },
      { bindingId: "folio_proof", rowIndex: null },
    ],
  ]) {
    const rejected = await send(f, {}, "draft", crypto.randomUUID(), {
      attachmentRemovals,
    });
    expect(rejected.status).toBe(400);
  }
  const conflict = await send(
    f,
    { folio_proof: file() },
    "draft",
    crypto.randomUUID(),
    {
      attachmentRemovals: [{ bindingId: "folio_proof", rowIndex: null }],
    }
  );
  expect(conflict.status).toBe(400);
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
});

test("metadata refetch never sends requests to an unconfigured public file origin", async () => {
  const f = await fixture();
  customLink = `${provider.url.origin.replace("127.0.0.1", "localhost")}/files/foreign-origin`;
  const operationOutcome28 = await poll(
    f,
    await send(f, { folio_proof: file() })
  );
  expect(operationOutcome28.status).toBe("completed");
  const canonical = await draft(f);
  await resume(f);
  customLink = null;
  snapshots.set(
    f.documentKey,
    replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B2", "DOC.45")
  );
  const reads = originalReads.length;
  const uploads = received.length;
  const operationOutcome29 = await poll(f, await send(f, {}));
  expect(operationOutcome29.status).toBe("failed");
  expect(originalReads.length).toBe(reads);
  expect(received.length).toBe(uploads);
  expect(await draft(f)).toEqual(canonical);
});

test("Draft replacement preserves globally shared and immutable historical references", async () => {
  for (const protection of ["shared", "history"] as const) {
    const f = await fixture();
    const operationOutcome30 = await poll(
      f,
      await send(f, { folio_proof: file() })
    );
    expect(operationOutcome30.status).toBe("completed");
    const canonical = await draft(f);
    const old = attachmentSchema.parse(canonical.proof);
    const version = await prisma.ecmAttachmentVersion.findUniqueOrThrow({
      where: { fileToken: old.file_token },
    });
    const protectedSnapshot = `protected-${crypto.randomUUID()}`;
    if (protection === "shared") {
      const other = await fixture();
      await prisma.ecmAttachmentReference.create({
        data: {
          responseId: other.response.id,
          snapshotId: protectedSnapshot,
          versionId: version.id,
        },
      });
    } else {
      const saved = await prisma.response.findUniqueOrThrow({
        where: { id: f.response.id },
      });
      await prisma.submission.create({
        data: {
          data: jsonValue(canonical),
          documentKey: protectedSnapshot,
          formId: f.form.id,
          objectKey: fixtureValue(saved.draftObjectKey),
          responseId: f.response.id,
          userId: f.identity.id,
        },
      });
      await prisma.ecmAttachmentReference.create({
        data: {
          responseId: f.response.id,
          snapshotId: protectedSnapshot,
          versionId: version.id,
        },
      });
    }
    await resume(f);
    const deletes = deleted.length;
    const operationOutcome31 = await poll(
      f,
      await send(f, { folio_proof: file(new Uint8Array([5]), "new") })
    );
    expect(operationOutcome31.status).toBe("completed");
    expect(deleted.slice(deletes)).not.toContain(old.file_token);
    const publicResponse32 = await fetch(old.file_link);
    expect([...new Uint8Array(await publicResponse32.arrayBuffer())]).toEqual([
      0, 255, 7, 1,
    ]);
    expect(
      await prisma.ecmAttachmentReference.findUnique({
        where: {
          versionId_snapshotId: {
            snapshotId: protectedSnapshot,
            versionId: version.id,
          },
        },
      })
    ).not.toBeNull();
  }
});

test("implicit row saves reconcile canonical references without ECM writes before later replacement", async () => {
  const f = await fixture({ table: true });
  const operationOutcome33 = await poll(
    f,
    await send(f, { folio_proof: file() })
  );
  expect(operationOutcome33.status).toBe("completed");
  const canonicalData34 = await draft(f);
  const old = attachmentSchema.parse(canonicalData34.proof);
  await resume(f);
  const previousKey = f.documentKey;
  const uploads = received.length;
  const deletes = deleted.length;
  const authentication = logins;
  const operationOutcome35 = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      rowChange: { action: "insert", index: 2 },
    })
  );
  expect(operationOutcome35.status).toBe("completed");
  const canonicalData36 = await draft(f);
  expect(canonicalData36.proof).toEqual(old);
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(logins).toBe(authentication);
  const saved = await prisma.response.findUniqueOrThrow({
    where: { id: f.response.id },
  });
  const version = await prisma.ecmAttachmentVersion.findUniqueOrThrow({
    where: { fileToken: old.file_token },
  });
  expect(
    await prisma.ecmAttachmentReference.findMany({
      where: { responseId: f.response.id, versionId: version.id },
    })
  ).toEqual([
    {
      responseId: f.response.id,
      snapshotId: fixtureValue(saved.draftDocumentKey),
      versionId: version.id,
    },
  ]);
  expect(saved.draftDocumentKey).not.toBe(previousKey);
  await resume(f);
  const cleanup = Promise.withResolvers<undefined>();
  deleteSettlements.set(old.file_token, cleanup);
  const operationOutcome37 = await poll(
    f,
    await send(f, { folio_proof: file(new Uint8Array([3]), "after-row") })
  );
  expect(operationOutcome37.status).toBe("completed");
  await cleanup.promise;
  expect(deleted.slice(deletes)).toContain(old.file_token);
});

test("internal project save preserves files and canonical references while metadata upload waits for explicit Save", async () => {
  const f = await fixture({ project: true });
  const operationOutcome38 = await poll(
    f,
    await send(f, { folio_proof: file() })
  );
  expect(operationOutcome38.status).toBe("completed");
  const canonicalData39 = await draft(f);
  const old = attachmentSchema.parse(canonicalData39.proof);
  await resume(f);
  const session = await prisma.pdmsProjectCatalogSession.create({
    data: {
      actorId: f.identity.id,
      authSessionId: f.authSessionId,
      documentKey: f.documentKey,
      expiresAt: new Date(Date.now() + 600_000),
      formId: f.form.id,
      leaseId: f.lease.id,
      names: ["โครงการ ก"],
      openingId: crypto.randomUUID(),
      status: "ready",
      targetId: f.response.id,
      targetType: "response",
    },
  });
  snapshots.set(
    f.documentKey,
    replaceCell(fixtureValue(snapshots.get(f.documentKey)), "B1", "2571")
  );
  const uploads = received.length;
  const deletes = deleted.length;
  const authentication = logins;
  const batches = await prisma.ecmAttachmentBatch.count({
    where: { responseId: f.response.id },
  });
  const result = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      pdmsCatalogSessionId: session.id,
      pdmsSelection: {
        bindingId: "folio_notes1",
        name: "โครงการ ก",
        sessionId: session.id,
      },
    })
  );
  expect(result.status).toBe("completed");
  expect(await draft(f)).toMatchObject({
    fiscal_year: "2571",
    notes1: "โครงการ ก",
    proof: old,
  });
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(logins).toBe(authentication);
  expect(
    await prisma.ecmAttachmentBatch.count({
      where: { responseId: f.response.id },
    })
  ).toBe(batches);
  await resume(f);
  const version = await prisma.ecmAttachmentVersion.findUniqueOrThrow({
    where: { fileToken: old.file_token },
  });
  expect(
    await prisma.ecmAttachmentReference.findMany({
      where: { responseId: f.response.id, versionId: version.id },
    })
  ).toEqual([
    {
      responseId: f.response.id,
      snapshotId: f.documentKey,
      versionId: version.id,
    },
  ]);
  const cleanup = Promise.withResolvers<undefined>();
  deleteSettlements.set(old.file_token, cleanup);
  const operationOutcome40 = await poll(f, await send(f, {}));
  expect(operationOutcome40.status).toBe("completed");
  await cleanup.promise;
  expect(fixtureValue(received.at(-1)).year).toBe("2571");
  expect([...fixtureValue(received.at(-1)).bytes]).toEqual([0, 255, 7, 1]);
});

test("an in-flight DELETE fences stale canonical receipt reference acquisition through HTTP", async () => {
  const f = await fixture();
  const operationOutcome41 = await poll(
    f,
    await send(f, { folio_proof: file() })
  );
  expect(operationOutcome41.status).toBe("completed");
  const oldData = await draft(f);
  const old = attachmentSchema.parse(oldData.proof);
  await resume(f);
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const settled = Promise.withResolvers<undefined>();
  deleteSettlements.set(old.file_token, settled);
  deleteBarrier = {
    enter: () => entered.resolve(),
    release: released.promise,
  };
  try {
    const operationOutcome42 = await poll(
      f,
      await send(f, {}, "draft", crypto.randomUUID(), {
        attachmentRemovals: [{ bindingId: "folio_proof", rowIndex: null }],
      })
    );
    expect(operationOutcome42.status).toBe("completed");
    await entered.promise;
    await resume(f);
    const cleared = await draft(f);
    // Model a stale persisted receipt; only the real application may acquire its reference.
    await prisma.response.update({
      data: { draftData: jsonValue(oldData) },
      where: { id: f.response.id },
    });
    const uploads = received.length;
    const operationOutcome43 = await poll(f, await send(f, {}));
    expect(operationOutcome43.status).toBe("failed");
    expect(received.length).toBe(uploads);
    const version = await prisma.ecmAttachmentVersion.findUniqueOrThrow({
      where: { fileToken: old.file_token },
    });
    expect(version.state).toBe("deleting");
    expect(
      await prisma.ecmAttachmentReference.count({
        where: { versionId: version.id },
      })
    ).toBe(0);
    await prisma.response.update({
      data: { draftData: jsonValue(cleared) },
      where: { id: f.response.id },
    });
  } finally {
    deleteBarrier = null;
    released.resolve();
    await settled.promise;
  }
});

test("workspace and immutable Correction transitions retain canonical files and reconcile references without ECM writes", async () => {
  const f = await fixture({ admin: true });
  const operationOutcome44 = await poll(
    f,
    await send(f, { folio_proof: file() }, "submit")
  );
  expect(operationOutcome44.status).toBe("completed");
  const submission = await prisma.submission.findFirstOrThrow({
    where: { responseId: f.response.id },
  });
  const proof = attachmentSchema.parse(
    z.record(z.string(), z.unknown()).parse(submission.data).proof
  );
  const uploads = received.length;
  const deletes = deleted.length;
  const authentication = logins;
  const openWorkspace = async () => {
    const response = await app.handle(
      new Request(
        `http://test.local/api/admin/results/${f.response.id}/correction/editor-config`,
        { headers: { Authorization: `Bearer ${f.bearer}` } }
      )
    );
    expect(response.status).toBe(200);
    const config = z
      .object({
        bridge: z.object({
          capabilities: z.record(z.string(), z.string()),
          documentKey: z.string(),
          uploadPoc: z.object({ documentKey: z.string() }),
        }),
        config: z.object({ document: z.object({ key: z.string() }) }),
      })
      .parse(await response.json());
    const workspace = await prisma.editorLease.findUniqueOrThrow({
      where: {
        targetType_targetId: {
          targetId: f.response.id,
          targetType: "correction",
        },
      },
    });
    nativeSnapshotKeys.set(
      config.config.document.key,
      config.bridge.documentKey
    );
    snapshots.set(
      config.bridge.documentKey,
      replaceCell(
        await readObject(fixtureValue(workspace.workspaceObjectKey)),
        "B5",
        "workspace note"
      )
    );
    return config.bridge;
  };
  let bridge = await openWorkspace();
  const workspaceSave = await poll(
    f,
    await app.handle(
      new Request(
        `http://test.local/api/admin/results/${f.response.id}/correction/workspace`,
        {
          body: JSON.stringify({
            data: {},
            documentKey: bridge.documentKey,
          }),
          headers: {
            Authorization: `Bearer ${f.bearer}`,
            "Content-Type": "application/json",
            "X-Editor-Capability": fixtureValue(
              bridge.capabilities["save-correction-workspace"]
            ),
          },
          method: "POST",
        }
      )
    )
  );
  expect(workspaceSave.status).toBe("completed");
  const version = await prisma.ecmAttachmentVersion.findUniqueOrThrow({
    where: { fileToken: proof.file_token },
  });
  expect(
    await prisma.ecmAttachmentReference.count({
      where: { versionId: version.id },
    })
  ).toBe(2);
  bridge = await openWorkspace();
  const correctionSave = await poll(
    f,
    await app.handle(
      new Request(
        `http://test.local/api/admin/results/${f.response.id}/correction`,
        {
          body: JSON.stringify({
            data: {},
            documentKey: bridge.documentKey,
            reason: "Correct ordinary note only",
          }),
          headers: {
            Authorization: `Bearer ${f.bearer}`,
            "Content-Type": "application/json",
            "X-Editor-Capability": fixtureValue(
              bridge.capabilities["save-correction"]
            ),
          },
          method: "POST",
        }
      )
    )
  );
  expect(correctionSave.status).toBe("completed");
  const correction = await prisma.correction.findFirstOrThrow({
    where: { submissionId: submission.id },
  });
  expect(correction.data).toMatchObject({ notes1: "workspace note", proof });
  const savedSnapshot45 = await prisma.submission.findUniqueOrThrow({
    where: { id: submission.id },
  });
  expect(savedSnapshot45.data).toEqual(submission.data);
  const snapshotReferences46 = await prisma.ecmAttachmentReference.findMany({
    where: { versionId: version.id },
  });
  expect(
    snapshotReferences46.map((reference) => reference.snapshotId).toSorted()
  ).toEqual([submission.documentKey, correction.documentKey].toSorted());
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(logins).toBe(authentication);
});

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
  await resume(f);
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

test("Results exposes trusted unknown-upload follow-up without allowing an Admin note to release the hold", async () => {
  const f = await fixture();
  const admin = await fixture({ admin: true });
  nextMode = "malformed";
  const start = received.length;
  const outcome = await poll(f, await send(f, { folio_proof: file() }));
  expect(outcome.status).toBe("failed");
  expect(received.length - start).toBe(1);
  const request = (bearer: string) =>
    app.handle(
      new Request("http://test.local/api/admin/results/attachment-follow-up", {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
  const ownerFollowUp = await request(f.bearer);
  expect(ownerFollowUp.status).toBe(403);
  const response = await request(admin.bearer);
  expect(response.status).toBe(200);
  const payload = z
    .object({
      followUps: z.array(
        z.object({
          operationId: z.string(),
          responseId: z.string(),
          state: z.string(),
          versions: z.array(
            z.object({
              bindingId: z.string(),
              category: z.string(),
              filename: z.string(),
              fiscalYear: z.string(),
              rowIndex: z.number().nullable(),
              state: z.string(),
            })
          ),
        })
      ),
    })
    .parse(await response.json());
  const followUp = payload.followUps.find(
    (entry) => entry.operationId === outcome.operationId
  );
  expect(followUp).toMatchObject({
    responseId: f.response.id,
    state: "cleanup-pending",
    versions: [
      {
        bindingId: "folio_proof",
        category: "หลักฐาน",
        filename: fixtureValue(received[start]).name,
        fiscalYear: "2570",
        rowIndex: null,
        state: "unknown",
      },
    ],
  });
  const attemptedRelease = await app.handle(
    new Request(
      `http://test.local/api/admin/results/attachment-follow-up/${outcome.operationId}/settle`,
      {
        body: JSON.stringify({
          acceptRisk: true,
          evidence: "PM found no file",
        }),
        headers: {
          Authorization: `Bearer ${admin.bearer}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    )
  );
  expect(attemptedRelease.status).toBe(409);
  const blocked = await send(f, { folio_proof: file() });
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toMatchObject({
    error: "attachment_outcome_unresolved",
    message: expect.stringContaining("กรุณาติดต่อผู้ดูแล"),
  });
  const status = await app.handle(
    new Request(
      `http://test.local/api/responses/${f.response.id}/attachment-status`,
      { headers: { Authorization: `Bearer ${f.bearer}` } }
    )
  );
  expect(status.status).toBe(200);
  const durable = z
    .object({
      cleanupWarning: z.string().nullable(),
      mutationNotice: z.string(),
    })
    .parse(await status.json());
  expect(durable.mutationNotice).toContain("proof");
  expect(durable.mutationNotice).toContain("อาจมีไฟล์ที่ ECM");
  expect(durable.mutationNotice).toContain("ห้ามส่งไฟล์ซ้ำ");
  expect(durable.cleanupWarning).toBeNull();
  const inspection = await app.handle(
    new Request(
      `http://test.local/api/responses/${f.response.id}/draft/viewer-config`,
      { headers: { Authorization: `Bearer ${f.bearer}` } }
    )
  );
  expect(inspection.status).toBe(200);
  const view = z
    .object({
      config: z.object({
        document: z.object({
          permissions: z.object({
            download: z.literal(false),
            edit: z.literal(false),
          }),
          url: z.string(),
        }),
        editorConfig: z.object({ mode: z.literal("view") }),
      }),
    })
    .parse(await inspection.json());
  const document = await app.handle(
    new Request(view.config.document.url, {
      headers: {
        Authorization: createOnlyOfficeAuthorization({
          url: view.config.document.url,
        }),
      },
    })
  );
  expect(document.status).toBe(200);
  const canonicalBytes: Uint8Array = new Uint8Array(
    await document.arrayBuffer()
  );
  expect(canonicalBytes).toEqual(nativeTemplate);
  expect(received.length - start).toBe(1);
  expect(await draft(f)).toEqual({});
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

test("Admin fences the original sender and deletes a late canceled receipt once, with durable verified evidence", async () => {
  const f = await fixture();
  const admin = await fixture({ admin: true });
  const competingAdmin = await fixture({ admin: true });
  const viewer = await fixture({ viewer: true });
  const uploads = received.length;
  const deletes = deleted.length;
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  receiptBarrier = {
    enter: () => entered.resolve(),
    release: released.promise,
  };
  const accepted = await send(f, { folio_other: file(), folio_proof: file() });
  const original = envelopeSchema.parse(await accepted.clone().json());
  try {
    await entered.promise;
    const sending = await followUpFor(admin, original.operationId);
    expect(sending).toMatchObject({
      canFence: true,
      mutationHeld: true,
      state: "sending",
    });
    expect(
      sending.versions.filter((version) => version.state === "started")
    ).toHaveLength(1);
    const generation = fixtureValue(sending.generation);
    const viewerCancel = await operatorAction(
      viewer,
      original.operationId,
      "cancel",
      { generation }
    );
    expect(viewerCancel.status).toBe(403);
    const ownerCancel = await operatorAction(
      f,
      original.operationId,
      "cancel",
      { generation }
    );
    expect(ownerCancel.status).toBe(403);
    const adminCancel = await operatorAction(
      admin,
      original.operationId,
      "cancel",
      { generation }
    );
    expect(adminCancel.status).toBe(200);
    const competingCancel = await operatorAction(
      competingAdmin,
      original.operationId,
      "cancel",
      { generation }
    );
    expect(competingCancel.status).toBe(409);
    const fenced = await followUpFor(viewer, original.operationId);
    expect(fenced).toMatchObject({
      canFence: false,
      mutationHeld: true,
      state: "cleanup-pending",
    });
    expect(
      fenced.versions.filter((version) => version.state === "unknown")
    ).toHaveLength(1);
    expect(
      fenced.versions.filter((version) => version.state === "canceled")
    ).toHaveLength(1);
    expect(received.length).toBe(uploads + 1);
    expect(deleted.length).toBe(deletes);
    expect(await draft(f)).toEqual({});
    released.resolve();
    const canceledOutcome = await poll(f, accepted);
    expect(canceledOutcome.status).toBe("failed");
    const late = await followUpFor(admin, original.operationId, (entry) =>
      entry.versions.some((version) => version.state === "received")
    );
    const version = fixtureValue(
      late.versions.find((entry) => entry.state === "received")
    );
    expect(version).toMatchObject({
      canDelete: true,
      cleanupState: "pending",
      deleteAttemptedAt: null,
    });
    expect(version.requestSettledAt).not.toBeNull();
    const receivedFile = fixtureValue(received[uploads]);
    expect(JSON.stringify(late)).not.toContain(receivedFile.token);
    expect(JSON.stringify(late)).not.toContain("scalar-test-service-token");
    const trusted = { generation: version.generation, versionId: version.id };
    const viewerSettlement = await operatorAction(
      viewer,
      original.operationId,
      "settle",
      trusted
    );
    expect(viewerSettlement.status).toBe(403);
    const arbitraryToken = await operatorAction(
      admin,
      original.operationId,
      "settle",
      {
        ...trusted,
        token: receivedFile.token,
      }
    );
    expect(arbitraryToken.status).toBe(409);
    const staleGeneration = await operatorAction(
      admin,
      original.operationId,
      "settle",
      {
        ...trusted,
        generation: version.generation - 1,
      }
    );
    expect(staleGeneration.status).toBe(409);
    const deleting = Promise.withResolvers<undefined>();
    const deletedResponse = Promise.withResolvers<undefined>();
    deleteBarrier = {
      enter: () => deleting.resolve(),
      release: deletedResponse.promise,
    };
    const first = operatorAction(
      admin,
      original.operationId,
      "settle",
      trusted
    );
    try {
      await deleting.promise;
      const competingSettlement = await operatorAction(
        competingAdmin,
        original.operationId,
        "settle",
        trusted
      );
      expect(competingSettlement.status).toBe(409);
      const heldSave = await send(f, { folio_proof: file() });
      expect(heldSave.status).toBe(409);
      expect(received.length).toBe(uploads + 1);
      expect(await draft(f)).toEqual({});
    } finally {
      deletedResponse.resolve();
    }
    const firstDeletion = await first;
    expect(firstDeletion.status).toBe(200);
    const settled = await followUpFor(admin, original.operationId);
    expect(settled).toMatchObject({ mutationHeld: false, state: "canceled" });
    expect(
      settled.versions.find((entry) => entry.id === version.id)
    ).toMatchObject({
      cleanupState: "deleted",
      confirmedBy: admin.identity.id,
      evidence: {
        deleteProof: "verified-delete-response",
        noReferences: true,
        source: "verified-upload-receipt",
      },
      state: "deleted",
    });
    expect(deleted.length).toBe(deletes + 1);
    const repeatedDeletion = await operatorAction(
      admin,
      original.operationId,
      "settle",
      trusted
    );
    expect(repeatedDeletion.status).toBe(409);
    expect(deleted.length).toBe(deletes + 1);
    expect(await draft(f)).toEqual({});
    const audit = await app.handle(
      new Request(
        `http://test.local/api/admin/audit-events?target=${f.response.id}&action=ecm_attachment_cleanup_confirmed`,
        { headers: { Authorization: `Bearer ${admin.bearer}` } }
      )
    );
    expect(audit.status).toBe(200);
    expect(await audit.json()).toMatchObject({
      events: [
        {
          actorId: admin.identity.id,
          outcome: "success",
          safeMetadata: {
            operationId: original.operationId,
            proof: "verified-delete-response",
            versionId: version.id,
          },
        },
      ],
    });
    const next = await poll(f, await send(f, { folio_proof: file() }));
    expect(next.status).toBe("completed");
    expect(fixtureValue(received[uploads + 1]).name).not.toBe(
      receivedFile.name
    );
  } finally {
    released.resolve();
    receiptBarrier = null;
    deleteBarrier = null;
  }
});

test("unknown DELETE after authorized first cleanup remains held and is never retried or released by a note", async () => {
  const f = await fixture();
  const admin = await fixture({ admin: true });
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  receiptBarrier = {
    enter: () => entered.resolve(),
    release: released.promise,
  };
  const accepted = await send(f, { folio_proof: file() });
  const original = envelopeSchema.parse(await accepted.clone().json());
  try {
    await entered.promise;
    const active = await followUpFor(admin, original.operationId);
    const cancel = await operatorAction(admin, original.operationId, "cancel", {
      generation: active.generation,
    });
    expect(cancel.status).toBe(200);
    released.resolve();
    const late = await followUpFor(admin, original.operationId, (entry) =>
      entry.versions.some((version) => version.canDelete)
    );
    const version = fixtureValue(
      late.versions.find((entry) => entry.canDelete)
    );
    const before = deleted.length;
    deleteMalformed = true;
    const firstDeletion = await operatorAction(
      admin,
      original.operationId,
      "settle",
      {
        generation: version.generation,
        versionId: version.id,
      }
    );
    expect(firstDeletion.status).toBe(503);
    deleteMalformed = false;
    const unknown = await followUpFor(admin, original.operationId);
    expect(unknown).toMatchObject({
      mutationHeld: true,
      state: "cleanup-pending",
    });
    expect(unknown.versions[0]).toMatchObject({
      canDelete: false,
      cleanupState: "unknown",
      state: "deleting",
    });
    const repeatedDeletion = await operatorAction(
      admin,
      original.operationId,
      "settle",
      {
        generation: fixtureValue(unknown.versions[0]).generation,
        versionId: version.id,
      }
    );
    expect(repeatedDeletion.status).toBe(409);
    const emptySearch = await operatorAction(
      admin,
      original.operationId,
      "settle",
      {
        acceptRisk: true,
        evidence: "waited; PM search returned empty",
      }
    );
    expect(emptySearch.status).toBe(409);
    expect(deleted.length).toBe(before + 1);
    const heldSave = await send(f, { folio_proof: file() });
    expect(heldSave.status).toBe(409);
    expect(await draft(f)).toEqual({});
  } finally {
    released.resolve();
    receiptBarrier = null;
    deleteMalformed = false;
  }
});

test("Admin cancellation before dispatch fences an auth-waiting sender without treating a timeout as proof", async () => {
  const previous = await fixture();
  const f = await fixture();
  const admin = await fixture({ admin: true });
  // A real rejected write invalidates the shared auth generation; do not seed the request ledger.
  nextMode = "unauthorized";
  const rejectedWrite = await poll(
    previous,
    await send(previous, { folio_proof: file() })
  );
  expect(rejectedWrite.status).toBe("failed");
  const uploads = received.length;
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  loginBarrier = { enter: () => entered.resolve(), release: released.promise };
  const accepted = await send(f, { folio_proof: file() });
  const original = envelopeSchema.parse(await accepted.clone().json());
  try {
    await entered.promise;
    const waiting = await followUpFor(admin, original.operationId);
    expect(waiting).toMatchObject({ canFence: true, state: "prepared" });
    expect(waiting.versions).toHaveLength(1);
    expect(waiting.versions[0]).toMatchObject({
      requestSettledAt: null,
      state: "prepared",
    });
    const canceledBeforeDispatch = await operatorAction(
      admin,
      original.operationId,
      "cancel",
      {
        generation: waiting.generation,
      }
    );
    expect(canceledBeforeDispatch.status).toBe(200);
    const held = await app.handle(
      new Request(
        `http://test.local/api/responses/${f.response.id}/attachment-status`,
        { headers: { Authorization: `Bearer ${f.bearer}` } }
      )
    );
    expect(held.status).toBe(200);
    expect(await held.json()).toMatchObject({
      cleanupWarning: null,
      mutationNotice: null,
    });
    expect(received.length).toBe(uploads);
    released.resolve();
    const originalOutcome = await poll(f, accepted);
    expect(originalOutcome.status).toBe("failed");
    const nextOutcome = await poll(f, await send(f, { folio_proof: file() }));
    expect(nextOutcome.status).toBe("completed");
    expect(received.length).toBe(uploads + 1);
  } finally {
    released.resolve();
    loginBarrier = null;
    nextMode = "ok";
  }
});

test("Results retains trusted cleanup tracking after real Response deletion without restoring a normal result row", async () => {
  const f = await fixture();
  const admin = await fixture({ admin: true });
  const savedOutcome = await poll(f, await send(f, { folio_proof: file() }));
  expect(savedOutcome.status).toBe("completed");
  await resume(f);
  const savedDraft = await draft(f);
  const proof = attachmentSchema.parse(savedDraft.proof);
  deleteFails = true;
  const replacement = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      attachmentRemovals: [{ bindingId: "folio_proof", rowIndex: null }],
    })
  );
  expect(replacement.status).toBe("completed");
  const pending = await followUpFor(admin, replacement.operationId, (entry) =>
    entry.versions.some((version) => version.cleanupState === "unknown")
  );
  deleteFails = false;
  expect(pending).toMatchObject({
    mutationHeld: false,
    responseDeleted: false,
    state: "committed",
  });
  const release = await app.handle(
    new Request(`http://test.local/api/editor-leases/${f.lease.id}`, {
      headers: { Authorization: `Bearer ${f.bearer}` },
      method: "DELETE",
    })
  );
  expect(release.status).toBe(200);
  const removed = await app.handle(
    new Request(`http://test.local/api/admin/responses/${f.response.id}`, {
      body: JSON.stringify({ confirm: true }),
      headers: {
        Authorization: `Bearer ${admin.bearer}`,
        "Content-Type": "application/json",
      },
      method: "DELETE",
    })
  );
  expect(removed.status).toBe(200);
  const retained = await followUpFor(admin, replacement.operationId);
  expect(retained).toMatchObject({
    mutationHeld: false,
    responseDeleted: true,
    responseId: f.response.id,
  });
  expect(retained.versions).toEqual(pending.versions);
  const list = await app.handle(
    new Request(`http://test.local/api/admin/results?form=${f.form.publicId}`, {
      headers: { Authorization: `Bearer ${admin.bearer}` },
    })
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toMatchObject({ results: [] });
  const detail = await app.handle(
    new Request(`http://test.local/api/admin/results/${f.response.id}`, {
      headers: { Authorization: `Bearer ${admin.bearer}` },
    })
  );
  expect(detail.status).toBe(404);
  const publicFile = await fetch(proof.file_link);
  expect(publicFile.status).toBe(200);
  expect(new Uint8Array(await publicFile.arrayBuffer())).toEqual(
    new Uint8Array([0, 255, 7, 1])
  );
});

test("physical-row deletion retains cleanup-only follow-up and permits only an Admin first DELETE of its unreferenced version", async () => {
  const f = await fixture({ tableAttachments: true });
  const admin = await fixture({ admin: true });
  const viewer = await fixture({ viewer: true });
  const initial = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array(),
        "retired.TXT"
      ),
    })
  );
  expect(initial.status).toBe("completed");
  const before = await draft(f);
  const previous = tableRowsSchema.parse(before.rows);
  const attachment = fixtureValue(previous[0]?.proof);
  expect(attachment.row_index).toBe(2);
  await resume(f);
  const uploads = received.length;
  const deletes = deleted.length;
  const authentication = logins;
  const retired = await poll(
    f,
    await send(f, {}, "draft", crypto.randomUUID(), {
      rowChange: { action: "delete", index: 2 },
    })
  );
  expect(retired.status).toBe("completed");
  const saved = await draft(f);
  expect(saved.rows).toEqual([]);
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(logins).toBe(authentication);
  const tracking = await followUpFor(admin, retired.operationId);
  expect(tracking).toMatchObject({
    mutationHeld: false,
    responseId: f.response.id,
    state: "cleanup-only",
  });
  expect(tracking.versions).toHaveLength(1);
  const version = fixtureValue(tracking.versions[0]);
  expect(version).toMatchObject({
    bindingId: "folio_row_proof",
    canDelete: true,
    cleanupState: "pending",
    deleteAttemptedAt: null,
    referenced: false,
    rowIndex: 2,
    state: "committed",
  });
  const publicBefore = await fetch(attachment.file_link);
  expect(publicBefore.status).toBe(200);
  const publicBytes = await publicBefore.arrayBuffer();
  expect(publicBytes.byteLength).toBe(0);
  const trusted = { generation: version.generation, versionId: version.id };
  const denied = await operatorAction(
    viewer,
    retired.operationId,
    "settle",
    trusted
  );
  expect(denied.status).toBe(403);
  expect(deleted.length).toBe(deletes);
  const settled = await operatorAction(
    admin,
    retired.operationId,
    "settle",
    trusted
  );
  expect(settled.status).toBe(200);
  expect(deleted.length).toBe(deletes + 1);
  expect(received.length).toBe(uploads);
  expect(await draft(f)).toEqual(saved);
  const confirmed = await followUpFor(admin, retired.operationId);
  expect(confirmed.versions[0]).toMatchObject({
    canDelete: false,
    cleanupState: "deleted",
    confirmedBy: admin.identity.id,
    evidence: { deleteProof: "verified-delete-response" },
    rowIndex: 2,
    state: "deleted",
  });
  const publicAfter = await fetch(attachment.file_link);
  expect(publicAfter.status).toBe(404);
});
