// oxlint-disable no-await-in-loop complexity -- Exercise real isolated HTTP, PostgreSQL, storage and native Builder; poll public Operations across process boundaries.
import { afterAll, beforeAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { z } from "zod";

import { createApp } from "../../src/app";
import type { EditorCapabilityIdentity } from "../../src/auth/identity";
import { requireIdentity } from "../../src/auth/identity";
import { templateRelationshipPartPath } from "../../src/documents/package";
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
import type { SpreadsheetXmlNode } from "../../src/documents/spreadsheets/xml";
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
import { bearerFor, createCredentialFixture, signIn } from "../fixtures/http";
import { fixtureWorkbook, mutatePart } from "../spreadsheet-unit/fixture";

const fixtureValue = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error("The isolated fixture did not supply its required value");
  }
  return value;
};
const xmlElements = (
  node: SpreadsheetXmlNode,
  name: string
): SpreadsheetXmlNode[] => [
  ...(node.name.split(":").at(-1) === name ? [node] : []),
  ...node.children.flatMap((child) =>
    typeof child === "string" ? [] : xmlElements(child, name)
  ),
];

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
  fields: string[];
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
let loginRejects = false;
let nextMode:
  | "object"
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
let originalReadMode:
  | "ok"
  | "redirect"
  | "oversized"
  | "wrong-size"
  | "unauthorized"
  | "missing"
  | "viewer"
  | "broken-stream"
  | "same-size-viewer"
  | "same-size-preview"
  | "same-size-error"
  | "stalled" = "ok";
let deleteBarrier: { enter: () => void; release: Promise<void> } | null = null;
const provider = Bun.serve({
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/document/category")) {
      return Response.json([
        { id: 42, type: "Original" },
        { id: 43, type: "Moved" },
      ]);
    }
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
      if (loginRejects) {
        return Response.json(
          { data: null, msg: "fixture login refused", status: 403 },
          { status: 403 }
        );
      }
      const login = loginBarrier;
      if (login) {
        loginBarrier = null;
        login.enter();
        await login.release;
      }
      logins += 1;
      return Response.json({
        data: {
          expire: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          token: "scalar-test-service-token",
        },
        msg: "ok",
        status: 200,
      });
    }
    if (
      request.method === "GET" &&
      (url.pathname.startsWith("/files/") || url.pathname.endsWith("/file"))
    ) {
      originalReads.push({
        authorization: request.headers.get("authorization"),
        cookie: request.headers.get("cookie"),
        path: url.pathname,
      });
      if (url.pathname.endsWith("/file")) {
        expect(request.headers.get("Authorization")).toBe(
          "Bearer scalar-test-service-token"
        );
      }
      if (originalReadMode === "unauthorized") {
        return new Response(null, { status: 401 });
      }
      if (originalReadMode === "missing") {
        return new Response(null, { status: 404 });
      }
      if (originalReadMode === "viewer") {
        return new Response("<html>viewer, not original</html>");
      }
      if (originalReadMode === "stalled") {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([0]));
            },
          })
        );
      }
      if (originalReadMode === "broken-stream") {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("truncated"));
            },
          })
        );
      }
      if (originalReadMode === "redirect") {
        return Response.redirect(`${provider.url.origin}/redirect-target`, 302);
      }
      if (originalReadMode === "oversized") {
        return new Response(new Uint8Array(10_000_001));
      }
      if (originalReadMode === "wrong-size") {
        return new Response(new Uint8Array([1]));
      }
      const saved = url.pathname.endsWith("/file")
        ? [...providerFiles.values()].find(
            (entry) => entry.token === url.searchParams.get("token")
          )
        : providerFiles.get(url.pathname);
      if (saved && originalReadMode.startsWith("same-size-")) {
        const bytes = new Uint8Array(saved.bytes.length);
        bytes.set(
          new TextEncoder()
            .encode(
              originalReadMode === "same-size-viewer"
                ? "<html>viewer</html>"
                : (originalReadMode === "same-size-error"
                  ? '{"error":"denied"}'
                  : "%PDF converted preview")
            )
            .subarray(0, bytes.length)
        );
        return new Response(bytes);
      }
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
      const owned = await prisma.ecmAttachmentVersion.findFirstOrThrow({
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
        fields: [...body.keys()].toSorted(),
        name: file.name,
        number: body.get("documentNumber"),
        template: body.get("template"),
        token,
        year: body.get("documentYear"),
      });
      const intent = await prisma.ecmAttachmentVersion.findFirstOrThrow({
        where: { filename: file.name, state: "started" },
      });
      expect(intent).toMatchObject({
        ...(body.get("template") === "0"
          ? {
              category: body.get("documentCategory"),
              documentNumber: body.get("documentNumber"),
              fiscalYear: body.get("documentYear"),
            }
          : { fiscalYear: null }),
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
        data:
          nextMode === "object"
            ? { file_link: link, file_token: token }
            : [{ file_link: link, file_token: token }],
        msg: "ok",
        status: 200,
      });
    }
    return new Response(null, { status: 404 });
  },
  hostname: "127.0.0.1",
  idleTimeout: 120,
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
  cookie: string;
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
    templateMode?: boolean;
    templateYear?: boolean;
    number?: string;
    table?: boolean;
    tableAttachments?: boolean;
    tableRows?: number;
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
  loginRejects = false;
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
  const login = await signIn(app, user.email, password);
  expect(login.status).toBe(200);
  const signedIn = z
    .object({
      session: z.object({ token: z.string().optional() }).optional(),
      token: z.string().optional(),
    })
    .parse(await login.json());
  const bearer = fixtureValue(
    login.headers.get("set-auth-token")?.replace(/^Bearer\s+/iu, "") ??
      signedIn.token ??
      signedIn.session?.token
  );
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
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
          ? `<definedName name="folio_rows">'Form'!$B$10:$D$${9 + (values.tableRows ?? 4)}</definedName><definedName name="folio_columns_folio_rows">'Form'!$B$10:$D$${9 + (values.tableRows ?? 4)}</definedName><definedName name="folio_column_folio_item">'Form'!$B$10:$B$${9 + (values.tableRows ?? 4)}</definedName><definedName name="folio_column_folio_row_proof">'Form'!$C$10:$C$${9 + (values.tableRows ?? 4)}</definedName><definedName name="folio_column_folio_row_other">'Form'!$D$10:$D$${9 + (values.tableRows ?? 4)}</definedName><definedName name="_folio_upload_poc_folio_row_proof">'Form'!$C$10:$C$${9 + (values.tableRows ?? 4)}</definedName><definedName name="_folio_upload_poc_folio_row_other">'Form'!$D$10:$D$${9 + (values.tableRows ?? 4)}</definedName></definedNames>`
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
  if (values.templateMode) {
    publishedBindings = spreadsheetBindingSchema.parse({
      ...publishedBindings,
      fields: publishedBindings.fields
        .filter((field) => values.templateYear || field.key !== "fiscal_year")
        .map((field) => ({
          ...field,
          ...(field.attachment
            ? {
                attachment: {
                  category: null,
                  document_category_id: 42,
                  mode: "template",
                  storage_template_id: crypto.randomUUID(),
                  template_name:
                    field.key === "proof" ? "ก่อหนี้-4_ขยาย(45)" : "นำส่ง",
                },
              }
            : {}),
        })),
      table: publishedBindings.table
        ? {
            ...publishedBindings.table,
            columns: publishedBindings.table.columns.map((column) => ({
              ...column,
              ...(column.attachment
                ? {
                    attachment: {
                      category: null,
                      document_category_id: 42,
                      mode: "template",
                      storage_template_id: crypto.randomUUID(),
                      template_name:
                        column.key === "proof" ? "หลักฐาน-ตาราง" : "อื่น-ตาราง",
                    },
                  }
                : {}),
            })),
          }
        : null,
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
  if (values.templateMode && values.number === undefined) {
    snapshot = replaceCell(snapshot, "B2", `DOC.${id}`);
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
    cookie,
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
  extra: Record<string, unknown> = {},
  origin?: string
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
  const request = new Request(
    `${origin ?? "http://test.local"}/api/forms/${f.form.publicId}/${action}`,
    {
      body,
      headers: {
        Authorization: `Bearer ${f.bearer}`,
        "X-Editor-Capability": capability,
      },
      method: "POST",
    }
  );
  return origin ? fetch(request) : app.handle(request);
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
const poll = async (f: Fixture, accepted: Response, budgetMs = 90_000) => {
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
  const deadline = Date.now() + budgetMs;
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
interface CorrectionBridgeFixture {
  capabilities: Record<string, string>;
  documentKey: string;
  uploadPoc: { savedData: Record<string, unknown> };
}
const openCorrection = async (owner: Fixture, admin: Fixture) => {
  const opened = await app.handle(
    new Request(
      `http://test.local/api/admin/results/${owner.response.id}/correction/editor-config`,
      { headers: { Authorization: `Bearer ${admin.bearer}` } }
    )
  );
  expect(opened.status).toBe(200);
  const config = z
    .object({
      bridge: z.object({
        capabilities: z.record(z.string(), z.string()),
        documentKey: z.string(),
        uploadPoc: z.object({ savedData: z.record(z.string(), z.unknown()) }),
      }),
      config: z.object({ document: z.object({ key: z.string() }) }),
    })
    .parse(await opened.json());
  const lease = await prisma.editorLease.findUniqueOrThrow({
    where: {
      targetType_targetId: {
        targetId: owner.response.id,
        targetType: "correction",
      },
    },
  });
  nativeSnapshotKeys.set(config.config.document.key, config.bridge.documentKey);
  snapshots.set(
    config.bridge.documentKey,
    await readObject(fixtureValue(lease.workspaceObjectKey))
  );
  return config.bridge;
};

const postCorrection = (
  owner: Fixture,
  admin: Fixture,
  bridge: CorrectionBridgeFixture,
  files: Record<string, File> = {},
  input: Record<string, unknown> = {},
  workspaceOnly = false,
  credentials?: Record<string, string>
) => {
  const body = new FormData();
  body.set(
    "payload",
    JSON.stringify({
      data: {},
      documentKey: bridge.documentKey,
      ...(workspaceOnly
        ? {}
        : {
            checkpoint: crypto.randomUUID(),
            reason: "Correct supporting evidence",
            snapshotUrl: "http://office.test/cache/snapshot.xlsx",
          }),
      ...input,
    })
  );
  for (const [binding, selected] of Object.entries(files)) {
    body.set(
      `attachment:${binding.startsWith("[") ? encodeURIComponent(binding) : binding}`,
      selected
    );
  }
  return app.handle(
    new Request(
      `http://test.local/api/admin/results/${owner.response.id}/correction${workspaceOnly ? "/workspace" : ""}`,
      {
        body,
        headers: {
          ...(credentials ?? { Authorization: `Bearer ${admin.bearer}` }),
          "X-Editor-Capability": fixtureValue(
            bridge.capabilities[
              workspaceOnly ? "save-correction-workspace" : "save-correction"
            ]
          ),
        },
        method: "POST",
      }
    )
  );
};
/* oxlint-disable no-await-expression-member no-use-before-define -- Public HTTP response assertions stay inline; registered tests run after helper initialization. */
test("template scalar saves without year and replaces same provider identity without deleting current bytes", async () => {
  const owner = await fixture({ number: "กทอ.67-00-0001", templateMode: true });
  const start = received.length;
  const deletes = deleted.length;
  nextMode = "object";
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const first = attachmentSchema.parse((await draft(owner)).proof);
  expect(received[start]).toMatchObject({
    bytes: new Uint8Array([0, 255, 7, 1]),
    category: null,
    fields: ["documentFile", "template"],
    name: "กทอ.67-00-0001-ก่อหนี้-4_ขยาย(45).BIN",
    number: null,
    template: "1",
    year: null,
  });
  expect((await draft(owner)).fiscal_year).toBeUndefined();
  await resume(owner);
  expect((await poll(owner, await send(owner, {}))).status).toBe("completed");
  expect(received.length).toBe(start + 1);
  await resume(owner);
  customToken = first.file_token;
  customLink = first.file_link;
  nextMode = "object";
  expect(
    (
      await poll(
        owner,
        await send(
          owner,
          {
            folio_proof: file(new Uint8Array([9, 8]), "Replacement.BIN"),
          },
          "submit"
        )
      )
    ).status
  ).toBe("completed");
  const submission = await prisma.submission.findFirstOrThrow({
    orderBy: { createdAt: "desc" },
    where: { responseId: owner.response.id },
  });
  expect(jsonValue(submission.data)).toMatchObject({
    proof: { ...first, original_name: "Replacement.BIN", size_bytes: 2 },
  });
  expect(providerFiles.get(new URL(first.file_link).pathname)?.bytes).toEqual(
    new Uint8Array([9, 8])
  );
  expect(deleted.length).toBe(deletes);
});
/* oxlint-enable no-await-expression-member no-use-before-define */
test("Correction authenticates independent bearer and cookie credentials while preserving native capability-only requests", async () => {
  const owner = await fixture();
  const admin = await fixture({ admin: true });
  const viewer = await fixture({ viewer: true });
  for (const [actor, role] of [
    [owner, "user"],
    [admin, "admin"],
    [viewer, "viewer"],
  ] as const) {
    const session = await app.handle(
      new Request("http://test.local/api/session", {
        headers: { Authorization: `Bearer ${actor.bearer}` },
      })
    );
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { id: actor.identity.id, role },
    });
    expect(actor.cookie).not.toBe("");
  }
  const cookieOnlySession = await app.handle(
    new Request("http://test.local/api/session", {
      headers: { Cookie: viewer.cookie },
    })
  );
  expect(cookieOnlySession.status).toBe(401);
  const submitted = await poll(
    owner,
    await send(owner, { folio_proof: file() }, "submit")
  );
  expect(submitted.status).toBe("completed");
  let bridge = await openCorrection(owner, admin);
  const otherAdminBearer = await bearerFor(
    app,
    admin.identity.email,
    "Scalar-isolated-fixture-password!"
  );
  const otherAdminLogin = await signIn(
    app,
    admin.identity.email,
    "Scalar-isolated-fixture-password!"
  );
  expect(otherAdminLogin.status).toBe(200);
  const otherAdminCookie = otherAdminLogin.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  expect(otherAdminCookie).not.toBe("");
  expect(otherAdminCookie).not.toBe(admin.cookie);
  const otherSession = await app.handle(
    new Request("http://test.local/api/session", {
      headers: { Authorization: `Bearer ${otherAdminBearer}` },
    })
  );
  expect(otherSession.status).toBe(200);
  expect(await otherSession.json()).toMatchObject({
    user: { id: admin.identity.id, role: "admin" },
  });
  const uploads = received.length;
  const deletes = deleted.length;
  const denied: { credentials: Record<string, string>; status: number }[] = [
    { credentials: { Authorization: `Bearer ${viewer.bearer}` }, status: 403 },
    { credentials: { Cookie: viewer.cookie }, status: 403 },
    {
      credentials: {
        Authorization: `Bearer ${admin.bearer}`,
        Cookie: viewer.cookie,
      },
      status: 403,
    },
    { credentials: { Authorization: `Bearer ${owner.bearer}` }, status: 403 },
    { credentials: { Cookie: owner.cookie }, status: 403 },
    {
      credentials: { Authorization: `Bearer ${otherAdminBearer}` },
      status: 403,
    },
    { credentials: { Cookie: otherAdminCookie }, status: 403 },
    {
      credentials: {
        Authorization: "Bearer invalid-session",
        Cookie: admin.cookie,
      },
      status: 401,
    },
    {
      credentials: {
        Authorization: `Bearer ${admin.bearer}`,
        Cookie: admin.cookie.replaceAll(/[=][^;]*/gu, "=invalid-session"),
      },
      status: 401,
    },
  ];
  for (const attempt of denied) {
    const rejected = await postCorrection(
      owner,
      admin,
      bridge,
      {},
      {},
      true,
      attempt.credentials
    );
    expect(rejected.status).toBe(attempt.status);
  }
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(
    await prisma.correction.count({ where: { responseId: owner.response.id } })
  ).toBe(0);
  const allowed: Record<string, string>[] = [
    {},
    { Authorization: `Bearer ${admin.bearer}` },
    { Cookie: admin.cookie },
    { Authorization: `Bearer ${admin.bearer}`, Cookie: admin.cookie },
  ];
  for (const credentials of allowed) {
    const saved = await poll(
      admin,
      await postCorrection(owner, admin, bridge, {}, {}, true, credentials)
    );
    expect(saved.status).toBe("completed");
    bridge = await openCorrection(owner, admin);
  }
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  const final = await poll(
    admin,
    await postCorrection(
      owner,
      admin,
      bridge,
      { folio_proof: file(new Uint8Array([9]), "verified.bin") },
      {},
      false,
      { Authorization: `Bearer ${admin.bearer}`, Cookie: admin.cookie }
    )
  );
  expect(final.status).toBe("completed");
  expect(received.length).toBe(uploads + 1);
  const correction = await prisma.correction.findFirstOrThrow({
    where: { responseId: owner.response.id },
  });
  expect(correction.data).toMatchObject({
    proof: { original_name: "verified.bin", size_bytes: 1 },
  });
});

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
/* oxlint-disable no-await-expression-member -- These HTTP regressions assert the awaited public response at the call site. */
test("template protected destination stops a foreign owner before POST", async () => {
  const number = `FOREIGN.${crypto.randomUUID()}`;
  const owner = await fixture({ number, templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const other = await fixture({ number, templateMode: true });
  const uploads = received.length;
  expect(
    (await poll(other, await send(other, { folio_proof: file() }))).status
  ).toBe("failed");
  expect(received.length).toBe(uploads);
  expect(await draft(other)).toEqual({});
});

test("template immutable history prevents in-place overwrite before POST", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }, "submit")))
      .status
  ).toBe("completed");
  const admin = await fixture({ admin: true });
  const bridge = await openCorrection(owner, admin);
  const uploads = received.length;
  expect(
    (
      await poll(
        admin,
        await postCorrection(owner, admin, bridge, { folio_proof: file() })
      )
    ).status
  ).toBe("failed");
  expect(received.length).toBe(uploads);
});

