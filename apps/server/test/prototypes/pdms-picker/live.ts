// oxlint-disable complexity sort-keys -- Test-only fixture keeps document/plugin payloads together for runtime inspection.
// Explicitly launched, isolated real-editor feasibility fixture; never production routes.
import { createHmac } from "node:crypto";

import { prisma } from "@onlyoffice/db";
import { env } from "@onlyoffice/env/server";
import { Elysia } from "elysia";

import { createApp } from "../../../src/app";
import { spreadsheetBindingSchema } from "../../../src/documents/spreadsheets/contract";
import {
  processSpreadsheet,
  registerSpreadsheetBuilderRoutes,
} from "../../../src/documents/spreadsheets/engine";
import {
  protectSpreadsheet,
  unprotectSpreadsheet,
} from "../../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  XLSX_CONTENT_TYPE,
} from "../../../src/documents/spreadsheets/workbook";
import { actionEditorCapability } from "../../../src/editor/authorization";
import { claimEditorLease } from "../../../src/editor/leases";
import { spreadsheetManifestFieldData } from "../../../src/forms/spreadsheet-fields";
import {
  createOnlyOfficeAuthorization,
  createOnlyOfficeClient,
  verifyOnlyOfficeAuthorization,
} from "../../../src/onlyoffice";
import { putObject, readObject } from "../../../src/storage";
import { fixtureWorkbook } from "../../spreadsheet-unit/fixture";
import { startPickerPrototype } from "./server";

