// oxlint-disable sort-keys unicorn/no-await-expression-member no-await-in-loop -- Exercise public revision-fenced document operations in order.
import { afterAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import {
  spreadsheetBindingAnchors,
  spreadsheetColumnAnchor,
  spreadsheetTableColumnsAnchor,
} from "../../src/documents/spreadsheets/columns";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import type { SpreadsheetBindings } from "../../src/documents/spreadsheets/contract";
import { unprotectSpreadsheet } from "../../src/documents/spreadsheets/protection";
import { applySpreadsheetValidation } from "../../src/documents/spreadsheets/validation";
import {
  readSpreadsheetWorkbook,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { spreadsheetDraftFieldData } from "../../src/forms/spreadsheet-fields";
import { pluginGuid } from "../../src/onlyoffice";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import {
  descendants,
  SpreadsheetRuntime,
  workbookXml,
} from "../spreadsheet-runtime/runtime-fixture";
import { fixtureWorkbook, mutatePart } from "../spreadsheet-unit/fixture";

const enabled = process.env.RUN_PDMS_REMOVAL_HTTP === "1";
const workflowTest = enabled ? test : test.skip;
let upstreamRequests = 0;
const readyCatalog = () =>
  Response.json([
    { confirmation_document_number: "DOC-1", name: "Current project" },
  ]);
let upstreamReply: () => Response | Promise<Response> = readyCatalog;
const upstream = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => {
    upstreamRequests += 1;
    return upstreamReply();
  },
});
let snapshot: Uint8Array | null = null;
const native = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(snapshot),
});
const app = createApp({
  legacySso: null,
  omniRoute: null,
  pdmsProjects: {
    baseUrl: upstream.url.origin,
    secret: "synthetic-removal-secret",
  },
  onlyOffice: {
    forceSave: () => Promise.resolve({ url: native.url.href }),
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-fixture")),
  },
  onlyOfficeCallbackOrigins: [native.url.origin],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_208 });
}
afterAll(async () => {
  upstream.stop(true);
  native.stop(true);
  if (enabled) {
    await app.stop();
  }
});