test("template unknown overwrite retains canonical answer but reports mutable URL and never resends or deletes", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const saved = await draft(owner);
  const first = attachmentSchema.parse(saved.proof);
  await resume(owner);
  customToken = first.file_token;
  customLink = first.file_link;
  nextMode = "store-then-reject";
  const before = deleted.length;
  const checkpoint = crypto.randomUUID();
  const failed = await poll(
    owner,
    await send(
      owner,
      {
        folio_proof: file(new Uint8Array([4, 3, 2]), "New.BIN"),
      },
      "draft",
      checkpoint
    )
  );
  expect(failed.status).toBe("failed");
  expect(await draft(owner)).toEqual(saved);
  expect(providerFiles.get(new URL(first.file_link).pathname)?.bytes).toEqual(
    new Uint8Array([4, 3, 2])
  );
  expect(deleted.length).toBe(before);
  const uploads = received.length;
  expect((await recover(owner, checkpoint)).status).toBe(200);
  expect((await send(owner, { folio_proof: file() })).status).toBe(409);
  expect(received.length).toBe(uploads);
});

test("unproven provider alias receipt holds the protected owner's mutations without adopting or deleting its resource", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const saved = await draft(owner);
  const first = attachmentSchema.parse(saved.proof);
  const other = await fixture({ templateMode: true });
  customToken = first.file_token;
  customLink = first.file_link;
  const before = deleted.length;
  expect(
    (await poll(other, await send(other, { folio_proof: file() }))).status
  ).toBe("failed");
  const status = await app.handle(
    new Request(
      `http://test.local/api/responses/${owner.response.id}/attachment-status`,
      { headers: { Authorization: `Bearer ${owner.bearer}` } }
    )
  );
  expect(await status.json()).toMatchObject({
    mutationNotice: expect.stringContaining("เขียนทับ"),
  });
  const deletion = await app.handle(
    new Request(`http://test.local/api/responses/${owner.response.id}`, {
      headers: { Authorization: `Bearer ${owner.bearer}` },
      method: "DELETE",
    })
  );
  expect(deletion.status).toBe(409);
  expect(await draft(owner)).toEqual(saved);
  expect(await draft(other)).toEqual({});
  expect(deleted.length).toBe(before);
});

test("template year-only edits preserve ordinary answers without uploading unchanged attachments", async () => {
  const owner = await fixture({
    templateMode: true,
    templateYear: true,
    year: "",
  });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const saved = attachmentSchema.parse((await draft(owner)).proof);
  await resume(owner);
  snapshots.set(
    owner.documentKey,
    replaceCell(fixtureValue(snapshots.get(owner.documentKey)), "B1", "2575")
  );
  const uploads = received.length;
  const authentication = logins;
  expect((await poll(owner, await send(owner, {}))).status).toBe("completed");
  const canonical = await draft(owner);
  expect(canonical.fiscal_year).toBe("2575");
  expect(attachmentSchema.parse(canonical.proof)).toEqual(saved);
  expect(received.length).toBe(uploads);
  expect(logins).toBe(authentication);
});

test("template docs_number change reuses authenticated original without picker, then reloads and submits", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  await resume(owner);
  snapshots.set(
    owner.documentKey,
    replaceCell(fixtureValue(snapshots.get(owner.documentKey)), "B2", "CHANGED")
  );
  const uploads = received.length;
  const reads = originalReads.length;
  expect((await poll(owner, await send(owner, {}))).status).toBe("completed");
  expect(received.length).toBe(uploads + 1);
  expect(originalReads.length).toBe(reads + 1);
  expect(originalReads.at(-1)).toMatchObject({
    authorization: "Bearer scalar-test-service-token",
    cookie: null,
    path: "/api/beeecm/public/file",
  });
  expect(received.at(-1)?.bytes).toEqual(new Uint8Array([0, 255, 7, 1]));
  expect(received.at(-1)?.name).toBe("CHANGED-ก่อหนี้-4_ขยาย(45).BIN");
  await resume(owner);
  expect((await poll(owner, await send(owner, {}, "submit"))).status).toBe(
    "completed"
  );
  expect(received.length).toBe(uploads + 1);
  expect(originalReads.length).toBe(reads + 1);
});

test.each([
  ["binary.BIN", new Uint8Array([0, 255, 7, 1])],
  ["original.html", new TextEncoder().encode("<!doctype html><p>original</p>")],
  ["plain.txt", new TextEncoder().encode("ต้นฉบับ\n")],
  ["image.PNG", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
  [
    "protected.zip",
    Buffer.from(
      "UEsDBAoACQAAAGhUcV2gTZqnEAAAAAQAAAAMABwAb3JpZ2luYWwuYmluVVQJAAN0y/tqEM37anV4CwABBPUBAAAEAAAAADHQzZpxfvkmszL+oRDy49FQSwcIoE2apxAAAAAEAAAAUEsBAh4DCgAJAAAAaFRxXaBNmqcQAAAABAAAAAwAGAAAAAAAAAAAAKSBAAAAAG9yaWdpbmFsLmJpblVUBQADdMv7anV4CwABBPUBAAAEAAAAAFBLBQYAAAAAAQABAFIAAABmAAAAAAA=",
      "base64"
    ),
  ],
  ["extensionless", new Uint8Array([5, 4, 3])],
  ["empty", new Uint8Array(0)],
  ["one.bin", new Uint8Array([255])],
  ["near-maximum.bin", new Uint8Array(9_999_999)],
  ["maximum.bin", new Uint8Array(10_000_000)],
] as const)(
  "template number change preserves exact simulated original %s",
  async (name, bytes) => {
    const owner = await fixture({ templateMode: true });
    expect(
      (await poll(owner, await send(owner, { folio_proof: file(bytes, name) })))
        .status
    ).toBe("completed");
    await resume(owner);
    snapshots.set(
      owner.documentKey,
      replaceCell(
        fixtureValue(snapshots.get(owner.documentKey)),
        "B2",
        `CHANGED.${crypto.randomUUID()}`
      )
    );
    expect((await poll(owner, await send(owner, {}))).status).toBe("completed");
    expect(received.at(-1)?.bytes).toEqual(bytes);
    expect(attachmentSchema.parse((await draft(owner)).proof)).toMatchObject({
      original_name: name,
      size_bytes: bytes.byteLength,
    });
  }
);

test.each([
  "redirect",
  "oversized",
  "wrong-size",
  "unauthorized",
  "missing",
  "viewer",
  "broken-stream",
] as const)(
  "template original %s fails before upload and preserves canonical Draft",
  async (mode) => {
    const owner = await fixture({ templateMode: true });
    expect(
      (await poll(owner, await send(owner, { folio_proof: file() }))).status
    ).toBe("completed");
    const saved = await draft(owner);
    await resume(owner);
    snapshots.set(
      owner.documentKey,
      replaceCell(
        fixtureValue(snapshots.get(owner.documentKey)),
        "B2",
        `CHANGED.${crypto.randomUUID()}`
      )
    );
    const uploads = received.length;
    const gets = publicGets.length;
    originalReadMode = mode;
    expect((await poll(owner, await send(owner, {}))).status).toBe("failed");
    expect(received.length).toBe(uploads);
    expect(publicGets.slice(gets).length).toBeGreaterThan(0);
    expect(
      publicGets.slice(gets).every((path) => path === "/api/beeecm/public/file")
    ).toBe(true);
    expect(await draft(owner)).toEqual(saved);
  }
);

test("template original stalled stream expires its real transport budget before upload", async () => {
  // Native HTTP streaming uses the platform abort clock; fake timers cannot advance this transport.
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const saved = await draft(owner);
  await resume(owner);
  snapshots.set(
    owner.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(owner.documentKey)),
      "B2",
      `CHANGED.${crypto.randomUUID()}`
    )
  );
  originalReadMode = "stalled";
  const uploads = received.length;
  const started = Date.now();
  expect((await poll(owner, await send(owner, {}), 115_000)).status).toBe(
    "failed"
  );
  expect(Date.now() - started).toBeGreaterThanOrEqual(90_000);
  expect(received.length).toBe(uploads);
  expect(await draft(owner)).toEqual(saved);
}, 120_000);

test("template replacement wins over original retrieval on number change", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  await resume(owner);
  snapshots.set(
    owner.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(owner.documentKey)),
      "B2",
      `REPLACED.${crypto.randomUUID()}`
    )
  );
  const reads = originalReads.length;
  originalReadMode = "missing";
  expect(
    (
      await poll(
        owner,
        await send(owner, {
          folio_proof: file(new Uint8Array([8, 9]), "new.bin"),
        })
      )
    ).status
  ).toBe("completed");
  expect(originalReads.length).toBe(reads);
  expect(received.at(-1)?.bytes).toEqual(new Uint8Array([8, 9]));
});

test.each([
  "same-size-viewer",
  "same-size-preview",
  "same-size-error",
] as const)(
  "template digest rejects %s without rejecting legitimate HTML originals",
  async (mode) => {
    const owner = await fixture({ templateMode: true });
    const bytes = new TextEncoder().encode(
      "<!doctype html><p>legitimate original HTML content</p>"
    );
    expect(
      (
        await poll(
          owner,
          await send(owner, { folio_proof: file(bytes, "original.html") })
        )
      ).status
    ).toBe("completed");
    const saved = await draft(owner);
    await resume(owner);
    snapshots.set(
      owner.documentKey,
      replaceCell(
        fixtureValue(snapshots.get(owner.documentKey)),
        "B2",
        `CHANGED.${crypto.randomUUID()}`
      )
    );
    originalReadMode = mode;
    const uploads = received.length;
    expect((await poll(owner, await send(owner, {}))).status).toBe("failed");
    expect(received.length).toBe(uploads);
    expect(await draft(owner)).toEqual(saved);
  }
);