if (
  !process.env.FOLIO_TEST_DB?.startsWith("folio_pdms_01_") ||
  !env.RUSTFS_BUCKET.startsWith("folio-pdms-01-")
) {
  throw new Error("Explicit ticket01 isolated database and bucket required");
}
const directory = import.meta.dir;
const pickerBuild = await Bun.build({
  entrypoints: [`${directory}/picker.js`],
  target: "browser",
  format: "iife",
});
if (!pickerBuild.success || !pickerBuild.outputs[0]) {
  throw new Error("Prototype plugin build failed");
}
const [pickerBundle] = pickerBuild.outputs;
const guid = "asc.{376E971A-1091-40BB-A36E-AF206BFBCB01}";
const port = Number(process.env.PDMS_PROTOTYPE_PORT ?? 58_101);
const origin = `http://localhost:${port}`;
const officeOrigin = env.ONLYOFFICE_URL.replace(/\/$/u, "");
const documentOrigin = `http://host.docker.internal:${port}`;
const id = crypto.randomUUID();
let documentKey = `pdms-proof-${id}`;
const publicId = crypto.randomUUID().replaceAll("-", "");
const publishedId = crypto.randomUUID();
const responseId = crypto.randomUUID();
const userId = crypto.randomUUID();
const objectKey = `prototype/${id}/draft.xlsx`;
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_project",
      id: "folio_project",
      key: "project",
      label: "โครงการ",
      type: "text",
    },
    {
      anchor: "folio_note",
      id: "folio_note",
      key: "note",
      label: "บันทึก",
      type: "text",
    },
  ],
  table: {
    anchor: "folio_items",
    columns: [
      {
        id: "folio_item_project",
        key: "project",
        label: "โครงการ",
        offset: 0,
        type: "text",
      },
      {
        id: "folio_item_note",
        key: "note",
        label: "บันทึก",
        offset: 1,
        type: "text",
      },
    ],
    id: "folio_items",
    key: "items",
    label: "รายการ",
  },
  version: 1,
});
const initial = fixtureWorkbook({
  cells: [
    { address: "C1", value: "ordinary input" },
    { address: "B4", value: "row note" },
  ],
  merges: ["A1:B1"],
  names: {
    folio_items: "'Form'!$A$4:$B$6",
    folio_note: "'Form'!$C$1",
    folio_project: "'Form'!$A$1:$B$1",
  },
});
const protectManaged = (bytes: Uint8Array) => {
  const contract = resolveSpreadsheetContract(
    bindings,
    readSpreadsheetWorkbook(bytes)
  );
  const locked = {
    ...contract,
    table: contract.table
      ? {
          ...contract.table,
          columns: contract.table.columns.map((column) =>
            column.key === "project" ? { ...column, computed: true } : column
          ),
        }
      : null,
  };
  return protectSpreadsheet(bytes, locked, new Set(["project"]));
};
let protectedBytes = protectManaged(initial);
await putObject(objectKey, protectedBytes, XLSX_CONTENT_TYPE);
await prisma.user.create({
  data: {
    email: `${id}@example.test`,
    id: userId,
    name: "Prototype User",
    role: "user",
  },
});
await prisma.form.create({
  data: {
    documentKind: "xlsx",
    fillMethod: "onlyoffice",
    id,
    publicId,
    publishedTemplate: {
      create: {
        contentHash: id,
        documentKey,
        id: publishedId,
        manifest: {
          create: {
            configurationHash: id,
            fields: { create: spreadsheetManifestFieldData(bindings) },
          },
        },
        objectKey,
        version: 1,
      },
    },
    status: "published",
    title: "PDMS protected picker proof",
    version: 1,
  },
});
await prisma.response.create({
  data: {
    draftDocumentKey: documentKey,
    draftObjectKey: objectKey,
    formId: id,
    id: responseId,
    publishedTemplateId: publishedId,
    publishedVersion: 1,
    spreadsheetInitialized: true,
    status: "draft",
    userId,
  },
});
const sessionId = crypto.randomUUID();
const sessionToken = crypto.randomUUID();
await prisma.session.create({
  data: {
    expiresAt: new Date(Date.now() + 3_600_000),
    id: sessionId,
    token: sessionToken,
    userId,
  },
});
const identity = {
  email: `${id}@example.test`,
  expiresAt: new Date(Date.now() + 3_600_000),
  id: userId,
  isSso: false,
  mustChangePassword: false,
  name: "Prototype User",
  role: "user" as const,
  sessionId,
};
const scope = {
  documentKey,
  formId: id,
  targetId: responseId,
  targetType: "response" as const,
};
const lease = await claimEditorLease(identity, "response", responseId, id);
let saveCapability = actionEditorCapability(
  identity,
  scope,
  "save-draft",
  lease
);
const office = createOnlyOfficeClient();
let intended: Record<string, string> = {};
let savedSelections: Record<string, string> = {};
let staged: Uint8Array | null = null;
let capture: ((bytes: Uint8Array) => void) | null = null;
let snapshot: Uint8Array | null = null;
let expectedInputs: { note: string; rowNote: string } | undefined;
const events: unknown[] = [];
const inputMatches = (bytes: Uint8Array) => {
  const workbook = readSpreadsheetWorkbook(bytes);
  return (
    !expectedInputs ||
    (String(workbook.cells.get("C1")?.value ?? "") === expectedInputs.note &&
      String(workbook.cells.get("B4")?.value ?? "") === expectedInputs.rowNote)
  );
};
const app = createApp({
  legacySso: null,
  omniRoute: null,
  onlyOffice: {
    ...office,
    forceSave: async (key) => {
      const pending = Promise.withResolvers<Uint8Array>();
      capture = pending.resolve;
      let native: Uint8Array;
      if (process.env.PDMS_PROTOTYPE_NATIVE_SNAPSHOT) {
        if (process.env.RUN_PDMS_PICKER_PROTOTYPE_HTTP !== "1") {
          throw new Error(
            "Synthetic transport is allowed only in the explicit HTTP test run"
          );
        }
        native = new Uint8Array(
          await Bun.file(
            process.env.PDMS_PROTOTYPE_NATIVE_SNAPSHOT
          ).arrayBuffer()
        );
      } else {
        const result = await office.forceSave(key, "prototype-capture");
        if (result === true) {
          const timeout = setTimeout(
            () =>
              pending.reject(new Error("Snapshot timeout; editor retained")),
            60_000
          );
          try {
            native = await pending.promise;
          } finally {
            clearTimeout(timeout);
          }
        } else if (result === false) {
          native = snapshot ?? protectedBytes;
        } else {
          const download = await fetch(result.url, {
            headers: {
              Authorization: createOnlyOfficeAuthorization({ url: result.url }),
            },
          });
          native = new Uint8Array(await download.arrayBuffer());
        }
      }
      if (
        !inputMatches(native) &&
        !process.env.PDMS_PROTOTYPE_NATIVE_SNAPSHOT
      ) {
        const timeout = setTimeout(
          () =>
            pending.reject(
              new Error("Native snapshot has not caught up; editor retained")
            ),
          10_000
        );
        try {
          native = await pending.promise;
        } finally {
          clearTimeout(timeout);
        }
      }
      capture = null;
      if (!inputMatches(native)) {
        throw new Error("Unsaved input mismatch; editor retained");
      }
      const resultWorkbook = await processSpreadsheet(
        unprotectSpreadsheet(native),
        {
          bindings,
          values: Object.entries(intended).map(([target, value]) => ({
            address: target === "project" ? "A1" : "A4",
            value,
          })),
        }
      );
      staged = protectManaged(resultWorkbook.workbook);
      const before = readSpreadsheetWorkbook(native);
      const after = readSpreadsheetWorkbook(staged);
      for (const [address, cell] of before.cells) {
        if (["A1", "A4"].includes(address)) {
          continue;
        }
        const next = after.cells.get(address);
        if (
          JSON.stringify([cell.value, cell.formula]) !==
          JSON.stringify([next?.value, next?.formula])
        ) {
          throw new Error(`Unsaved content did not survive: ${address}`);
        }
      }
      events.push({
        cells: before.cells.size,
        kind: "preserved-snapshot",
        note: after.cells.get("C1")?.value,
        rowNote: after.cells.get("B4")?.value,
      });
      return { url: `${origin}/prototype/staged` };
    },
  },
  onlyOfficeCallbackOrigins: [origin],
  putObject: (key, bytes, type) =>
    putObject(
      key,
      type === XLSX_CONTENT_TYPE ? protectManaged(bytes) : bytes,
      type
    ),
});
const builder = new Elysia();
registerSpreadsheetBuilderRoutes(builder);
let nativeUrl = "";
let protectedOperationId = "";
let operation: { operationId: string; operationCapability: string } | null =
  null;