const initialBindings = spreadsheetBindingSchema.parse({
  version: 1,
  fields: [
    {
      id: "folio_project",
      anchor: "folio_project",
      key: "removed_project",
      label: "Removed scalar Title",
      type: "dropdown",
      source: "pdms-project-name",
    },
    {
      id: "folio_static",
      anchor: "folio_static",
      key: "choice",
      label: "Static choice",
      type: "dropdown",
      options: ["Static one", "Static two"],
    },
  ],
  table: {
    id: "folio_rows",
    anchor: "folio_body",
    key: "projects",
    label: "Project rows",
    columns: [
      {
        id: "folio_removed_column",
        key: "removed_column",
        label: "Removed column Title",
        type: "dropdown",
        source: "pdms-project-name",
        offset: 0,
      },
      {
        id: "folio_kept_column",
        key: "kept_project",
        label: "Retained project Title",
        type: "dropdown",
        source: "pdms-project-name",
        offset: 1,
      },
      {
        id: "folio_note_column",
        key: "note",
        label: "Notes",
        type: "text",
        offset: 3,
      },
    ],
  },
});
const names = {
  folio_project: "'Form'!$A$1:$B$1",
  folio_static: "'Form'!$E$1",
  folio_body: "'Form'!$A$4:$D$5",
  [spreadsheetTableColumnsAnchor("folio_rows")]: "'Form'!$A$4:$D$5",
  [spreadsheetColumnAnchor("folio_removed_column")]: "'Form'!$A$4:$A$5",
  [spreadsheetColumnAnchor("folio_kept_column")]: "'Form'!$B$4:$B$5",
  [spreadsheetColumnAnchor("folio_note_column")]: "'Form'!$D$4:$D$5",
  custom_layout: "'Form'!$C$4:$C$5",
};
const request = (
  path: string,
  token: string,
  body?: unknown,
  capability = false,
  method?: string
) =>
  app.handle(
    new Request(`http://test.local${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        [capability ? "X-Editor-Capability" : "Authorization"]: capability
          ? token
          : `Bearer ${token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
interface Config {
  config: {
    document: { key: string };
    editorConfig?: {
      plugins: {
        options: Record<
          string,
          { pdmsProjectCatalog?: Config["pdmsProjectCatalog"] }
        >;
      };
    };
  };
  bridge: { capabilities: Record<string, string> };
  pdmsProjectCatalog?: { sessionId: string; status: string; names: string[] };
}
interface BindingState {
  bindings: SpreadsheetBindings;
  documentKey: string;
  revision: number;
}
const poll = async (response: Response) => {
  if (response.status !== 202) {
    throw new Error(
      `Unexpected action response: ${response.status} ${await response.text()}`
    );
  }
  expect(response.status).toBe(202);
  const job = (await response.json()) as {
    operationId: string;
    operationCapability: string;
  };
  for (let count = 0; count < 300; count += 1) {
    const result = await request(
      `/api/operations/${job.operationId}`,
      job.operationCapability,
      undefined,
      true
    );
    expect(result.status).toBe(200);
    const { operation } = (await result.json()) as {
      operation: {
        status: string;
        error?: string;
        result?: Record<string, unknown>;
      };
    };
    if (["completed", "failed"].includes(operation.status)) {
      return operation;
    }
    await Bun.sleep(100);
  }
  throw new Error("Removal operation did not finish");
};
const fixture = async (customHelper = false) => {
  const id = crypto.randomUUID();
  const publicId = id.replaceAll("-", "");
  const password = `Removal-${id}`;
  const admin = await createCredentialFixture({
    email: `removal-admin-${id}@example.test`,
    name: "Removal author",
    password,
    role: "admin",
  });
  const user = await createCredentialFixture({
    email: `removal-user-${id}@example.test`,
    name: "Removal user",
    password,
  });
  const adminToken = await bearerFor(app, admin.email, password);
  const userToken = await bearerFor(app, user.email, password);
  snapshot = mutatePart(
    fixtureWorkbook({
      names,
      merges: ["A1:B1"],
      cells: [
        { address: "A1", value: "Visible removed scalar", style: 1 },
        { address: "A4", value: "Visible removed column", style: 1 },
        { address: "B5", value: "Visible retained project" },
        { address: "C4", value: "Visible unmapped custom column" },
        { address: "D4", value: "Template note" },
        { address: "E1", value: "Static one" },
      ],
    }),
    "xl/worksheets/sheet1.xml",
    (xml) =>
      xml.replace(
        "</worksheet>",
        '<dataValidations count="1"><dataValidation type="list" sqref="C4:C5" allowBlank="1"><formula1>"Custom one,Custom two"</formula1></dataValidation></dataValidations></worksheet>'
      )
  );
  if (customHelper) {
    snapshot = applySpreadsheetValidation(snapshot, initialBindings);
    snapshot = mutatePart(snapshot, "xl/worksheets/folio-options.xml", (xml) =>
      xml.replace(
        "</sheetData>",
        '<row r="20"><c r="Z20" t="inlineStr"><is><t>Custom one</t></is></c></row><row r="21"><c r="Z21" t="inlineStr"><is><t>Custom two</t></is></c></row></sheetData>'
      )
    );
    snapshot = mutatePart(snapshot, "xl/workbook.xml", (xml) =>
      xml.replace(
        "</definedNames>",
        '<definedName name="_folio_options_author_custom" hidden="1">\'_folio_options\'!$Z$20:$Z$21</definedName><definedName name="author_project_choices">_folio_options_author_custom</definedName><definedName name="local_options" localSheetId="0">\'_folio_options\'!$Z$20:$Z$21</definedName><definedName name="local_options" localSheetId="1">\'_folio_options\'!$A$1:$A$2</definedName></definedNames>'
      )
    );
    snapshot = mutatePart(snapshot, "xl/worksheets/sheet1.xml", (xml) =>
      xml
        .replace('"Custom one,Custom two"', "_folio_options_author_custom")
        .replace('sqref="C4:C5"', 'sqref="C4:C5 E1"')
    );
  }
  const objectKey = `tests/${id}/template.xlsx`;
  await putObject(objectKey, snapshot, XLSX_CONTENT_TYPE);
  await prisma.form.create({
    data: {
      id,
      publicId,
      documentKind: "xlsx",
      title: "PDMS removal fixture",
      templateDraft: {
        create: {
          documentKey: `template-${id}`,
          objectKey,
          bindingRevision: 1,
          fieldRules: { create: spreadsheetDraftFieldData(initialBindings) },
        },
      },
    },
  });
  return { publicId, adminToken, userToken };
};
const config = async (
  publicId: string,
  token: string,
  openingId = crypto.randomUUID()
) => {
  const response = await request(
    `/api/admin/forms/${publicId}/editor-config?pdmsOpeningId=${openingId}`,
    token
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as Config;
  return {
    ...result,
    pdmsProjectCatalog:
      result.config.editorConfig?.plugins.options[pluginGuid]
        ?.pdmsProjectCatalog,
  };
};
const bindingState = async (publicId: string, editor: Config) => {
  const response = await request(
    `/api/admin/forms/${publicId}/spreadsheet-bindings`,
    editor.bridge.capabilities["configure-fields"] as string,
    undefined,
    true
  );
  expect(response.status).toBe(200);
  return (await response.json()) as BindingState;
};
const remove = async (
  publicId: string,
  editor: Config,
  state: BindingState,
  kind: "field" | "column" | "table",
  id: string
) => {
  const response = await request(
    `/api/admin/forms/${publicId}/spreadsheet-bindings`,
    editor.bridge.capabilities["configure-fields"] as string,
    {
      documentKey: state.documentKey,
      revision: state.revision,
      change: { action: "delete", kind, id },
    },
    true,
    "PATCH"
  );
  expect(response.status).toBe(200);
  return (await response.json()) as BindingState;
};
const removeNativeNames = (bytes: Uint8Array, removed: string[]) =>
  mutatePart(bytes, "xl/workbook.xml", (xml) => {
    let result = xml;
    for (const name of removed) {
      result = result.replace(
        new RegExp(
          `<definedName\\b[^>]*name="${name}"[^>]*>[\\s\\S]*?</definedName>`,
          "u"
        ),
        ""
      );
    }
    return result;
  });
const anchors = (bytes: Uint8Array, bindings: SpreadsheetBindings) => {
  const book = workbookXml(bytes);
  return spreadsheetBindingAnchors(bindings).map((name) => [
    name,
    book.names[name] ?? null,
  ]);
};
const savedBytes = async (publicId: string, adminToken: string) => {
  const response = await request(
    `/api/admin/forms/${publicId}/template/xlsx`,
    adminToken
  );
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
};
const expectVisibleLayout = (bytes: Uint8Array) => {
  const book = readSpreadsheetWorkbook(bytes);
  expect(book.cells.get("A1")?.value).toBe("Visible removed scalar");
  expect(book.cells.get("A4")?.value).toBe("Visible removed column");
  expect(book.cells.get("C4")?.value).toBe("Visible unmapped custom column");
  expect(book.merges).toEqual([
    { sheet: "Form", firstColumn: 0, lastColumn: 1, firstRow: 0, lastRow: 0 },
  ]);
  const xml = workbookXml(bytes);
  expect(xml.names.custom_layout?.replaceAll("'", "")).toBe("Form!$C$4:$C$5");
  expect(
    descendants(xml.sheet, "dataValidation").map((rule) =>
      (
        rule.attributes.sqref ?? descendants(rule, "sqref")[0]?.text
      )?.replaceAll("$", "")
    )
  ).toContain("C4:C5");
};

test("Admin source removal rejects stale revisions and failed saving keeps a recoverable Template Draft", async () => {
  const f = await fixture();
  const opening = crypto.randomUUID();
  const editor = await config(f.publicId, f.adminToken, opening);
  const before = await bindingState(f.publicId, editor);
  const removed = await remove(
    f.publicId,
    editor,
    before,
    "field",
    "folio_project"
  );
  const stale = await request(
    `/api/admin/forms/${f.publicId}/spreadsheet-bindings`,
    editor.bridge.capabilities["configure-fields"] as string,
    {
      documentKey: before.documentKey,
      revision: before.revision,
      change: { action: "delete", kind: "table", id: "folio_rows" },
    },
    true,
    "PATCH"
  );
  expect(stale.status).toBe(409);
  expect(await bindingState(f.publicId, editor)).toEqual(removed);
  const oldBytes = await savedBytes(f.publicId, f.adminToken);
  let checkpoint = crypto.randomUUID();
  // An old callback lacks the fresh checkpoint required by the existing removal save barrier.
  expect(
    await poll(
      await request(
        `/api/admin/forms/${f.publicId}/save`,
        editor.bridge.capabilities["save-template"] as string,
        {
          documentKey: removed.documentKey,
          spreadsheetAnchors: anchors(oldBytes, removed.bindings),
          preserveEditorSession: true,
          preserveEditorSessionPurpose: "manual",
          spreadsheetSaveCheckpoint: checkpoint,
          spreadsheetUploadPocSnapshot: [],
        },
        true
      )
    )
  ).toMatchObject({ status: "failed", error: "invalid_template" });
  expect(await savedBytes(f.publicId, f.adminToken)).toEqual(oldBytes);
  expect(await bindingState(f.publicId, editor)).toEqual(removed);
  checkpoint = crypto.randomUUID();
  snapshot = removeNativeNames(oldBytes, ["folio_project"]);
  snapshot = mutatePart(snapshot, "xl/workbook.xml", (xml) =>
    xml.replace(
      "</definedNames>",
      `<definedName hidden="1" localSheetId="0" name="_folio_editor_save_checkpoint_${checkpoint.replaceAll("-", "")}">'Form'!$A$1</definedName></definedNames>`
    )
  );
  expect(
    await poll(
      await request(
        `/api/admin/forms/${f.publicId}/save`,
        editor.bridge.capabilities["save-template"] as string,
        {
          documentKey: removed.documentKey,
          spreadsheetAnchors: anchors(snapshot, removed.bindings),
          preserveEditorSession: true,
          preserveEditorSessionPurpose: "manual",
          spreadsheetSaveCheckpoint: checkpoint,
          spreadsheetUploadPocSnapshot: [],
        },
        true
      )
    )
  ).toMatchObject({
    status: "completed",
    result: { documentKey: removed.documentKey, editorSessionPreserved: true },
  });
  const reopened = await config(f.publicId, f.adminToken, opening);
  expect(
    (await bindingState(f.publicId, reopened)).bindings.fields.map(
      (field) => field.key
    )
  ).toEqual(["choice"]);
  expectVisibleLayout(await savedBytes(f.publicId, f.adminToken));
});

test("removing the last project source rejects a Retry that was waiting for the upstream catalog", async () => {
  const f = await fixture();
  const delayed = Promise.withResolvers<Response>();
  try {
    upstreamReply = () => new Response("Unavailable", { status: 503 });
    const editor = await config(f.publicId, f.adminToken);
    expect(editor.pdmsProjectCatalog?.status).toBe("error");
    const started = Promise.withResolvers<undefined>();
    upstreamReply = () => {
      started.resolve();
      return delayed.promise;
    };
    const retry = request(
      "/api/editor/pdms-project-catalog/retry",
      editor.bridge.capabilities["configure-fields"] as string,
      {
        documentKey: editor.config.document.key,
        sessionId: editor.pdmsProjectCatalog?.sessionId,
      },
      true
    );
    await started.promise;
    let state = await bindingState(f.publicId, editor);
    state = await remove(f.publicId, editor, state, "field", "folio_project");
    await remove(f.publicId, editor, state, "table", "folio_rows");
    delayed.resolve(readyCatalog());
    expect((await retry).status).toBe(409);
    expect(
      (await config(f.publicId, f.adminToken)).pdmsProjectCatalog
    ).toBeUndefined();
  } finally {
    delayed.resolve(readyCatalog());
    upstreamReply = readyCatalog;
  }
});

workflowTest(
  "removed scalar, column and table mappings stay absent after reopen and publish while published results remain immutable",
  async () => {
    const f = await fixture();
    let editor = await config(f.publicId, f.adminToken);
    let state = await bindingState(f.publicId, editor);
    state = await remove(f.publicId, editor, state, "field", "folio_project");
    state = await remove(
      f.publicId,
      editor,
      state,
      "column",
      "folio_removed_column"
    );
    snapshot = removeNativeNames(snapshot as Uint8Array, [
      "folio_project",
      spreadsheetColumnAnchor("folio_removed_column"),
    ]);
    expect(
      await poll(
        await request(
          `/api/admin/forms/${f.publicId}/save`,
          editor.bridge.capabilities["save-template"] as string,
          {
            documentKey: state.documentKey,
            spreadsheetAnchors: anchors(snapshot, state.bindings),
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    editor = await config(f.publicId, f.adminToken);
    state = await bindingState(f.publicId, editor);
    expect(state.bindings.fields.map((field) => field.key)).toEqual(["choice"]);
    expect(state.bindings.table?.columns.map((column) => column.key)).toEqual([
      "kept_project",
      "note",
    ]);
    snapshot = await savedBytes(f.publicId, f.adminToken);
    expectVisibleLayout(snapshot);
    expect(
      await poll(
        await request(
          `/api/admin/forms/${f.publicId}/publish`,
          editor.bridge.capabilities.publish as string,
          {
            documentKey: state.documentKey,
            spreadsheetAnchors: anchors(snapshot, state.bindings),
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    const publishedBytes = await savedBytes(f.publicId, f.adminToken);
    expectVisibleLayout(publishedBytes);
    const started = await request(
      `/api/forms/${f.publicId}/start`,
      f.userToken,
      {}
    );
    expect(started.status).toBe(200);
    const { response } = (await started.json()) as { response: { id: string } };
    const getUserConfig = async () =>
      (await (
        await request(
          `/api/forms/${f.publicId}/editor-config?responseId=${response.id}`,
          f.userToken
        )
      ).json()) as Config;
    let userEditor = await getUserConfig();
    const getDraft = async () =>
      new Uint8Array(
        await (
          await request(`/api/responses/${response.id}/draft/xlsx`, f.userToken)
        ).arrayBuffer()
      );
    snapshot = await getDraft();
    const selection = {
      bindingId: "folio_kept_column",
      name: "Current project",
      sessionId: userEditor.pdmsProjectCatalog?.sessionId,
      row: { index: 1, documentKey: userEditor.config.document.key },
    };
    expect(
      await poll(
        await request(
          `/api/forms/${f.publicId}/draft`,
          userEditor.bridge.capabilities["save-draft"] as string,
          {
            documentKey: userEditor.config.document.key,
            responseId: response.id,
            fillMethod: "onlyoffice",
            data: {},
            pdmsCatalogSessionId: userEditor.pdmsProjectCatalog?.sessionId,
            pdmsSelection: selection,
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    userEditor = await getUserConfig();
    snapshot = await getDraft();
    expect(
      await poll(
        await request(
          `/api/forms/${f.publicId}/submit`,
          userEditor.bridge.capabilities.submit as string,
          {
            documentKey: userEditor.config.document.key,
            responseId: response.id,
            fillMethod: "onlyoffice",
            data: {},
            pdmsCatalogSessionId: userEditor.pdmsProjectCatalog?.sessionId,
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    const resultsPath = `/api/forms/${f.publicId}/my-submissions/export`;
    const originalResults = await (
      await request(resultsPath, f.userToken)
    ).json();
    expect(originalResults).toMatchObject([
      {
        data: {
          choice: "Static one",
          projects: [
            { kept_project: null, note: "Template note" },
            { kept_project: "Current project", note: null },
          ],
        },
      },
    ]);
    expect(JSON.stringify(originalResults)).not.toContain("removed_project");
    expect(JSON.stringify(originalResults)).not.toContain("removed_column");
    expect(
      (
        await request(
          `/api/admin/forms/${f.publicId}/editor-config`,
          f.adminToken
        )
      ).status
    ).toBe(409);
    expect(
      (
        await request(
          `/api/admin/forms/${f.publicId}/spreadsheet-bindings`,
          editor.bridge.capabilities["configure-fields"] as string,
          {
            documentKey: state.documentKey,
            revision: state.revision,
            change: { action: "delete", kind: "table", id: "folio_rows" },
          },
          true,
          "PATCH"
        )
      ).status
    ).toBe(409);
    const duplicateResponse = await request(
      `/api/admin/forms/${f.publicId}/duplicate`,
      f.adminToken,
      {}
    );
    expect(duplicateResponse.status).toBe(200);
    const duplicate = (await duplicateResponse.json()) as {
      form: { publicId: string };
    };
    const duplicateId = duplicate.form.publicId;
    editor = await config(duplicateId, f.adminToken);
    expect(editor.pdmsProjectCatalog?.status).toBe("ready");
    state = await bindingState(duplicateId, editor);
    expect(state.bindings.table?.columns[0]?.source).toBe("pdms-project-name");
    const catalog = editor.pdmsProjectCatalog;
    state = await remove(duplicateId, editor, state, "table", "folio_rows");
    snapshot = removeNativeNames(
      await savedBytes(duplicateId, f.adminToken),
      spreadsheetBindingAnchors({
        fields: [],
        table: initialBindings.table,
        version: 1,
      })
    );
    expect(
      await poll(
        await request(
          `/api/admin/forms/${duplicateId}/save`,
          editor.bridge.capabilities["save-template"] as string,
          {
            documentKey: state.documentKey,
            spreadsheetAnchors: anchors(snapshot, state.bindings),
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    const beforeRequests = upstreamRequests;
    editor = await config(duplicateId, f.adminToken);
    expect(editor.pdmsProjectCatalog).toBeUndefined();
    expect(upstreamRequests).toBe(beforeRequests);
    expect((await bindingState(duplicateId, editor)).bindings).toEqual({
      fields: initialBindings.fields.slice(1),
      table: null,
      version: 1,
    });
    expect(
      (
        await request(
          "/api/editor/pdms-project-catalog/retry",
          editor.bridge.capabilities["configure-fields"] as string,
          {
            documentKey: editor.config.document.key,
            sessionId: catalog?.sessionId,
          },
          true
        )
      ).status
    ).toBe(409);
    snapshot = await savedBytes(duplicateId, f.adminToken);
    expectVisibleLayout(snapshot);
    expect(
      await poll(
        await request(
          `/api/admin/forms/${duplicateId}/publish`,
          editor.bridge.capabilities.publish as string,
          {
            documentKey: editor.config.document.key,
            spreadsheetAnchors: anchors(snapshot, state.bindings),
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    expect(await (await request(resultsPath, f.userToken)).json()).toEqual(
      originalResults
    );
    expect(await savedBytes(f.publicId, f.adminToken)).toEqual(publishedBytes);
    const duplicateStart = (await (
      await request(`/api/forms/${duplicateId}/start`, f.userToken, {})
    ).json()) as { response: { id: string } };
    userEditor = (await (
      await request(
        `/api/forms/${duplicateId}/editor-config?responseId=${duplicateStart.response.id}`,
        f.userToken
      )
    ).json()) as Config;
    expect(userEditor.pdmsProjectCatalog).toBeUndefined();
    snapshot = new Uint8Array(
      await (
        await request(
          `/api/responses/${duplicateStart.response.id}/draft/xlsx`,
          f.userToken
        )
      ).arrayBuffer()
    );
    snapshot = mutatePart(snapshot, "xl/worksheets/sheet1.xml", (xml) =>
      xml.replace(
        /<c\b(?=[^>]*\br="E1")[^>]*>[\s\S]*?<\/c>/u,
        '<c r="E1" t="inlineStr"><is><t>Static two</t></is></c>'
      )
    );
    expect(
      await poll(
        await request(
          `/api/forms/${duplicateId}/submit`,
          userEditor.bridge.capabilities.submit as string,
          {
            documentKey: userEditor.config.document.key,
            responseId: duplicateStart.response.id,
            fillMethod: "onlyoffice",
            data: {},
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    expect(
      await (
        await request(
          `/api/forms/${duplicateId}/my-submissions/export`,
          f.userToken
        )
      ).json()
    ).toMatchObject([{ data: { choice: "Static two" } }]);
  },
  120_000
);

workflowTest(
  "removing project mappings preserves custom named option storage used by unrelated validation",
  async () => {
    const f = await fixture(true);
    const editor = await config(f.publicId, f.adminToken);
    let state = await bindingState(f.publicId, editor);
    state = await remove(f.publicId, editor, state, "field", "folio_project");
    state = await remove(f.publicId, editor, state, "table", "folio_rows");
    snapshot = removeNativeNames(snapshot as Uint8Array, [
      "folio_project",
      ...spreadsheetBindingAnchors({
        fields: [],
        table: initialBindings.table,
        version: 1,
      }),
    ]);
    expect(
      await poll(
        await request(
          `/api/admin/forms/${f.publicId}/publish`,
          editor.bridge.capabilities.publish as string,
          {
            documentKey: state.documentKey,
            spreadsheetAnchors: anchors(snapshot, state.bindings),
          },
          true
        )
      )
    ).toMatchObject({ status: "completed" });
    const bytes = await savedBytes(f.publicId, f.adminToken);
    expectVisibleLayout(bytes);
    const xml = workbookXml(bytes);
    expect(xml.names._folio_options_author_custom).toBeDefined();
    expect(xml.names.author_project_choices).toBe(
      "_folio_options_author_custom"
    );
    const strings = xml.entries["xl/sharedStrings.xml"]
      ? descendants(xml.parse("xl/sharedStrings.xml"), "si").map((item) =>
          descendants(item, "t")
            .map((child) => child.text)
            .join("")
        )
      : [];
    const values = Object.keys(xml.entries)
      .filter((part) => /^xl\/worksheets\/[^/]+\.xml$/u.test(part))
      .flatMap((part) =>
        descendants(xml.parse(part), "c").map((cell) =>
          cell.attributes.t === "s"
            ? strings[Number(descendants(cell, "v")[0]?.text)]
            : descendants(cell, "t")
                .map((child) => child.text)
                .join("")
        )
      );
    expect(values).toContain("Custom one");
    expect(values).toContain("Custom two");
    const runtime = new SpreadsheetRuntime();
    try {
      await runtime.start();
      await runtime.write(
        "removed-published.xlsx",
        unprotectSpreadsheet(bytes)
      );
      await runtime.run(`builder.OpenFile("/work/removed-published.xlsx");
var sheet = Api.GetSheet("Form");
var choices = sheet.GetRange("E1").GetValidation().validations[0].getListValues(sheet.worksheet)[0];
sheet.GetRange("Z1").SetValue(JSON.stringify(choices));
builder.SaveFile("xlsx", "/work/removed-reopened.xlsx"); builder.CloseFile();`);
      const reopened = readSpreadsheetWorkbook(
        await runtime.read("removed-reopened.xlsx")
      );
      expect(
        JSON.parse(String(reopened.cells.get("Z1")?.value ?? "null"))
      ).toEqual(["Static one", "Static two"]);
    } finally {
      await runtime.stop();
    }
  },
  120_000
);