test("template same receipt/name/size replacement reuses current B bytes on number change", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const first = attachmentSchema.parse((await draft(owner)).proof);
  await resume(owner);
  customToken = first.file_token;
  customLink = first.file_link;
  expect(
    (
      await poll(
        owner,
        await send(owner, { folio_proof: file(new Uint8Array([8, 7, 6, 5])) })
      )
    ).status
  ).toBe("completed");
  await resume(owner);
  snapshots.set(
    owner.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(owner.documentKey)),
      "B2",
      `CHANGED.${crypto.randomUUID()}`
    )
  );
  customToken = null;
  customLink = null;
  expect((await poll(owner, await send(owner, {}))).status).toBe("completed");
  expect(received.at(-1)?.bytes).toEqual(new Uint8Array([8, 7, 6, 5]));
});

test.each([
  "account",
  "response",
  "binding",
  "token",
  "uncommitted",
  "origin",
  "missing-digest",
] as const)(
  "template original rejects %s evidence before provider GET",
  async (invalid) => {
    const owner = await fixture({ templateMode: true });
    if (invalid === "origin") {
      customLink = `${provider.url.origin.replace("127.0.0.1", "localhost")}/files/foreign`;
    }
    expect(
      (await poll(owner, await send(owner, { folio_proof: file() }))).status
    ).toBe("completed");
    const saved = await draft(owner);
    const receipt = attachmentSchema.parse(saved.proof);
    const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
      where: { fileToken: receipt.file_token, responseId: owner.response.id },
    });
    if (invalid !== "origin") {
      await prisma.ecmAttachmentVersion.update({
        data:
          invalid === "account"
            ? { accountKey: "foreign-account" }
            : invalid === "response"
              ? { responseId: crypto.randomUUID() }
              : invalid === "binding"
                ? { bindingId: "foreign-binding" }
                : invalid === "token"
                  ? { fileToken: "foreign-token" }
                  : invalid === "missing-digest"
                    ? { originalSha256: null }
                    : { state: "received" },
        where: { id: version.id },
      });
    }
    await resume(owner);
    snapshots.set(
      owner.documentKey,
      replaceCell(
        fixtureValue(snapshots.get(owner.documentKey)),
        "B2",
        `CHANGED.${crypto.randomUUID()}`
      )
    );
    const reads = originalReads.length;
    const uploads = received.length;
    expect((await poll(owner, await send(owner, {}))).status).toBe("failed");
    expect(originalReads.length).toBe(reads);
    expect(received.length).toBe(uploads);
    expect(await draft(owner)).toEqual(saved);
  }
);

test.each([0, 10_000_000])(
  "template scalar preserves %i original bytes and extensionless filename",
  async (size) => {
    const owner = await fixture({ templateMode: true });
    const bytes = new Uint8Array(size);
    if (size) {
      bytes[size - 1] = 255;
    }
    expect(
      (
        await poll(
          owner,
          await send(
            owner,
            { folio_proof: file(bytes, "extensionless") },
            "submit"
          )
        )
      ).status
    ).toBe("completed");
    expect(received.at(-1)?.bytes).toEqual(bytes);
    expect(received.at(-1)?.name.endsWith("-ก่อหนี้-4_ขยาย(45)")).toBe(true);
  }
);

test("template distinct replacement keeps B usable with persistent old-file cleanup warning", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const first = attachmentSchema.parse((await draft(owner)).proof);
  await resume(owner);
  const cleanup = Promise.withResolvers<undefined>();
  deleteSettlements.set(first.file_token, cleanup);
  deleteFails = true;
  expect(
    (
      await poll(
        owner,
        await send(owner, {
          folio_proof: file(new Uint8Array([6]), "Replacement.BIN"),
        })
      )
    ).status
  ).toBe("completed");
  await cleanup.promise;
  const second = attachmentSchema.parse((await draft(owner)).proof);
  expect(second.file_token).not.toBe(first.file_token);
  const status = () =>
    app.handle(
      new Request(
        `http://test.local/api/responses/${owner.response.id}/attachment-status`,
        { headers: { Authorization: `Bearer ${owner.bearer}` } }
      )
    );
  expect(await (await status()).json()).toMatchObject({
    cleanupWarning: expect.any(String),
    mutationNotice: null,
  });
  const before = deleted.length;
  await resume(owner);
  expect((await poll(owner, await send(owner, {}))).status).toBe("completed");
  expect(deleted.length).toBe(before);
  expect(await (await status()).json()).toMatchObject({
    cleanupWarning: expect.any(String),
    mutationNotice: null,
  });
  expect(attachmentSchema.parse((await draft(owner)).proof)).toEqual(second);
});

test("template received same-identity overwrite cannot pretend rollback after canonical admission expires", async () => {
  const owner = await fixture({ templateMode: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const saved = await draft(owner);
  const first = attachmentSchema.parse(saved.proof);
  await resume(owner);
  customToken = first.file_token;
  customLink = first.file_link;
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  receiptBarrier = { enter: () => entered.resolve(), release: release.promise };
  const deletes = deleted.length;
  const accepted = await send(owner, {
    folio_proof: file(new Uint8Array([7, 6]), "Replacement.BIN"),
  });
  await entered.promise;
  await prisma.editorLease.delete({ where: { id: owner.lease.id } });
  release.resolve();
  const failed = await poll(owner, accepted);
  expect(failed.status).toBe("failed");
  expect(await draft(owner)).toEqual(saved);
  expect(deleted.length).toBe(deletes);
  expect(providerFiles.get(new URL(first.file_link).pathname)?.bytes).toEqual(
    new Uint8Array([7, 6])
  );
  const status = await app.handle(
    new Request(
      `http://test.local/api/responses/${owner.response.id}/attachment-status`,
      { headers: { Authorization: `Bearer ${owner.bearer}` } }
    )
  );
  expect(await status.json()).toMatchObject({
    mutationNotice: expect.stringContaining("เขียนทับ"),
  });
});

test("template concurrent unknown destination cannot dispatch another owner's write", async () => {
  const number = `CONCURRENT.${crypto.randomUUID()}`;
  const owner = await fixture({ number, templateMode: true });
  const other = await fixture({ number, templateMode: true });
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  receiveBarrier = { enter: () => entered.resolve(), release: release.promise };
  const accepted = await send(owner, { folio_proof: file() });
  await entered.promise;
  const uploads = received.length;
  try {
    expect(
      (await poll(other, await send(other, { folio_proof: file() }))).status
    ).toBe("failed");
    expect(received.length).toBe(uploads);
  } finally {
    release.resolve();
  }
  expect((await poll(owner, accepted)).status).toBe("completed");
});
/* oxlint-enable no-await-expression-member */
test("Correction validates reason, required physical slots and eligibility before provider writes", async () => {
  const owner = await fixture({ tableAttachments: true });
  const admin = await fixture({ admin: true });
  const viewer = await fixture({ viewer: true });
  const viewerSession = await app.handle(
    new Request("http://test.local/api/session", {
      headers: { Authorization: `Bearer ${viewer.bearer}` },
    })
  );
  expect(viewerSession.status).toBe(200);
  expect(await viewerSession.json()).toMatchObject({
    user: { id: viewer.identity.id, role: "viewer" },
  });
  snapshots.set(
    owner.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(owner.documentKey)),
      "B12",
      "active ordinary row"
    )
  );
  expect(
    readSpreadsheetWorkbook(
      fixtureValue(snapshots.get(owner.documentKey))
    ).cells.get("B12")?.value
  ).toBe("active ordinary row");
  const submitted = await poll(
    owner,
    await send(
      owner,
      {
        '["folio_row_proof",2]': file(new Uint8Array(), "required-row"),
        folio_proof: file(),
      },
      "submit"
    )
  );
  expect(submitted.status).toBe("completed");
  const submittedSnapshot = await prisma.submission.findFirstOrThrow({
    where: { responseId: owner.response.id },
  });
  expect(
    z.record(z.string(), z.unknown()).parse(submittedSnapshot.data).rows
  ).toEqual([
    {
      item: "active ordinary row",
      other: null,
      proof: {
        file_link: expect.any(String),
        file_token: expect.any(String),
        original_name: "required-row",
        row_index: 2,
        size_bytes: 0,
      },
    },
  ]);
  const bridge = await openCorrection(owner, admin);
  expect(bridge.uploadPoc.savedData).toMatchObject({
    proof: { original_name: "Original.BIN" },
  });
  const uploads = received.length;
  const deletes = deleted.length;
  const missingReason = await postCorrection(
    owner,
    admin,
    bridge,
    { folio_proof: file() },
    { reason: " " }
  );
  expect(missingReason.status).toBe(400);
  const requiredRemoval = await poll(
    admin,
    await postCorrection(
      owner,
      admin,
      bridge,
      {},
      {
        attachmentRemovals: [{ bindingId: "folio_row_proof", rowIndex: 2 }],
      }
    )
  );
  expect(requiredRemoval.status).toBe("failed");
  expect(received.length).toBe(uploads);
  const internalUpload = await postCorrection(
    owner,
    admin,
    bridge,
    { folio_proof: file() },
    {},
    true
  );
  expect(internalUpload.status).toBe(400);
  const viewerMutation = await postCorrection(owner, viewer, bridge, {
    folio_proof: file(),
  });
  expect(viewerMutation.status).toBe(403);
  const foreignUserMutation = await postCorrection(owner, owner, bridge, {
    folio_proof: file(),
  });
  expect(foreignUserMutation.status).toBe(403);
  expect(received.length).toBe(uploads);
  const reopened = await app.handle(
    new Request(`http://test.local/api/forms/${owner.form.publicId}/start`, {
      headers: { Authorization: `Bearer ${owner.bearer}` },
      method: "POST",
    })
  );
  expect(reopened.status).toBe(200);
  const ineligible = await postCorrection(owner, admin, bridge, {
    folio_proof: file(),
  });
  expect(ineligible.status).toBe(404);
  expect(
    await prisma.correction.count({ where: { responseId: owner.response.id } })
  ).toBe(0);
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
});

test("initial Correction rejects a changed captured workspace base before original retrieval or writes", async () => {
  const owner = await fixture({ templateMode: true });
  const admin = await fixture({ admin: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }, "submit")))
      .status
  ).toBe("completed");
  const submission = await prisma.submission.findFirstOrThrow({
    where: { responseId: owner.response.id },
  });
  const bridge = await openCorrection(owner, admin);
  snapshots.set(
    bridge.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(bridge.documentKey)),
      "B2",
      "UNSAFE.BASE"
    )
  );
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  captureBarrier = {
    enter: () => entered.resolve(),
    release: released.promise,
  };
  const reads = originalReads.length;
  const uploads = received.length;
  const deletes = deleted.length;
  try {
    const pending = postCorrection(owner, admin, bridge);
    await entered.promise;
    await prisma.editorLease.updateMany({
      data: { workspaceBaseDocumentKey: `unrelated-${crypto.randomUUID()}` },
      where: { targetId: owner.response.id, targetType: "correction" },
    });
    captureBarrier = null;
    released.resolve();
    const accepted = await pending;
    expect(accepted.status).toBe(409);
    expect(originalReads.length).toBe(reads);
    expect(received.length).toBe(uploads);
    expect(deleted.length).toBe(deletes);
    expect(
      await prisma.correction.count({ where: { submissionId: submission.id } })
    ).toBe(0);
    expect(
      (
        await prisma.submission.findUniqueOrThrow({
          where: { id: submission.id },
        })
      ).data
    ).toEqual(submission.data);
  } finally {
    captureBarrier = null;
    released.resolve();
  }
});