const sign = (payload: unknown) => {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.${createHmac("sha256", env.ONLYOFFICE_JWT_SECRET).update(`${header}.${body}`).digest("base64url")}`;
};
const startSave = async (
  expected?: { note: string; rowNote: string },
  rowChange?: { action: "insert" | "delete"; index: number }
) => {
  expectedInputs = expected;
  const freshLease = await claimEditorLease(
    identity,
    "response",
    responseId,
    id
  );
  saveCapability = actionEditorCapability(
    identity,
    { ...scope, documentKey },
    "save-draft",
    freshLease
  );
  const response = await app.handle(
    new Request(`${origin}/api/forms/${publicId}/draft`, {
      body: JSON.stringify({
        documentKey,
        responseId,
        ...(rowChange ? { rowChange } : {}),
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Editor-Capability": saveCapability,
      },
      method: "POST",
    })
  );
  const body = await response.json();
  if (response.status !== 202) {
    throw new Error(JSON.stringify(body));
  }
  operation = body;
  return body;
};
const prototype = await startPickerPrototype({
  async fallback(request, context) {
    intended = context.selections;
    const url = new URL(request.url);
    const auth = request.headers.get("X-Prototype-Session") === context.session;
    if (url.pathname === "/") {
      const saved = await prisma.response.findUniqueOrThrow({
        where: { id: responseId },
      });
      if (saved.draftDocumentKey !== documentKey) {
        if (!saved.draftDocumentKey || !saved.draftObjectKey) {
          throw new Error("Saved workbook unavailable; editor retained");
        }
        documentKey = saved.draftDocumentKey;
        snapshot = null;
        protectedBytes = await readObject(saved.draftObjectKey);
        const nextLease = await claimEditorLease(
          identity,
          "response",
          responseId,
          id
        );
        saveCapability = actionEditorCapability(
          identity,
          { ...scope, documentKey },
          "save-draft",
          nextLease
        );
      }
      const config = {
        document: {
          fileType: "xlsx",
          key: documentKey,
          permissions: { download: true, edit: true, print: true },
          title: "PDMS protected picker proof.xlsx",
          url: `${documentOrigin}/prototype/workbook`,
        },
        documentType: "cell",
        editorConfig: {
          callbackUrl: `${documentOrigin}/prototype/callback`,
          customization: { autosave: true, forcesave: true, plugins: true },
          lang: "en",
          mode: "edit",
          plugins: {
            autostart: [guid],
            pluginsData: [`${origin}/prototype/plugin/config.json`],
          },
          user: { id: userId, name: "Prototype User" },
        },
        height: "100%",
        type: "desktop",
        width: "100%",
      };
      return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><title>PDMS protected picker proof</title><style>html,body{height:100%;overflow:hidden}</style></head><body style="margin:0"><div id="editor" style="height:100vh"></div><script src="${officeOrigin}/web-apps/apps/api/documents/api.js"></script><div id="barrier" hidden tabindex="0" style="position:fixed;inset:0;z-index:99999;background:#ffffffdd;padding:40px">กำลังบันทึกข้อมูลทั้งหมดและเปิดเอกสารอีกครั้ง…</div><script>let dirty=false,pendingFreeze=null;const ack=()=>{if(pendingFreeze&&!dirty){pendingFreeze.source.postMessage({type:"frozen",nonce:pendingFreeze.nonce},location.origin);pendingFreeze=null;}};addEventListener("message",e=>{if(e.origin!==location.origin)return;const b=document.getElementById("barrier");if(e.data.type==="freeze"){b.hidden=false;b.focus();document.querySelector("iframe").inert=true;pendingFreeze={source:e.source,nonce:e.data.nonce};ack();}if(e.data.type==="reload")location.reload();if(e.data.type==="unfreeze"){b.hidden=true;document.querySelector("iframe").inert=false;}});new DocsAPI.DocEditor('editor',${JSON.stringify({ ...config, token: sign(config) }).replace(/\}$/u, ',"events":{"onDocumentStateChange":function(e){dirty=e.data;if(!dirty)ack();}}}')});</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }
    if (url.pathname === "/prototype/staged" && staged) {
      return new Response(staged, {
        headers: { "Content-Type": XLSX_CONTENT_TYPE },
      });
    }
    if (url.pathname === "/prototype/workbook") {
      return new Response(protectedBytes, {
        headers: { "Content-Type": XLSX_CONTENT_TYPE },
      });
    }
    if (url.pathname === "/prototype/plugin/config.json") {
      return Response.json(
        {
          guid,
          name: "PDMS prototype",
          variations: [
            {
              EditorsSupport: ["cell"],
              description: "Search protected project cells",
              url: "index.html",
              icons: [],
              isVisual: true,
              isInsideMode: false,
              isModal: false,
              type: "panelRight",
              isActivated: true,
              buttons: [],
              initDataType: "none",
              initData: "",
              events: ["onDocumentContentReady", "onTargetPositionChanged"],
            },
          ],
        },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }
    if (url.pathname === "/prototype/plugin/index.html") {
      const html = await Bun.file(`${directory}/panel.html`).text();
      return new Response(
        html
          .replace("__SESSION__", context.session)
          .replace("__OFFICE__", officeOrigin),
        { headers: { "Content-Type": "text/html" } }
      );
    }
    if (url.pathname === "/prototype/plugin/picker.js") {
      return new Response(pickerBundle, {
        headers: { "Content-Type": "text/javascript" },
      });
    }
    if (url.pathname === "/prototype/event" && auth) {
      events.push(await request.json());
      return Response.json({ ok: true });
    }
    if (url.pathname === "/prototype/evidence" && auth) {
      return Response.json({
        events,
        selections: context.selections,
        revision: context.revision,
        operation,
      });
    }
    if (url.pathname === "/prototype/callback") {
      const bytes = await request.arrayBuffer();
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (body.key !== documentKey) {
        return Response.json({ error: 0 });
      }
      if (
        !verifyOnlyOfficeAuthorization(
          request.headers.get("authorization"),
          body
        )
      ) {
        return Response.json({ error: 1 }, { status: 401 });
      }
      events.push({
        keyMatches: body.key === documentKey,
        kind: "callback",
        status: body.status,
      });
      if (body.url && body.status === 6) {
        nativeUrl = body.url;
        const download = await fetch(nativeUrl, {
          headers: {
            Authorization: createOnlyOfficeAuthorization({ url: nativeUrl }),
          },
        });
        snapshot = new Uint8Array(await download.arrayBuffer());
        const workbook = readSpreadsheetWorkbook(snapshot);
        events.push({
          kind: "native-snapshot",
          note: workbook.cells.get("C1")?.value,
          rowNote: workbook.cells.get("B4")?.value,
        });
        capture?.(snapshot);
      }
      return Response.json({ error: 0 });
    }
    if (url.pathname === "/prototype/save" && auth) {
      return Response.json(await startSave(await request.json()), {
        status: 202,
      });
    }
    if (url.pathname === "/prototype/row" && auth) {
      const expected = await request.json();
      return Response.json(
        await startSave(expected, { action: "insert", index: 1 }),
        { status: 202 }
      );
    }
    if (url.pathname === "/prototype/poll" && auth && operation) {
      const response = await app.handle(
        new Request(`${origin}/api/operations/${operation.operationId}`, {
          headers: { "X-Editor-Capability": operation.operationCapability },
        })
      );
      const body = await response.json();
      if (body.operation?.status === "completed") {
        if (protectedOperationId !== operation.operationId) {
          const saved = await prisma.response.findUniqueOrThrow({
            where: { id: responseId },
          });
          if (!saved.draftObjectKey) {
            throw new Error("Completed artifact unavailable");
          }
          const bytes = await readObject(saved.draftObjectKey);
          await putObject(
            saved.draftObjectKey,
            protectManaged(bytes),
            XLSX_CONTENT_TYPE
          );
          protectedOperationId = operation.operationId;
          events.push({ kind: "protected-completion" });
        }
        savedSelections = { ...context.selections };
      }
      if (body.operation?.status === "failed") {
        for (const key of Object.keys(context.selections)) {
          Reflect.deleteProperty(context.selections, key);
        }
        Object.assign(context.selections, savedSelections);
      }
      return Response.json(body, { status: response.status });
    }
    if (url.pathname === "/prototype/export" && auth) {
      return app.handle(
        new Request(`${origin}/api/responses/${responseId}/draft/xlsx`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        })
      );
    }
    if (url.pathname === "/prototype/result" && auth) {
      const headers = { Authorization: `Bearer ${sessionToken}` };
      const dataResponse = await app.handle(
        new Request(`${origin}/api/responses/${responseId}/draft/json`, {
          headers,
        })
      );
      const workbookResponse = await app.handle(
        new Request(`${origin}/api/responses/${responseId}/draft/xlsx`, {
          headers,
        })
      );
      if (!dataResponse.ok || !workbookResponse.ok) {
        throw new Error("Saved exports unavailable");
      }
      const bytes = new Uint8Array(await workbookResponse.arrayBuffer());
      const workbook = readSpreadsheetWorkbook(bytes);
      const data = await dataResponse.json();
      return Response.json({
        data,
        names: Object.fromEntries(workbook.names),
        cells: Object.fromEntries(
          [...workbook.cells].map(([address, cell]) => [address, cell.value])
        ),
      });
    }
    if (url.pathname === "/prototype/force-snapshot" && auth) {
      return Response.json({ result: await office.forceSave(documentKey, "") });
    }
    if (url.pathname.startsWith("/onlyoffice/spreadsheet-jobs/")) {
      return builder.handle(request);
    }
    return app.handle(request);
  },
  onSelection: startSave,
  port,
});
// Private local file, not printed: access capability for verification commands.
await Bun.write(
  process.env.PDMS_PROTOTYPE_STATE_PATH ??
    `/tmp/folio-pdms-implementation/notes/01-session.json`,
  JSON.stringify({
    formId: id,
    origin: prototype.origin,
    responseId,
    session: prototype.session,
  })
);
console.log(
  `Ticket01 live prototype listening on port ${port}; isolated synthetic records created.`
);