test("template Correction freezes catalog routing, rejects protected overwrite and reuses scalar/table originals at distinct destinations", async () => {
  const owner = await fixture({ tableAttachments: true, templateMode: true });
  const admin = await fixture({ admin: true });
  const scalar = new Uint8Array([6, 0, 255]);
  const row = new Uint8Array();
  expect(
    (
      await poll(
        owner,
        await send(
          owner,
          {
            '["folio_row_proof",2]': file(row, "empty.TXT"),
            folio_proof: file(scalar, "scalar.BIN"),
          },
          "submit"
        )
      )
    ).status
  ).toBe("completed");
  const submission = await prisma.submission.findFirstOrThrow({
    where: { responseId: owner.response.id },
  });
  const response = await prisma.response.findUniqueOrThrow({
    where: { id: owner.response.id },
  });
  const manifest = await prisma.fieldManifest.findUniqueOrThrow({
    include: { fields: true },
    where: { publishedTemplateId: response.publishedTemplateId },
  });
  const frozen = manifest.fields.filter((field) => field.attachment);
  for (const field of frozen) {
    await prisma.storageTemplate.create({
      data: {
        document_category_id: 42,
        id: fixtureValue(field.attachmentTemplateId),
        template_name: fixtureValue(field.attachmentTemplateName),
      },
    });
  }
  const bridge = await openCorrection(owner, admin);
  const uploads = received.length;
  const deletes = deleted.length;
  const reads = originalReads.length;
  for (const field of frozen) {
    const id = fixtureValue(field.attachmentTemplateId);
    const renamed = await app.handle(
      new Request(`http://test.local/api/admin/storage-templates/${id}`, {
        body: JSON.stringify({
          document_category_id: 43,
          template_name: `changed-${id}`,
        }),
        headers: {
          Authorization: `Bearer ${admin.bearer}`,
          "Content-Type": "application/json",
        },
        method: "PATCH",
      })
    );
    expect(renamed.status).toBe(200);
    const removed = await app.handle(
      new Request(`http://test.local/api/admin/storage-templates/${id}`, {
        body: JSON.stringify({ confirm: true }),
        headers: {
          Authorization: `Bearer ${admin.bearer}`,
          "Content-Type": "application/json",
        },
        method: "DELETE",
      })
    );
    expect(removed.status).toBe(200);
  }
  const conflict = await poll(
    admin,
    await postCorrection(owner, admin, bridge, {
      folio_proof: file(new Uint8Array([9]), "replacement.BIN"),
    })
  );
  expect(conflict.status).toBe("failed");
  expect(conflict.result?.errorMessage).toContain("ห้ามเขียนทับ");
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(originalReads.length).toBe(reads);
  expect(
    await prisma.correction.count({ where: { submissionId: submission.id } })
  ).toBe(0);
  const next = await openCorrection(owner, admin);
  snapshots.set(
    next.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(next.documentKey)),
      "B2",
      `CORRECTION.${owner.response.id}`
    )
  );
  expect(
    (await poll(admin, await postCorrection(owner, admin, next, {}, {}, true)))
      .status
  ).toBe("completed");
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  const saved = await openCorrection(owner, admin);
  expect(
    (await poll(admin, await postCorrection(owner, admin, saved))).status
  ).toBe("completed");
  expect(
    received.slice(uploads).map((entry) => ({
      bytes: [...entry.bytes],
      fields: entry.fields,
      name: entry.name,
      template: entry.template,
    }))
  ).toEqual([
    {
      bytes: [...scalar],
      fields: ["documentFile", "template"],
      name: `CORRECTION.${owner.response.id}-ก่อหนี้-4_ขยาย(45).BIN`,
      template: "1",
    },
    {
      bytes: [],
      fields: ["documentFile", "template"],
      name: `CORRECTION.${owner.response.id}-หลักฐาน-ตาราง.TXT`,
      template: "1",
    },
  ]);
  expect(originalReads.slice(reads).map((entry) => entry.path)).toEqual(
    Array(2).fill("/api/beeecm/public/file")
  );
  expect(deleted.length).toBe(deletes);
  const correction = await prisma.correction.findFirstOrThrow({
    where: { submissionId: submission.id },
  });
  const data = z.record(z.string(), z.unknown()).parse(correction.data);
  expect(tableRowsSchema.parse(data.rows)[0]?.proof?.row_index).toBe(2);
  expect(
    await prisma.ecmAttachmentReference.findMany({
      orderBy: { rowIndex: "asc" },
      select: { rowIndex: true },
      where: { snapshotId: correction.documentKey },
    })
  ).toEqual([{ rowIndex: 2 }, { rowIndex: null }]);
  for (const [revision, expected] of [
    ["original", submission.data],
    [String(correction.revision), correction.data],
  ] as const) {
    const result = await app.handle(
      new Request(
        `http://test.local/api/submissions/${submission.id}/xlsx?revision=${revision}`,
        {
          headers: { Authorization: `Bearer ${admin.bearer}` },
        }
      )
    );
    expect(result.status).toBe(200);
    const workbook = readSpreadsheetWorkbook(
      new Uint8Array(await result.arrayBuffer())
    );
    const snapshot = z.record(z.string(), z.unknown()).parse(expected);
    expect(workbook.cells.get("B3")?.value).toBe(
      attachmentSchema.parse(snapshot.proof).file_link
    );
    expect(workbook.cells.get("C12")?.value).toBe(
      tableRowsSchema.parse(snapshot.rows)[0]?.proof?.file_link
    );
    const attachment = attachmentSchema.parse(snapshot.proof);
    expect([
      ...new Uint8Array(
        await (await fetch(attachment.file_link)).arrayBuffer()
      ),
    ]).toEqual([...scalar]);
  }
  expect(
    (
      await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
      })
    ).data
  ).toEqual(submission.data);
  expect(
    (
      await prisma.fieldManifest.findUniqueOrThrow({
        include: { fields: true },
        where: { id: manifest.id },
      })
    ).fields
  ).toEqual(manifest.fields);
  const latest = await openCorrection(owner, admin);
  const protectedCorrection = await poll(
    admin,
    await postCorrection(owner, admin, latest, {
      folio_proof: file(new Uint8Array([99]), "newer.BIN"),
    })
  );
  expect(protectedCorrection.status).toBe("failed");
  expect(protectedCorrection.result?.errorMessage).toContain("ห้ามเขียนทับ");
  expect(received.length).toBe(uploads + 2);
  expect(deleted.length).toBe(deletes);
  expect(
    await prisma.correction.count({ where: { submissionId: submission.id } })
  ).toBe(1);
  const protectedFile = attachmentSchema.parse(data.proof);
  expect([
    ...new Uint8Array(
      await (await fetch(protectedFile.file_link)).arrayBuffer()
    ),
  ]).toEqual([...scalar]);
});

test("Correction metadata and removal preserve older selected file versions and exports", async () => {
  const owner = await fixture();
  const admin = await fixture({ admin: true });
  const viewer = await fixture({ viewer: true });
  const submitted = await poll(
    owner,
    await send(
      owner,
      {
        folio_other: file(new Uint8Array([3]), "optional"),
        folio_proof: file(new Uint8Array([1, 2]), "proof.BIN"),
      },
      "submit"
    )
  );
  expect(submitted.status).toBe("completed");
  const submission = await prisma.submission.findFirstOrThrow({
    where: { responseId: owner.response.id },
  });
  const original = z.record(z.string(), z.unknown()).parse(submission.data);
  const bridge = await openCorrection(owner, admin);
  snapshots.set(
    bridge.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(bridge.documentKey)),
      "B2",
      "CORRECTED.57"
    )
  );
  const uploads = received.length;
  const deletes = deleted.length;
  const corrected = await poll(
    admin,
    await postCorrection(owner, admin, bridge)
  );
  expect(corrected.status).toBe("completed");
  expect(received.slice(uploads).map((entry) => [...entry.bytes])).toEqual([
    [1, 2],
    [3],
  ]);
  expect(received.slice(uploads).map((entry) => entry.number)).toEqual([
    "CORRECTED.57",
    "CORRECTED.57",
  ]);
  const first = await prisma.correction.findFirstOrThrow({
    where: { submissionId: submission.id },
  });
  const firstData = z.record(z.string(), z.unknown()).parse(first.data);
  const next = await openCorrection(owner, admin);
  const stale = await postCorrection(owner, admin, bridge);
  expect(stale.status).toBe(409);
  const removed = await poll(
    admin,
    await postCorrection(
      owner,
      admin,
      next,
      {},
      {
        attachmentRemovals: [{ bindingId: "folio_other", rowIndex: null }],
      }
    )
  );
  expect(removed.status).toBe("completed");
  const latest = await prisma.correction.findFirstOrThrow({
    orderBy: { revision: "desc" },
    where: { submissionId: submission.id },
  });
  expect(latest.data).toMatchObject({ other: null, proof: firstData.proof });
  expect(received.length).toBe(uploads + 2);
  expect(deleted.length).toBe(deletes);
  for (const [revision, data] of [
    ["original", original],
    [String(first.revision), firstData],
  ] as const) {
    for (const actor of [owner, admin, viewer]) {
      const response = await app.handle(
        new Request(
          `http://test.local/api/submissions/${submission.id}/xlsx?revision=${revision}`,
          { headers: { Authorization: `Bearer ${actor.bearer}` } }
        )
      );
      expect(response.status).toBe(200);
      const artifact = new Uint8Array(await response.arrayBuffer());
      const workbook = readSpreadsheetWorkbook(artifact);
      expect(workbook.cells.get("B3")?.value).toBe(
        attachmentSchema.parse(data.proof).file_link
      );
      expect(workbook.cells.get("B4")?.value).toBe(
        attachmentSchema.parse(data.other).file_link
      );
      const parts = Object.values(unzipSync(artifact))
        .map((part) => strFromU8(part))
        .join("\n");
      expect(parts).not.toContain(
        attachmentSchema.parse(data.proof).file_token
      );
      expect(parts).not.toContain(
        attachmentSchema.parse(data.other).file_token
      );
      expect(parts).not.toContain("scalar-test-service-token");
      expect(
        strFromU8(fixtureValue(workbook.archive[workbook.sheetPath]))
      ).not.toContain("oleObject");
      expect(
        strFromU8(fixtureValue(workbook.archive[workbook.sheetPath]))
      ).toContain("sheetProtection");
    }
    for (const attachment of [
      attachmentSchema.parse(data.proof),
      attachmentSchema.parse(data.other),
    ]) {
      const publicFile = await fetch(attachment.file_link);
      expect(publicFile.status).toBe(200);
    }
  }
  const historicalCorrection = await prisma.correction.findUniqueOrThrow({
    where: { id: first.id },
  });
  expect(historicalCorrection.data).toEqual(first.data);
  const historicalSubmission = await prisma.submission.findUniqueOrThrow({
    where: { id: submission.id },
  });
  expect(historicalSubmission.data).toEqual(submission.data);
});

test("new XLSX round uses Published Template without copying old answers or files and keeps history readable", async () => {
  const owner = await fixture({ number: "PREVIOUS.ROUND", year: "2599" });
  snapshots.set(
    owner.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(owner.documentKey)),
      "B5",
      "previous ordinary answer"
    )
  );
  const submitted = await poll(
    owner,
    await send(owner, { folio_proof: file() }, "submit")
  );
  expect(submitted.status).toBe("completed");
  const submission = await prisma.submission.findFirstOrThrow({
    where: { responseId: owner.response.id },
  });
  const oldData = z.record(z.string(), z.unknown()).parse(submission.data);
  const oldBytes = await readObject(submission.objectKey);
  const uploads = received.length;
  const reopened = await app.handle(
    new Request(`http://test.local/api/forms/${owner.form.publicId}/start`, {
      headers: { Authorization: `Bearer ${owner.bearer}` },
      method: "POST",
    })
  );
  expect(reopened.status).toBe(200);
  const draftState = await prisma.response.findUniqueOrThrow({
    where: { id: owner.response.id },
  });
  expect(draftState.status).toBe("draft");
  expect(draftState.draftData).toBeNull();
  const workbook = readSpreadsheetWorkbook(
    await readObject(fixtureValue(draftState.draftObjectKey))
  );
  expect(workbook.cells.get("B1")?.value).not.toBe("2599");
  expect(workbook.cells.get("B2")?.value).not.toBe("PREVIOUS.ROUND");
  expect(workbook.cells.get("B5")?.value ?? null).toBeNull();
  expect(workbook.cells.get("B3")?.value ?? null).toBeNull();
  const history = await app.handle(
    new Request(
      `http://test.local/api/submissions/${submission.id}/json?revision=original`,
      { headers: { Authorization: `Bearer ${owner.bearer}` } }
    )
  );
  expect(history.status).toBe(200);
  expect(await history.json()).toEqual(oldData);
  expect(await readObject(submission.objectKey)).toEqual(oldBytes);
  expect(received.length).toBe(uploads);
});

test("current Fill Download projects saved URLs without controls and keeps unsaved ordinary edits, artwork and protection", async () => {
  const owner = await fixture();
  const saved = await poll(owner, await send(owner, { folio_proof: file() }));
  expect(saved.status).toBe("completed");
  await resume(owner);
  const savedData = await draft(owner);
  const canonical = fixtureValue(snapshots.get(owner.documentKey));
  const archive = unzipSync(
    replaceCell(canonical, "B5", "ordinary unsaved capture")
  );
  const drawingPath = fixtureValue(
    Object.keys(archive).find((path) =>
      /^xl\/drawings\/[^/]+\.xml$/u.test(path)
    )
  );
  const drawing = spreadsheetXmlTree(
    strFromU8(fixtureValue(archive[drawingPath]))
  );
  const art = spreadsheetXmlTree(
    '<xdr:twoCellAnchor xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>6</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="90001" name="Unrelated artwork"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdOrdinaryArtwork"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>'
  );
  drawing.children.push(art);
  archive[drawingPath] = strToU8(serializeSpreadsheetXml(drawing));
  const relPath = templateRelationshipPartPath(drawingPath);
  const relations = spreadsheetXmlTree(
    strFromU8(fixtureValue(archive[relPath]))
  );
  relations.children.push({
    attributes: {
      Id: "rIdOrdinaryArtwork",
      Target: "../media/ordinary-proof.png",
      Type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    },
    children: [],
    name: "Relationship",
  });
  archive[relPath] = strToU8(serializeSpreadsheetXml(relations));
  const artwork = new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1sAAAAASUVORK5CYII=",
      "base64"
    )
  );
  archive["xl/media/ordinary-proof.png"] = artwork;
  snapshots.set(owner.documentKey, zipSync(archive));
  const uploads = received.length;
  const response = await app.handle(
    new Request(
      `http://test.local/api/responses/${owner.response.id}/editor-export/xlsx`,
      {
        body: JSON.stringify({
          snapshotUrl: "http://office.test/cache/snapshot.xlsx",
        }),
        headers: {
          Authorization: `Bearer ${owner.bearer}`,
          "Content-Type": "application/json",
          "X-Editor-Capability": actionEditorCapability(
            owner.identity,
            {
              documentKey: owner.documentKey,
              documentServerKey: owner.documentServerKey,
              formId: owner.form.id,
              targetId: owner.response.id,
              targetType: "response",
            },
            "export-workbook",
            owner.lease
          ),
        },
        method: "POST",
      }
    )
  );
  expect(response.status).toBe(200);
  const exported = readSpreadsheetWorkbook(
    new Uint8Array(await response.arrayBuffer())
  );
  expect(exported.cells.get("B5")?.value).toBe("ordinary unsaved capture");
  expect(exported.cells.get("B3")?.value).toBe(
    attachmentSchema.parse(savedData.proof).file_link
  );
  const sheet = strFromU8(fixtureValue(exported.archive[exported.sheetPath]));
  expect(sheet).not.toContain("oleObject");
  expect(sheet).toContain("sheetProtection");
  expect(strFromU8(fixtureValue(exported.archive[drawingPath]))).toContain(
    "Unrelated artwork"
  );
  expect(exported.archive["xl/media/ordinary-proof.png"]).toEqual(artwork);
  const persisted = await prisma.response.findUniqueOrThrow({
    where: { id: owner.response.id },
  });
  expect(await readObject(fixtureValue(persisted.draftObjectKey))).toEqual(
    canonical
  );
  expect(received.length).toBe(uploads);
});

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

test("TCP listener accepts fourteen valid 10,000,000-byte files in one atomic Draft", async () => {
  const f = await fixture({ tableAttachments: true, tableRows: 7 });
  const listenerUrl = new URL(fixtureValue(app.server).url);
  listenerUrl.hostname = "127.0.0.1";
  const { origin } = listenerUrl;
  const start = received.length;
  const bytes = new Uint8Array(10_000_000).fill(173);
  const files: Record<string, File> = {};
  for (let row = 0; row < 7; row += 1) {
    files[JSON.stringify(["folio_row_proof", row])] = file(
      bytes,
      `proof-${row}.BIN`
    );
    files[JSON.stringify(["folio_row_other", row])] = file(
      bytes,
      `other-${row}.BIN`
    );
  }
  const completed = await poll(
    f,
    await send(f, files, "draft", crypto.randomUUID(), {}, origin)
  );
  expect(completed.status).toBe("completed");
  const savedDraft = await draft(f);
  const rows = tableRowsSchema.parse(savedDraft.rows);
  expect(rows).toHaveLength(7);
  for (let row = 0; row < 7; row += 1) {
    expect(rows[row]).toMatchObject({
      other: {
        original_name: `other-${row}.BIN`,
        row_index: row,
        size_bytes: 10_000_000,
      },
      proof: {
        original_name: `proof-${row}.BIN`,
        row_index: row,
        size_bytes: 10_000_000,
      },
    });
  }
  expect(received.slice(start)).toHaveLength(14);
  for (const upload of received.slice(start)) {
    expect(upload.bytes).toEqual(bytes);
  }
}, 120_000);

test("TCP chunked multipart cannot exceed its trusted slot budget or start provider writes", async () => {
  const f = await fixture();
  const listenerUrl = new URL(fixtureValue(app.server).url);
  listenerUrl.hostname = "127.0.0.1";
  const uploads = received.length;
  const before = await draft(f);
  let remaining = 21_000_000;
  const chunk = new Uint8Array(1_000_000);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (remaining === 0) {
        controller.close();
        return;
      }
      const size = Math.min(remaining, chunk.byteLength);
      controller.enqueue(chunk.subarray(0, size));
      remaining -= size;
    },
  });
  const result = await fetch(
    new URL(`/api/forms/${f.form.publicId}/draft`, listenerUrl),
    {
      body,
      headers: {
        Authorization: `Bearer ${f.bearer}`,
        "Content-Type": "multipart/form-data; boundary=untrusted-chunked-body",
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
  );
  expect(result.status).toBe(413);
  expect(await result.json()).toMatchObject({ error: "payload_too_large" });
  expect(received.length).toBe(uploads);
  expect(await draft(f)).toEqual(before);
});

for (const templateMode of [false, true]) {
  test(`${templateMode ? "template " : ""}table attachments retain physical gaps and attachment-only zero-byte rows across multiple columns`, async () => {
    const f = await fixture({ tableAttachments: true, templateMode });
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

  test(`${templateMode ? "template " : ""}table attachment-only selected rows validate other required columns before any upload`, async () => {
    const f = await fixture({
      tableAttachments: true,
      tableItemRequired: true,
      templateMode,
    });
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
    expect(result.result?.errorMessage).toContain(
      "Required field: รายการ (B12)"
    );
    expect(received.length).toBe(uploads);
    expect(await draft(f)).toEqual({});
  });

  test(`${templateMode ? "template " : ""}table fully empty rows need no attachments but active ordinary rows require their column attachment`, async () => {
    const empty = await fixture({
      tableAttachments: true,
      tableItemRequired: true,
      templateMode,
    });
    const emptySubmission = await poll(
      empty,
      await send(empty, { folio_proof: file() }, "submit")
    );
    expect(emptySubmission.status).toBe("completed");
    const active = await fixture({
      tableAttachments: true,
      tableItemRequired: true,
      templateMode,
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
    expect(activeSubmission.result?.errorMessage).toContain(
      "Required attachment: หลักฐานรายแถว (แถว 3)"
    );
    expect(received.length).toBe(uploads);
  });

  test(`${templateMode ? "template " : ""}table zero-byte required files submit with valid ordinary input at physical not compact indices`, async () => {
    const f = await fixture({
      tableAttachments: true,
      tableItemRequired: true,
      templateMode,
    });
    snapshots.set(
      f.documentKey,
      replaceCell(
        fixtureValue(snapshots.get(f.documentKey)),
        "B12",
        "รายการจริง"
      )
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

  test(`${templateMode ? "template " : ""}table row shifts preserve exact versions and immutable send positions without ECM writes`, async () => {
    const f = await fixture({ tableAttachments: true, templateMode });
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
      {
        item: null,
        other: null,
        proof: { ...previous[0]?.proof, row_index: 1 },
      },
      {
        item: null,
        other: { ...previous[1]?.other, row_index: 2 },
        proof: null,
      },
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

  test(`${templateMode ? "template " : ""}table append preserves saved file slots and returns verified remount mapping without upload`, async () => {
    const f = await fixture({ tableAttachments: true, templateMode });
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

  test(`${templateMode ? "template " : ""}table stale snapshots and forged physical slots stop before external writes`, async () => {
    const f = await fixture({ tableAttachments: true, templateMode });
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

  test(`${templateMode ? "template " : ""}table removals compact only empty rows and never cross-wire another attachment column`, async () => {
    const f = await fixture({ tableAttachments: true, templateMode });
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
  test(`${templateMode ? "template " : ""}table multi-column failure leaves the complete old Draft and never sends the next physical slot`, async () => {
    const f = await fixture({ tableAttachments: true, templateMode });
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
}

test("template table rejects invalid Draft files and requires other attachment columns on an attachment-only zero-byte row", async () => {
  const f = await fixture({ tableAttachments: true, templateMode: true });
  const uploads = received.length;
  const oversized = await send(f, {
    [JSON.stringify(["folio_row_proof", 2])]: file(new Uint8Array(10_000_001)),
  });
  expect(oversized.status).toBe(413);
  expect(await draft(f)).toEqual({});
  const required = await poll(
    f,
    await send(
      f,
      {
        folio_proof: file(),
        [JSON.stringify(["folio_row_other", 2])]: file(
          new Uint8Array(),
          "empty.BIN"
        ),
      },
      "submit"
    )
  );
  expect(required.status).toBe("failed");
  expect(required.result?.errorMessage).toContain(
    "Required attachment: หลักฐานรายแถว (แถว 3)"
  );
  expect(received.length).toBe(uploads);
  expect(await draft(f)).toEqual({});
});

test("template table duplicate destinations retain physical receipts but share mutable provider bytes without DELETE", async () => {
  const f = await fixture({ tableAttachments: true, templateMode: true });
  const uploads = received.length;
  const deletes = deleted.length;
  customToken = crypto.randomUUID();
  customLink = `${provider.url.origin}/files/${crypto.randomUUID()}`;
  const result = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 0])]: file(
        new Uint8Array(),
        "empty.BIN"
      ),
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array([7, 8]),
        "last.BIN"
      ),
    })
  );
  expect(result.status).toBe("completed");
  const saved = await draft(f);
  const rows = tableRowsSchema.parse(saved.rows);
  expect(rows.map((row) => row.proof)).toEqual([
    {
      file_link: customLink,
      file_token: customToken,
      original_name: "empty.BIN",
      row_index: 0,
      size_bytes: 0,
    },
    {
      file_link: customLink,
      file_token: customToken,
      original_name: "last.BIN",
      row_index: 2,
      size_bytes: 2,
    },
  ]);
  expect(
    received.slice(uploads).map((entry) => ({
      bytes: [...entry.bytes],
      fields: entry.fields,
      name: entry.name,
      template: entry.template,
    }))
  ).toEqual([
    {
      bytes: [],
      fields: ["documentFile", "template"],
      name: `${saved.docs_number}-หลักฐาน-ตาราง.BIN`,
      template: "1",
    },
    {
      bytes: [7, 8],
      fields: ["documentFile", "template"],
      name: `${saved.docs_number}-หลักฐาน-ตาราง.BIN`,
      template: "1",
    },
  ]);
  expect(providerFiles.get(new URL(customLink).pathname)?.bytes).toEqual(
    new Uint8Array([7, 8])
  );
  await resume(f);
  const replacement = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array([9]),
        "replacement.BIN"
      ),
    })
  );
  expect(replacement.status).toBe("completed");
  expect(
    tableRowsSchema.parse((await draft(f)).rows).map((row) => row.proof)
  ).toEqual([
    fixtureValue(rows[0]?.proof),
    {
      file_link: customLink,
      file_token: customToken,
      original_name: "replacement.BIN",
      row_index: 2,
      size_bytes: 1,
    },
  ]);
  expect(providerFiles.get(new URL(customLink).pathname)?.bytes).toEqual(
    new Uint8Array([9])
  );
  expect(deleted.length).toBe(deletes);
  await resume(f);
  expect(
    (
      await poll(
        f,
        await send(f, {}, "draft", crypto.randomUUID(), {
          attachmentRemovals: [{ bindingId: "folio_row_proof", rowIndex: 0 }],
        })
      )
    ).status
  ).toBe("completed");
  expect(tableRowsSchema.parse((await draft(f)).rows)).toEqual([
    {
      item: null,
      other: null,
      proof: {
        file_link: customLink,
        file_token: customToken,
        original_name: "replacement.BIN",
        row_index: 2,
        size_bytes: 1,
      },
    },
  ]);
  expect(deleted.length).toBe(deletes);
  expect(received.length).toBe(uploads + 3);
});

test("template table identical shared receipts keep both physical attempt references usable for later replacement", async () => {
  const f = await fixture({ tableAttachments: true, templateMode: true });
  customToken = crypto.randomUUID();
  customLink = `${provider.url.origin}/files/${crypto.randomUUID()}`;
  const initial = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 0])]: file(
        new Uint8Array([1]),
        "same.BIN"
      ),
      [JSON.stringify(["folio_row_proof", 2])]: file(
        new Uint8Array([2]),
        "same.BIN"
      ),
    })
  );
  expect(initial.status).toBe("completed");
  const before = await draft(f);
  expect(
    tableRowsSchema.parse(before.rows).map((row) => row.proof?.row_index)
  ).toEqual([0, 2]);
  await resume(f);
  const uploads = received.length;
  const deletes = deleted.length;
  expect((await poll(f, await send(f, {}))).status).toBe("completed");
  expect(received.length).toBe(uploads);
  expect(
    await prisma.ecmAttachmentReference.count({
      where: { responseId: f.response.id },
    })
  ).toBe(2);
  expect(
    await prisma.ecmAttachmentVersion.count({
      where: { operationId: initial.operationId, state: "committed" },
    })
  ).toBe(2);
  await resume(f);
  expect(
    (
      await poll(
        f,
        await send(f, {}, "draft", crypto.randomUUID(), {
          rowChange: { action: "delete", index: 1 },
        })
      )
    ).status
  ).toBe("completed");
  expect(
    tableRowsSchema
      .parse((await draft(f)).rows)
      .map((row) => row.proof?.row_index)
  ).toEqual([0, 1]);
  expect(
    await prisma.ecmAttachmentReference.count({
      where: { responseId: f.response.id },
    })
  ).toBe(2);
  expect(received.length).toBe(uploads);
  await resume(f);
  const replacement = await poll(
    f,
    await send(f, {
      [JSON.stringify(["folio_row_proof", 1])]: file(
        new Uint8Array([3]),
        "same.BIN"
      ),
    })
  );
  expect(replacement.status, String(replacement.result?.errorMessage)).toBe(
    "completed"
  );
  expect(
    tableRowsSchema
      .parse((await draft(f)).rows)
      .map((row) => row.proof?.row_index)
  ).toEqual([0, 1]);
  expect(
    providerFiles.get(new URL(fixtureValue(customLink)).pathname)?.bytes
  ).toEqual(new Uint8Array([3]));
  expect(received.length).toBe(uploads + 1);
  expect(deleted.length).toBe(deletes);
  await resume(f);
  expect(
    (
      await poll(
        f,
        await send(f, {}, "draft", crypto.randomUUID(), {
          attachmentRemovals: [{ bindingId: "folio_row_proof", rowIndex: 1 }],
        })
      )
    ).status
  ).toBe("completed");
  expect(
    tableRowsSchema
      .parse((await draft(f)).rows)
      .map((row) => row.proof?.row_index)
  ).toEqual([0]);
  expect(deleted.length).toBe(deletes);
  await resume(f);
  const cleanup = Promise.withResolvers<undefined>();
  deleteSettlements.set(fixtureValue(customToken), cleanup);
  expect(
    (
      await poll(
        f,
        await send(f, {}, "draft", crypto.randomUUID(), {
          attachmentRemovals: [{ bindingId: "folio_row_proof", rowIndex: 0 }],
        })
      )
    ).status
  ).toBe("completed");
  await cleanup.promise;
  expect((await draft(f)).rows).toEqual([]);
  expect(deleted.length).toBe(deletes + 1);
  expect(providerFiles.has(new URL(fixtureValue(customLink)).pathname)).toBe(
    false
  );
});

test("template table plans every destination before POST and rejects foreign or historical row ownership", async () => {
  for (const protection of ["foreign", "history"] as const) {
    const number = `TABLE.${crypto.randomUUID()}`;
    const owner = await fixture({
      number,
      tableAttachments: true,
      templateMode: true,
    });
    expect(
      (
        await poll(
          owner,
          await send(
            owner,
            {
              folio_proof: file(),
              [JSON.stringify(["folio_row_proof", 2])]: file(),
            },
            protection === "history" ? "submit" : "draft"
          )
        )
      ).status
    ).toBe("completed");
    const uploads = received.length;
    const deletes = deleted.length;
    if (protection === "foreign") {
      const other = await fixture({
        number,
        tableAttachments: true,
        templateMode: true,
      });
      // The safe earlier column must not dispatch before the later protected destination is checked.
      expect(
        (
          await poll(
            other,
            await send(other, {
              [JSON.stringify(["folio_row_other", 0])]: file(),
              [JSON.stringify(["folio_row_proof", 3])]: file(),
            })
          )
        ).status
      ).toBe("failed");
      expect(await draft(other)).toEqual({});
    } else {
      const admin = await fixture({ admin: true });
      const bridge = await openCorrection(owner, admin);
      expect(
        (
          await poll(
            admin,
            await postCorrection(owner, admin, bridge, {
              folio_proof: file(new Uint8Array(), "safe-scalar.TXT"),
              [JSON.stringify(["folio_row_proof", 0])]: file(
                new Uint8Array(),
                "safe.TXT"
              ),
              [JSON.stringify(["folio_row_other", 0])]: file(),
              [JSON.stringify(["folio_row_proof", 2])]: file(),
            })
          )
        ).result?.errorMessage
      ).toContain("ปลายทางไฟล์ซ้ำ");
    }
    expect(received.length).toBe(uploads);
    expect(deleted.length).toBe(deletes);
  }
});

test("template table uncertain shared overwrite keeps the complete Draft and holds later slots without DELETE or replay", async () => {
  const f = await fixture({ tableAttachments: true, templateMode: true });
  expect(
    (
      await poll(
        f,
        await send(f, {
          [JSON.stringify(["folio_row_proof", 2])]: file(
            new Uint8Array([1]),
            "old.BIN"
          ),
        })
      )
    ).status
  ).toBe("completed");
  const before = await draft(f);
  const old = fixtureValue(tableRowsSchema.parse(before.rows)[0]?.proof);
  await resume(f);
  customLink = old.file_link;
  customToken = old.file_token;
  nextMode = "store-then-reject";
  const uploads = received.length;
  const deletes = deleted.length;
  const checkpoint = crypto.randomUUID();
  expect(
    (
      await poll(
        f,
        await send(
          f,
          {
            [JSON.stringify(["folio_row_proof", 2])]: file(
              new Uint8Array([2, 3]),
              "new.BIN"
            ),
            [JSON.stringify(["folio_row_other", 3])]: file(
              new Uint8Array([4]),
              "not-sent.BIN"
            ),
          },
          "draft",
          checkpoint
        )
      )
    ).status
  ).toBe("failed");
  expect(await draft(f)).toEqual(before);
  expect(providerFiles.get(new URL(old.file_link).pathname)?.bytes).toEqual(
    new Uint8Array([2, 3])
  );
  expect(received.length).toBe(uploads + 1);
  expect(deleted.length).toBe(deletes);
  expect((await recover(f, checkpoint)).status).toBe(200);
  expect((await send(f, {})).status).toBe(409);
  expect(received.length).toBe(uploads + 1);
  expect(deleted.length).toBe(deletes);
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

test("template table removes overwritten row A and reuses surviving B original bytes after a trusted shift", async () => {
  const f = await fixture({ tableAttachments: true, templateMode: true });
  customToken = crypto.randomUUID();
  customLink = `${provider.url.origin}/files/${crypto.randomUUID()}`;
  expect(
    (
      await poll(
        f,
        await send(f, {
          [JSON.stringify(["folio_row_proof", 0])]: file(
            new Uint8Array([1]),
            "same.BIN"
          ),
          [JSON.stringify(["folio_row_proof", 2])]: file(
            new Uint8Array([2]),
            "same.BIN"
          ),
        })
      )
    ).status
  ).toBe("completed");
  await resume(f);
  const uploads = received.length;
  const deletes = deleted.length;
  expect(
    (
      await poll(
        f,
        await send(f, {}, "draft", crypto.randomUUID(), {
          rowChange: { action: "delete", index: 0 },
        })
      )
    ).status
  ).toBe("completed");
  expect(received.length).toBe(uploads);
  expect(deleted.length).toBe(deletes);
  expect(
    tableRowsSchema
      .parse((await draft(f)).rows)
      .map((row) => row.proof?.row_index)
  ).toEqual([1]);
  await resume(f);
  snapshots.set(
    f.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(f.documentKey)),
      "B2",
      `SURVIVOR.${f.response.id}`
    )
  );
  customToken = null;
  customLink = null;
  const reads = originalReads.length;
  const reused = await poll(f, await send(f, {}));
  expect(reused.status, String(reused.result?.errorMessage)).toBe("completed");
  expect(originalReads.length).toBe(reads + 1);
  expect(
    received
      .slice(uploads)
      .map((entry) => ({ bytes: [...entry.bytes], name: entry.name }))
  ).toEqual([
    { bytes: [2], name: `SURVIVOR.${f.response.id}-หลักฐาน-ตาราง.BIN` },
  ]);
  const saved = fixtureValue(
    tableRowsSchema.parse((await draft(f)).rows)[0]?.proof
  );
  expect(saved.row_index).toBe(1);
  expect(providerFiles.get(new URL(saved.file_link).pathname)?.bytes).toEqual(
    new Uint8Array([2])
  );
});

test("template table metadata reuse reads every shifted physical slot through the shared trusted original reader", async () => {
  const f = await fixture({ tableAttachments: true, templateMode: true });
  expect(
    (
      await poll(
        f,
        await send(f, {
          [JSON.stringify(["folio_row_proof", 0])]: file(
            new Uint8Array(),
            "empty.TXT"
          ),
          [JSON.stringify(["folio_row_proof", 2])]: file(
            new Uint8Array([0, 255, 7]),
            "binary.BIN"
          ),
          [JSON.stringify(["folio_row_other", 2])]: file(
            new TextEncoder().encode("<html>original</html>"),
            "original.html"
          ),
          [JSON.stringify(["folio_row_other", 3])]: file(
            new Uint8Array([8]),
            "extensionless"
          ),
        })
      )
    ).status
  ).toBe("completed");
  await resume(f);
  expect(
    (
      await poll(
        f,
        await send(f, {}, "draft", crypto.randomUUID(), {
          rowChange: { action: "delete", index: 1 },
        })
      )
    ).status
  ).toBe("completed");
  await resume(f);
  snapshots.set(
    f.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(f.documentKey)),
      "B2",
      `CHANGED.${f.response.id}`
    )
  );
  const uploads = received.length;
  const reads = originalReads.length;
  const changed = await poll(f, await send(f, {}));
  expect(changed.status, String(changed.result?.errorMessage)).toBe(
    "completed"
  );
  expect(originalReads.slice(reads).map((read) => read.path)).toEqual(
    Array(4).fill("/api/beeecm/public/file")
  );
  expect(
    received.slice(uploads).map((entry) => ({
      bytes: [...entry.bytes],
      fields: entry.fields,
      name: entry.name,
      template: entry.template,
    }))
  ).toEqual([
    {
      bytes: [],
      fields: ["documentFile", "template"],
      name: `CHANGED.${f.response.id}-หลักฐาน-ตาราง.TXT`,
      template: "1",
    },
    {
      bytes: [0, 255, 7],
      fields: ["documentFile", "template"],
      name: `CHANGED.${f.response.id}-หลักฐาน-ตาราง.BIN`,
      template: "1",
    },
    {
      bytes: [...new TextEncoder().encode("<html>original</html>")],
      fields: ["documentFile", "template"],
      name: `CHANGED.${f.response.id}-อื่น-ตาราง.html`,
      template: "1",
    },
    {
      bytes: [8],
      fields: ["documentFile", "template"],
      name: `CHANGED.${f.response.id}-อื่น-ตาราง`,
      template: "1",
    },
  ]);
  const rows = tableRowsSchema.parse((await draft(f)).rows);
  expect(
    rows.map((row) => row.proof?.row_index ?? row.other?.row_index)
  ).toEqual([0, 1, 2]);
  expect(rows[1]?.other?.row_index).toBe(1);
});

test("template table ambiguous or missing current-alias digests stop metadata reuse before reads or writes", async () => {
  for (const missing of [false, true]) {
    const f = await fixture({ tableAttachments: true, templateMode: true });
    customToken = crypto.randomUUID();
    customLink = `${provider.url.origin}/files/${crypto.randomUUID()}`;
    const initial = await poll(
      f,
      await send(f, {
        [JSON.stringify(["folio_row_proof", 0])]: file(
          new Uint8Array([1]),
          "same.BIN"
        ),
        [JSON.stringify(["folio_row_proof", 2])]: file(
          new Uint8Array([missing ? 1 : 2]),
          "same.BIN"
        ),
      })
    );
    expect(initial.status).toBe("completed");
    if (missing) {
      await prisma.ecmAttachmentVersion.updateMany({
        data: { originalSha256: null },
        where: { operationId: initial.operationId, rowIndex: 0 },
      });
    }
    // Old snapshots have no trustworthy current-row position; do not fabricate one from upload history.
    await prisma.ecmAttachmentReference.updateMany({
      data: { rowIndex: null },
      where: { responseId: f.response.id },
    });
    const before = await draft(f);
    await resume(f);
    snapshots.set(
      f.documentKey,
      replaceCell(
        fixtureValue(snapshots.get(f.documentKey)),
        "B2",
        `CHANGED.${f.response.id}`
      )
    );
    const uploads = received.length;
    const reads = originalReads.length;
    const changed = await poll(f, await send(f, {}));
    expect(changed.status).toBe("failed");
    expect(changed.result?.errorMessage).toContain(
      "หลักฐานรายแถว / แถว 1: อ่านไฟล์ต้นฉบับเดิมไม่ได้"
    );
    expect(await draft(f)).toEqual(before);
    expect(originalReads.length).toBe(reads);
    expect(received.length).toBe(uploads);
  }
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
    const projection = readSpreadsheetWorkbook(viewerBytes);
    const original = readSpreadsheetWorkbook(canonicalBytes);
    expect([...projection.cells]).toEqual([...original.cells]);
    const projectedSheet = spreadsheetXmlTree(
      strFromU8(fixtureValue(projection.archive[projection.sheetPath]))
    );
    const canonicalSheet = spreadsheetXmlTree(
      strFromU8(fixtureValue(original.archive[original.sheetPath]))
    );
    expect(xmlElements(projectedSheet, "oleObject")).toHaveLength(0);
    expect(
      xmlElements(projectedSheet, "sheetProtection").map(
        (node) => node.attributes
      )
    ).toEqual(
      xmlElements(canonicalSheet, "sheetProtection").map(
        (node) => node.attributes
      )
    );
    for (const [path, part] of Object.entries(projection.archive)) {
      if (path.endsWith(".vml")) {
        expect(
          xmlElements(spreadsheetXmlTree(strFromU8(part)), "shape")
        ).toHaveLength(0);
      }
      expect(strFromU8(part)).not.toContain(
        attachmentSchema.parse(canonical.proof).file_token
      );
    }
  }
  const viewedData = await draft(f);
  expect(viewedData).toEqual(canonical);
  const persisted = await prisma.response.findUniqueOrThrow({
    where: { id: f.response.id },
  });
  expect(await readObject(fixtureValue(persisted.draftObjectKey))).toEqual(
    canonicalBytes
  );
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
  const oldCanonical = await draft(f);
  const oldProof = attachmentSchema.parse(oldCanonical.proof);
  const oldCleanup = Promise.withResolvers<undefined>();
  deleteSettlements.set(oldProof.file_token, oldCleanup);
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
  await oldCleanup.promise;
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
    const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
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
  const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
    where: { fileToken: old.file_token },
  });
  expect(
    await prisma.ecmAttachmentReference.findMany({
      where: { responseId: f.response.id, versionId: version.id },
    })
  ).toEqual([
    {
      responseId: f.response.id,
      rowIndex: null,
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
  const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
    where: { fileToken: old.file_token },
  });
  expect(
    await prisma.ecmAttachmentReference.findMany({
      where: { responseId: f.response.id, versionId: version.id },
    })
  ).toEqual([
    {
      responseId: f.response.id,
      rowIndex: null,
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
    const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
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
  const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
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
            checkpoint: crypto.randomUUID(),
            data: {},
            documentKey: bridge.documentKey,
            reason: "Correct ordinary note only",
            snapshotUrl: "http://office.test/cache/snapshot.xlsx",
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

test("final Admin Correction replaces scalar and table files while preserving the submitted snapshot", async () => {
  const owner = await fixture({ tableAttachments: true });
  const admin = await fixture({ admin: true });
  const originalScalar = new Uint8Array([11, 22, 33]);
  const originalRow = new Uint8Array([44, 55]);
  const submitted = await poll(
    owner,
    await send(
      owner,
      {
        '["folio_row_proof",2]': file(originalRow, "row.bin"),
        folio_proof: file(originalScalar, "submitted.bin"),
      },
      "submit"
    )
  );
  expect(submitted.status).toBe("completed");
  const submission = await prisma.submission.findFirstOrThrow({
    where: { responseId: owner.response.id },
  });
  const originalWorkbook = await readObject(submission.objectKey);
  const originalData = z.record(z.string(), z.unknown()).parse(submission.data);
  const scalar = attachmentSchema.parse(originalData.proof);
  const row = tableAttachmentSchema.parse(
    z.array(z.record(z.string(), z.unknown())).parse(originalData.rows)[0]
      ?.proof
  );
  const opened = await app.handle(
    new Request(
      `http://test.local/api/admin/results/${owner.response.id}/correction/editor-config`,
      { headers: { Authorization: `Bearer ${admin.bearer}` } }
    )
  );
  expect(opened.status).toBe(200);
  const config = z
    .object({
      bridge: z.object({
        capabilities: z.record(z.string(), z.string()),
        documentKey: z.string(),
      }),
      config: z.object({ document: z.object({ key: z.string() }) }),
    })
    .parse(await opened.json());
  const workspace = await prisma.editorLease.findUniqueOrThrow({
    where: {
      targetType_targetId: {
        targetId: owner.response.id,
        targetType: "correction",
      },
    },
  });
  nativeSnapshotKeys.set(config.config.document.key, config.bridge.documentKey);
  snapshots.set(
    config.bridge.documentKey,
    await readObject(fixtureValue(workspace.workspaceObjectKey))
  );
  const uploads = received.length;
  const deletes = deleted.length;
  const replacementScalar = new Uint8Array([66, 77, 88, 99]);
  const replacementRow = new Uint8Array();
  const body = new FormData();
  body.set(
    "payload",
    JSON.stringify({
      checkpoint: crypto.randomUUID(),
      data: {},
      documentKey: config.bridge.documentKey,
      reason: "Replace the supporting evidence",
      snapshotUrl: "http://office.test/cache/snapshot.xlsx",
    })
  );
  body.set("attachment:folio_proof", file(replacementScalar, "corrected.BIN"));
  body.set(
    `attachment:${encodeURIComponent('["folio_row_proof",2]')}`,
    file(replacementRow, "corrected-row")
  );
  const corrected = await poll(
    admin,
    await app.handle(
      new Request(
        `http://test.local/api/admin/results/${owner.response.id}/correction`,
        {
          body,
          headers: {
            Authorization: `Bearer ${admin.bearer}`,
            "X-Editor-Capability": fixtureValue(
              config.bridge.capabilities["save-correction"]
            ),
          },
          method: "POST",
        }
      )
    )
  );
  expect(corrected.status).toBe("completed");
  const correction = await prisma.correction.findFirstOrThrow({
    where: { submissionId: submission.id },
  });
  const correctedData = z
    .record(z.string(), z.unknown())
    .parse(correction.data);
  const correctedScalar = attachmentSchema.parse(correctedData.proof);
  const correctedRow = tableAttachmentSchema.parse(
    z.array(z.record(z.string(), z.unknown())).parse(correctedData.rows)[0]
      ?.proof
  );
  expect(correctedScalar).toMatchObject({
    original_name: "corrected.BIN",
    size_bytes: 4,
  });
  expect(correctedRow).toMatchObject({
    original_name: "corrected-row",
    row_index: 2,
    size_bytes: 0,
  });
  expect(correctedScalar.file_token).not.toBe(scalar.file_token);
  expect(correctedRow.file_token).not.toBe(row.file_token);
  expect(received.slice(uploads).map((upload) => upload.bytes)).toEqual([
    replacementScalar,
    replacementRow,
  ]);
  expect(deleted.length).toBe(deletes);
  const unchanged = await prisma.submission.findUniqueOrThrow({
    where: { id: submission.id },
  });
  expect(unchanged.data).toEqual(submission.data);
  expect(await readObject(unchanged.objectKey)).toEqual(originalWorkbook);
  for (const attachment of [scalar, row]) {
    const response = await fetch(attachment.file_link);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      attachment.file_token === scalar.file_token ? originalScalar : originalRow
    );
    const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
      where: { fileToken: attachment.file_token },
    });
    expect(
      await prisma.ecmAttachmentReference.count({
        where: { snapshotId: submission.documentKey, versionId: version.id },
      })
    ).toBe(1);
  }
  const projected = readSpreadsheetWorkbook(
    await readObject(correction.objectKey)
  );
  expect(projected.cells.get("B3")?.value).toBe(correctedScalar.file_link);
  expect(projected.cells.get("C12")?.value).toBe(correctedRow.file_link);
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
    customLink = `${provider.url.origin}/files/boundary-${crypto.randomUUID()}`;
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
              fiscalYear: z.string().nullable(),
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
  const projectionBytes = new Uint8Array(await document.arrayBuffer());
  const projection = readSpreadsheetWorkbook(projectionBytes);
  const original = readSpreadsheetWorkbook(nativeTemplate);
  expect([...projection.cells]).toEqual([...original.cells]);
  const projectedSheet = spreadsheetXmlTree(
    strFromU8(fixtureValue(projection.archive[projection.sheetPath]))
  );
  const originalSheet = spreadsheetXmlTree(
    strFromU8(fixtureValue(original.archive[original.sheetPath]))
  );
  expect(xmlElements(projectedSheet, "oleObject")).toHaveLength(0);
  expect(
    xmlElements(projectedSheet, "sheetProtection").map(
      (node) => node.attributes
    )
  ).toEqual(
    xmlElements(originalSheet, "sheetProtection").map((node) => node.attributes)
  );
  for (const [path, part] of Object.entries(projection.archive)) {
    if (path.endsWith(".vml")) {
      expect(
        xmlElements(spreadsheetXmlTree(strFromU8(part)), "shape")
      ).toHaveLength(0);
    }
    expect(strFromU8(part)).not.toContain("file_token");
    expect(strFromU8(part)).not.toContain("scalar-test-service-token");
    expect(strFromU8(part)).not.toContain(fixtureValue(received[start]).token);
  }
  const unchanged = await prisma.response.findUniqueOrThrow({
    where: { id: f.response.id },
  });
  expect(unchanged.draftDocumentKey).toBe(f.documentKey);
  expect(await readObject(fixtureValue(unchanged.draftObjectKey))).toEqual(
    nativeTemplate
  );
  const held = await app.handle(
    new Request(
      `http://test.local/api/responses/${f.response.id}/attachment-status`,
      { headers: { Authorization: `Bearer ${f.bearer}` } }
    )
  );
  expect(held.status).toBe(200);
  expect(await held.json()).toMatchObject({
    mutationNotice: durable.mutationNotice,
  });
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

test("template whole-Response deletion protects surviving alias B and deletes the canonical resource only after its last owner retires", async () => {
  const owner = await fixture({ templateMode: true });
  const other = await fixture({ templateMode: true });
  const admin = await fixture({ admin: true });
  const viewer = await fixture({ viewer: true });
  expect(
    (await poll(owner, await send(owner, { folio_proof: file() }))).status
  ).toBe("completed");
  const first = attachmentSchema.parse((await draft(owner)).proof);
  await resume(owner);
  customToken = first.file_token;
  customLink = first.file_link;
  const replacement = new Uint8Array([83, 72, 65, 82, 69, 68]);
  expect(
    (await poll(owner, await send(owner, { folio_proof: file(replacement) })))
      .status
  ).toBe("completed");
  const current = attachmentSchema.parse((await draft(owner)).proof);
  expect(current.file_link).toBe(first.file_link);
  const aliases = await prisma.ecmAttachmentVersion.findMany({
    orderBy: { sentAt: "asc" },
    where: { responseId: owner.response.id },
  });
  expect(aliases).toHaveLength(2);
  const surviving = fixtureValue(aliases.at(-1));
  await prisma.ecmAttachmentReference.create({
    data: {
      responseId: other.response.id,
      snapshotId: other.documentKey,
      versionId: surviving.id,
    },
  });
  const uploads = received.length;
  const before = deleted.length;
  const removed = await app.handle(
    new Request(`http://test.local/api/responses/${owner.response.id}`, {
      headers: { Authorization: `Bearer ${owner.bearer}` },
      method: "DELETE",
    })
  );
  expect(removed.status).toBe(200);
  expect(await removed.json()).toMatchObject({
    attachmentCleanup: { state: "complete", warning: null },
    discarded: true,
  });
  expect(deleted.length).toBe(before);
  expect(
    new Uint8Array(await (await fetch(current.file_link)).arrayBuffer())
  ).toEqual(replacement);
  const denied = await app.handle(
    new Request(`http://test.local/api/admin/responses/${other.response.id}`, {
      body: JSON.stringify({ confirm: true }),
      headers: {
        Authorization: `Bearer ${viewer.bearer}`,
        "Content-Type": "application/json",
      },
      method: "DELETE",
    })
  );
  expect(denied.status).toBe(403);
  const last = await app.handle(
    new Request(`http://test.local/api/responses/${other.response.id}`, {
      headers: { Authorization: `Bearer ${other.bearer}` },
      method: "DELETE",
    })
  );
  expect(last.status).toBe(200);
  expect(await last.json()).toMatchObject({
    attachmentCleanup: { state: "complete", warning: null },
    discarded: true,
  });
  expect(deleted.slice(before)).toEqual([current.file_token]);
  expect((await fetch(current.file_link)).status).toBe(404);
  expect(received.length).toBe(uploads);
  const tracked = await followUpFor(admin, surviving.operationId);
  expect(tracked).toMatchObject({ responseDeleted: true });
  expect(tracked.versions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        canDelete: false,
        cleanupState: "deleted",
        id: surviving.id,
        state: "deleted",
      }),
    ])
  );
});

test("whole-Response deletion retires its references and deletes only unshared Folio files after rows are gone", async () => {
  const owner = await fixture();
  const admin = await fixture({ admin: true });
  const other = await fixture();
  const saved = await poll(
    owner,
    await send(owner, { folio_other: file(), folio_proof: file() })
  );
  expect(saved.status).toBe("completed");
  const canonical = await draft(owner);
  const unshared = attachmentSchema.parse(canonical.proof);
  const shared = attachmentSchema.parse(canonical.other);
  const sharedVersion = await prisma.ecmAttachmentVersion.findFirstOrThrow({
    where: { fileToken: shared.file_token },
  });
  const sharedSnapshot = `shared-${crypto.randomUUID()}`;
  await prisma.ecmAttachmentReference.create({
    data: {
      responseId: other.response.id,
      snapshotId: sharedSnapshot,
      versionId: sharedVersion.id,
    },
  });
  const released = await app.handle(
    new Request(`http://test.local/api/editor-leases/${owner.lease.id}`, {
      headers: { Authorization: `Bearer ${owner.bearer}` },
      method: "DELETE",
    })
  );
  expect(released.status).toBe(200);
  const before = deleted.length;
  const removed = await app.handle(
    new Request(`http://test.local/api/admin/responses/${owner.response.id}`, {
      body: JSON.stringify({ confirm: true }),
      headers: {
        Authorization: `Bearer ${admin.bearer}`,
        "Content-Type": "application/json",
      },
      method: "DELETE",
    })
  );
  expect(removed.status).toBe(200);
  expect(
    await prisma.response.findUnique({ where: { id: owner.response.id } })
  ).toBeNull();
  expect(
    await prisma.operation.count({ where: { responseId: owner.response.id } })
  ).toBe(0);
  expect(deleted.slice(before)).toEqual([unshared.file_token]);
  expect(
    deleteSnapshots.find((entry) => entry.token === unshared.file_token)
  ).toMatchObject({ data: undefined, references: 0 });
  expect(
    await prisma.ecmAttachmentReference.count({
      where: { responseId: owner.response.id },
    })
  ).toBe(0);
  expect(
    await prisma.ecmAttachmentReference.findUnique({
      where: {
        versionId_snapshotId: {
          snapshotId: sharedSnapshot,
          versionId: sharedVersion.id,
        },
      },
    })
  ).not.toBeNull();
  const sharedFile = await fetch(shared.file_link);
  const unsharedFile = await fetch(unshared.file_link);
  expect(sharedFile.status).toBe(200);
  expect(unsharedFile.status).toBe(404);
  expect(await removed.json()).toMatchObject({
    attachmentCleanup: { state: "complete", warning: null },
    deleted: true,
  });
});

test.each(["failed", "unknown"] as const)(
  "whole-Response deletion keeps durable %s file cleanup separate from deleted data without retry",
  async (mode) => {
    const owner = await fixture({ templateMode: true });
    const admin = await fixture({ admin: true });
    const saved = await poll(owner, await send(owner, { folio_proof: file() }));
    expect(saved.status).toBe("completed");
    await resume(owner);
    const original = attachmentSchema.parse((await draft(owner)).proof);
    customToken = original.file_token;
    customLink = original.file_link;
    const replacement = await poll(
      owner,
      await send(owner, { folio_proof: file(new Uint8Array([66])) })
    );
    expect(replacement.status).toBe("completed");
    const savedDraft = await draft(owner);
    const proof = attachmentSchema.parse(savedDraft.proof);
    deleteFails = mode === "failed";
    deleteMalformed = mode === "unknown";
    const before = deleted.length;
    try {
      const removed = await app.handle(
        new Request(`http://test.local/api/responses/${owner.response.id}`, {
          headers: { Authorization: `Bearer ${owner.bearer}` },
          method: "DELETE",
        })
      );
      expect(removed.status).toBe(200);
      expect(
        await prisma.response.findUnique({ where: { id: owner.response.id } })
      ).toBeNull();
      expect(deleted.slice(before)).toEqual([proof.file_token]);
      const outcome = z
        .object({
          attachmentCleanup: z.object({
            caseReference: z.string().min(1),
            state: z.literal("pending"),
            warning: z.string().min(1),
          }),
          discarded: z.literal(true),
        })
        .parse(await removed.json());
      const tracking = await followUpFor(admin, saved.operationId);
      expect(tracking).toMatchObject({
        responseDeleted: true,
        responseId: owner.response.id,
      });
      expect(tracking.versions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            canDelete: false,
            cleanupState: expect.stringMatching(/^(pending|unknown)$/u),
            referenced: false,
          }),
        ])
      );
      const repeated = await app.handle(
        new Request(`http://test.local/api/responses/${owner.response.id}`, {
          headers: { Authorization: `Bearer ${owner.bearer}` },
          method: "DELETE",
        })
      );
      expect(repeated.status).toBe(200);
      expect(await repeated.json()).toMatchObject(outcome);
      expect(deleted.slice(before)).toEqual([proof.file_token]);
      const accountRemoval = await app.handle(
        new Request(`http://test.local/api/admin/users/${owner.identity.id}`, {
          body: JSON.stringify({ confirm: true }),
          headers: {
            Authorization: `Bearer ${admin.bearer}`,
            "Content-Type": "application/json",
          },
          method: "DELETE",
        })
      );
      expect(accountRemoval.status).toBe(409);
      expect(await accountRemoval.json()).toMatchObject({
        error: "personal_data_remains",
      });
      const results = await app.handle(
        new Request(
          `http://test.local/api/admin/results?form=${owner.form.publicId}`,
          { headers: { Authorization: `Bearer ${admin.bearer}` } }
        )
      );
      expect(results.status).toBe(200);
      expect(await results.json()).toMatchObject({ results: [] });
      const publicFile = await fetch(proof.file_link);
      expect(publicFile.status).toBe(mode === "failed" ? 200 : 404);
    } finally {
      deleteFails = false;
      deleteMalformed = false;
    }
  }
);

test.each(["other Draft", "other Submission", "own Submission"] as const)(
  "whole-Response deletion rejects Admin User-route bypass for %s",
  async (scope) => {
    const admin = await fixture({ admin: true });
    const owner = scope === "own Submission" ? admin : await fixture();
    if (scope !== "other Draft") {
      const submitted = await poll(
        owner,
        await send(owner, { folio_proof: file() }, "submit")
      );
      expect(submitted.status).toBe("completed");
    }
    const before = deleted.length;
    const removed = await app.handle(
      new Request(`http://test.local/api/responses/${owner.response.id}`, {
        headers: { Authorization: `Bearer ${admin.bearer}` },
        method: "DELETE",
      })
    );
    expect(removed.status).toBe(scope === "own Submission" ? 409 : 403);
    expect(
      await prisma.response.findUnique({ where: { id: owner.response.id } })
    ).not.toBeNull();
    expect(deleted.length).toBe(before);
  }
);

test("whole-Response deletion still permits Admin to discard their own active Draft", async () => {
  const admin = await fixture({ admin: true });
  const removed = await app.handle(
    new Request(`http://test.local/api/responses/${admin.response.id}`, {
      headers: { Authorization: `Bearer ${admin.bearer}` },
      method: "DELETE",
    })
  );
  expect(removed.status).toBe(200);
  expect(await removed.json()).toMatchObject({ discarded: true });
  expect(
    await prisma.response.findUnique({ where: { id: admin.response.id } })
  ).toBeNull();
});

test("whole-Response deletion snapshots Submission, Correction, workspace and Operation evidence before cascade", async () => {
  const owner = await fixture();
  const admin = await fixture({ admin: true });
  const submitted = await poll(
    owner,
    await send(owner, { folio_other: file(), folio_proof: file() }, "submit")
  );
  expect(submitted.status).toBe("completed");
  const bridge = await openCorrection(owner, admin);
  snapshots.set(
    bridge.documentKey,
    replaceCell(
      fixtureValue(snapshots.get(bridge.documentKey)),
      "B2",
      "DELETION.CORRECTION"
    )
  );
  const corrected = await poll(
    admin,
    await postCorrection(owner, admin, bridge)
  );
  expect(corrected.status).toBe("completed");
  const workspace = await openCorrection(owner, admin);
  const checkpoint = await poll(
    admin,
    await postCorrection(owner, admin, workspace, {}, {}, true)
  );
  expect(checkpoint.status).toBe("completed");
  const versions = await prisma.ecmAttachmentVersion.findMany({
    where: { responseId: owner.response.id },
  });
  expect(versions).toHaveLength(4);
  const references = await prisma.ecmAttachmentReference.findMany({
    where: { responseId: owner.response.id },
  });
  expect(references.length).toBeGreaterThan(versions.length);
  const leases = await prisma.editorLease.findMany({
    where: { targetId: owner.response.id },
  });
  for (const lease of leases) {
    const released = await app.handle(
      new Request(`http://test.local/api/editor-leases/${lease.id}`, {
        headers: {
          Authorization: `Bearer ${lease.holderUserId === admin.identity.id ? admin.bearer : owner.bearer}`,
        },
        method: "DELETE",
      })
    );
    expect(released.status).toBe(200);
  }
  const before = deleted.length;
  const removed = await app.handle(
    new Request(`http://test.local/api/admin/responses/${owner.response.id}`, {
      body: JSON.stringify({ confirm: true }),
      headers: {
        Authorization: `Bearer ${admin.bearer}`,
        "Content-Type": "application/json",
      },
      method: "DELETE",
    })
  );
  expect(removed.status).toBe(200);
  const outcome = z
    .object({
      attachmentCleanup: z.object({
        caseReference: z.string(),
        state: z.literal("complete"),
      }),
    })
    .parse(await removed.json());
  expect(deleted.slice(before).toSorted()).toEqual(
    versions.map((version) => fixtureValue(version.fileToken)).toSorted()
  );
  expect(
    await prisma.submission.count({ where: { responseId: owner.response.id } })
  ).toBe(0);
  expect(
    await prisma.correction.count({ where: { responseId: owner.response.id } })
  ).toBe(0);
  expect(
    await prisma.operation.count({ where: { responseId: owner.response.id } })
  ).toBe(0);
  expect(
    await prisma.ecmAttachmentReference.count({
      where: { responseId: owner.response.id },
    })
  ).toBe(0);
  const retained = await prisma.deletionTombstone.findUniqueOrThrow({
    where: { id: outcome.attachmentCleanup.caseReference },
  });
  expect(retained.ownerUserId).toBe(owner.identity.id);
  expect(retained.attachmentContext).toMatchObject({
    operations: expect.arrayContaining([
      expect.objectContaining({ id: submitted.operationId }),
      expect.objectContaining({ id: corrected.operationId }),
      expect.objectContaining({ id: checkpoint.operationId }),
    ]),
    references: expect.arrayContaining(references),
    versions: expect.arrayContaining(
      versions.map((version) => ({
        id: version.id,
        operationId: version.operationId,
      }))
    ),
  });
  const session = await app.handle(
    new Request("http://test.local/api/session", {
      headers: { Authorization: `Bearer ${owner.bearer}` },
    })
  );
  expect(session.status).toBe(401);
});

test("whole-Response deletion retains pending cases across fresh application instances without another DELETE", async () => {
  const owner = await fixture();
  const admin = await fixture({ admin: true });
  const saved = await poll(owner, await send(owner, { folio_proof: file() }));
  expect(saved.status).toBe("completed");
  deleteFails = true;
  const before = deleted.length;
  try {
    const removed = await app.handle(
      new Request(`http://test.local/api/responses/${owner.response.id}`, {
        headers: { Authorization: `Bearer ${owner.bearer}` },
        method: "DELETE",
      })
    );
    expect(removed.status).toBe(200);
    const outcome = z
      .object({
        attachmentCleanup: z.object({
          caseReference: z.string(),
          state: z.literal("pending"),
          warning: z.string(),
        }),
      })
      .parse(await removed.json());
    const fresh = createApp({
      legacySso: null,
      omniRoute: null,
      pdmsProjects: null,
    });
    const ownStatus = await fresh.handle(
      new Request("http://test.local/api/responses/deletion-status", {
        headers: { Authorization: `Bearer ${owner.bearer}` },
      })
    );
    expect(ownStatus.status).toBe(200);
    expect(await ownStatus.json()).toEqual({
      warnings: [outcome.attachmentCleanup],
    });
    const otherStatus = await fresh.handle(
      new Request("http://test.local/api/responses/deletion-status", {
        headers: { Authorization: `Bearer ${admin.bearer}` },
      })
    );
    expect(await otherStatus.json()).toEqual({ warnings: [] });
    const tracking = await fresh.handle(
      new Request("http://test.local/api/admin/results/attachment-follow-up", {
        headers: { Authorization: `Bearer ${admin.bearer}` },
      })
    );
    expect(tracking.status).toBe(200);
    expect(await tracking.json()).toMatchObject({
      followUps: expect.arrayContaining([
        expect.objectContaining({
          caseReference: outcome.attachmentCleanup.caseReference,
          operationId: saved.operationId,
          responseDeleted: true,
        }),
      ]),
    });
    const repeated = await fresh.handle(
      new Request(`http://test.local/api/responses/${owner.response.id}`, {
        headers: { Authorization: `Bearer ${owner.bearer}` },
        method: "DELETE",
      })
    );
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject(outcome);
    expect(deleted.length).toBe(before + 1);
  } finally {
    deleteFails = false;
  }
});

test("whole-Response deletion fences replay while its initial provider DELETE is in flight", async () => {
  const owner = await fixture();
  const saved = await poll(owner, await send(owner, { folio_proof: file() }));
  expect(saved.status).toBe("completed");
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  deleteBarrier = { enter: () => entered.resolve(), release: released.promise };
  const before = deleted.length;
  const uploads = received.length;
  const removing = app.handle(
    new Request(`http://test.local/api/responses/${owner.response.id}`, {
      headers: { Authorization: `Bearer ${owner.bearer}` },
      method: "DELETE",
    })
  );
  try {
    await entered.promise;
    expect(
      await prisma.response.findUnique({ where: { id: owner.response.id } })
    ).toBeNull();
    const replay = await send(owner, { folio_proof: file() });
    expect(replay.status).toBe(404);
    const repeated = await app.handle(
      new Request(`http://test.local/api/responses/${owner.response.id}`, {
        headers: { Authorization: `Bearer ${owner.bearer}` },
        method: "DELETE",
      })
    );
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({
      attachmentCleanup: { state: "pending" },
      discarded: true,
    });
    expect(deleted.length).toBe(before + 1);
    expect(received.length).toBe(uploads);
  } finally {
    deleteBarrier = null;
    released.resolve();
    await removing;
  }
  expect(
    await prisma.response.findUnique({ where: { id: owner.response.id } })
  ).toBeNull();
  expect(deleted.length).toBe(before + 1);
});

test("whole-Response deletion does not turn archive or Published Form deletion into file cleanup", async () => {
  const owner = await fixture();
  const admin = await fixture({ admin: true });
  const saved = await poll(
    owner,
    await send(owner, { folio_proof: file() }, "submit")
  );
  expect(saved.status).toBe("completed");
  const before = deleted.length;
  const archived = await app.handle(
    new Request(`http://test.local/api/admin/forms/${owner.form.publicId}`, {
      body: JSON.stringify({ status: "archived" }),
      headers: {
        Authorization: `Bearer ${admin.bearer}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    })
  );
  expect(archived.status).toBe(200);
  const forbidden = await app.handle(
    new Request(`http://test.local/api/admin/forms/${owner.form.publicId}`, {
      headers: { Authorization: `Bearer ${admin.bearer}` },
      method: "DELETE",
    })
  );
  expect(forbidden.status).toBe(409);
  expect(
    await prisma.response.findUnique({ where: { id: owner.response.id } })
  ).not.toBeNull();
  expect(
    await prisma.submission.count({ where: { responseId: owner.response.id } })
  ).toBe(1);
  expect(
    await prisma.ecmAttachmentReference.count({
      where: { responseId: owner.response.id },
    })
  ).toBeGreaterThan(0);
  expect(deleted.length).toBe(before);
});

test("whole-Response deletion prevents a paused pre-admission sender from reviving deleted data", async () => {
  const owner = await fixture();
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  captureBarrier = {
    enter: () => entered.resolve(),
    release: released.promise,
  };
  const uploads = received.length;
  const before = deleted.length;
  const lateSender = send(owner, { folio_proof: file() });
  try {
    await entered.promise;
    const removed = await app.handle(
      new Request(`http://test.local/api/responses/${owner.response.id}`, {
        headers: { Authorization: `Bearer ${owner.bearer}` },
        method: "DELETE",
      })
    );
    expect(removed.status).toBe(200);
    captureBarrier = null;
    released.resolve();
    const rejected = await lateSender;
    // Deletion revokes both lease and Response; either admission fence may reject first.
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.status).toBeLessThan(500);
    expect(
      await prisma.response.findUnique({ where: { id: owner.response.id } })
    ).toBeNull();
    expect(
      await prisma.ecmAttachmentBatch.count({
        where: { responseId: owner.response.id },
      })
    ).toBe(0);
    expect(received.length).toBe(uploads);
    expect(deleted.length).toBe(before);
  } finally {
    captureBarrier = null;
    released.resolve();
    await lateSender;
  }
});

test("whole-Response deletion permits only an Admin first cleanup after proven non-dispatch and rows gone", async () => {
  const owner = await fixture();
  const admin = await fixture({ admin: true });
  const viewer = await fixture({ viewer: true });
  const saved = await poll(owner, await send(owner, { folio_proof: file() }));
  expect(saved.status).toBe("completed");
  const savedDraft = await draft(owner);
  const proof = attachmentSchema.parse(savedDraft.proof);
  const version = await prisma.ecmAttachmentVersion.findFirstOrThrow({
    where: { fileToken: proof.file_token },
  });
  await prisma.ecmAuthState.update({
    data: { expiresAt: new Date(0) },
    where: { accountKey: version.accountKey },
  });
  loginRejects = true;
  const before = deleted.length;
  try {
    const removed = await app.handle(
      new Request(`http://test.local/api/responses/${owner.response.id}`, {
        headers: { Authorization: `Bearer ${owner.bearer}` },
        method: "DELETE",
      })
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({
      attachmentCleanup: { state: "pending" },
      discarded: true,
    });
    expect(
      await prisma.response.findUnique({ where: { id: owner.response.id } })
    ).toBeNull();
    expect(deleted.length).toBe(before);
    const tracking = await followUpFor(admin, saved.operationId);
    const pending = fixtureValue(
      tracking.versions.find((entry) => entry.id === version.id)
    );
    expect(pending).toMatchObject({
      canDelete: true,
      cleanupState: "pending",
      deleteAttemptedAt: null,
      state: "committed",
    });
    loginRejects = false;
    const denied = await operatorAction(viewer, saved.operationId, "settle", {
      generation: pending.generation,
      versionId: pending.id,
    });
    expect(denied.status).toBe(403);
    expect(deleted.length).toBe(before);
    const settled = await operatorAction(admin, saved.operationId, "settle", {
      generation: pending.generation,
      versionId: pending.id,
    });
    expect(settled.status).toBe(200);
    expect(deleted.slice(before)).toEqual([proof.file_token]);
    const complete = await followUpFor(admin, saved.operationId);
    expect(complete).toMatchObject({ responseDeleted: true });
    expect(complete.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canDelete: false,
          cleanupState: "deleted",
          confirmedBy: admin.identity.id,
          id: pending.id,
        }),
      ])
    );
    const ownStatus = await app.handle(
      new Request("http://test.local/api/responses/deletion-status", {
        headers: { Authorization: `Bearer ${owner.bearer}` },
      })
    );
    expect(await ownStatus.json()).toEqual({ warnings: [] });
    const repeated = await operatorAction(admin, saved.operationId, "settle", {
      generation: pending.generation,
      versionId: pending.id,
    });
    expect(repeated.status).toBe(409);
    expect(deleted.length).toBe(before + 1);
    const accountRemoval = await app.handle(
      new Request(`http://test.local/api/admin/users/${owner.identity.id}`, {
        body: JSON.stringify({ confirm: true }),
        headers: {
          Authorization: `Bearer ${admin.bearer}`,
          "Content-Type": "application/json",
        },
        method: "DELETE",
      })
    );
    expect(accountRemoval.status).toBe(200);
  } finally {
    loginRejects = false;
  }
});
