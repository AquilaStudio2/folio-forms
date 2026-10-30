// oxlint-disable sort-keys unicorn/no-await-expression-member no-await-in-loop -- Exercise the public revision-fenced editor workflow.
import { afterAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  readSpreadsheetWorkbook,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

const enabled = process.env.RUN_PDMS_POPUP_HTTP === "1";
const nativeTest = enabled ? test : test.skip;
let providerRequests = 0;
let snapshot: Uint8Array | null = null;
const upstream = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        providerRequests += 1;
        return Response.json([
          { name: "โครงการ ก", confirmation_document_number: "SYN-1" },
          { name: "00123", confirmation_document_number: "SYN-2" },
        ]);
      },
    })
  : null;
const native = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(snapshot),
    })
  : null;
const app = createApp({
  legacySso: null,
  omniRoute: null,
  pdmsProjects: upstream
    ? { baseUrl: upstream.url.origin, secret: "synthetic-popup-provider" }
    : null,
  onlyOffice: {
    forceSave: () => Promise.resolve(native ? { url: native.url.href } : false),
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_209 });
}
afterAll(async () => {
  upstream?.stop(true);
  native?.stop(true);
  if (enabled) {
    await app.stop();
  }
});

nativeTest(
  "source openings keep a cell dropdown after save/reopen, replace the same answer, and preserve a physical table target",
  async () => {
    const id = crypto.randomUUID();
    const password = `Popup-${id}`;
    const user = await createCredentialFixture({
      email: `popup-${id}@example.test`,
      name: "Popup user",
      password,
    });
    const bearer = await bearerFor(app, user.email, password);
    const request = (path: string, capability?: string, body?: unknown) =>
      app.handle(
        new Request(`http://test.local${path}`, {
          method: body ? "POST" : "GET",
          headers: {
            "Content-Type": "application/json",
            ...(capability
              ? { "X-Editor-Capability": capability }
              : { Authorization: `Bearer ${bearer}` }),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
      );
    const bindings = spreadsheetBindingSchema.parse({
      version: 1,
      fields: [
        {
          anchor: "folio_project",
          id: "folio_project",
          key: "project_name",
          label: "ชื่อโครงการ",
          type: "dropdown",
          source: "pdms-project-name",
        },
        {
          anchor: "folio_note",
          id: "folio_note",
          key: "notes",
          label: "Notes",
          type: "text",
        },
      ],
      table: {
        id: "folio_table",
        anchor: "folio_body",
        key: "projects",
        label: "Projects",
        columns: [
          {
            id: "folio_column",
            key: "project",
            label: "Row project",
            type: "dropdown",
            source: "pdms-project-name",
            offset: 0,
          },
          {
            id: "folio_row_note",
            key: "note",
            label: "Row note",
            type: "text",
            offset: 1,
          },
        ],
      },
    });
    const names = {
      folio_project: "'Form'!$A$1:$B$1",
      folio_note: "'Form'!$D$1",
      folio_body: "'Form'!$A$4:$B$6",
    };
    snapshot = fixtureWorkbook({
      merges: ["A1:B1"],
      names,
      cells: [
        { address: "D1", value: "ordinary unsaved note" },
        { address: "B5", value: "physical second row" },
      ],
    });
    const objectKey = `tests/${id}/popup.xlsx`;
    await putObject(objectKey, snapshot, XLSX_CONTENT_TYPE);
    const draftObjectKey = `tests/${id}/draft.xlsx`;
    await putObject(draftObjectKey, snapshot, XLSX_CONTENT_TYPE);
    const publicId = id.replaceAll("-", "");
    const templateId = crypto.randomUUID();
    await prisma.form.create({
      data: {
        id,
        publicId,
        documentKind: "xlsx",
        title: "Adjacent popup",
        status: "published",
        version: 1,
        publishedTemplate: {
          create: {
            id: templateId,
            contentHash: id,
            documentKey: `template-${id}`,
            objectKey,
            version: 1,
            manifest: {
              create: {
                configurationHash: id,
                fields: { create: spreadsheetManifestFieldData(bindings) },
              },
            },
          },
        },
      },
    });
    const response = await prisma.response.create({
      data: {
        formId: id,
        publishedTemplateId: templateId,
        publishedVersion: 1,
        userId: user.id,
        draftDocumentKey: `response-${id}`,
        draftObjectKey,
        spreadsheetInitialized: true,
      },
    });
    const opening = crypto.randomUUID();
    interface Config {
      bridge: {
        id: string;
        capabilities: Record<string, string>;
        pdmsProjectPopup: { channelId: string; documentKey: string };
      };
      pdmsProjectCatalog: { names: string[]; sessionId: string };
      config: {
        document: { key: string };
        editorConfig: {
          plugins: {
            autostart: string[];
            options: Record<string, Record<string, unknown>>;
            pluginsData: string[];
          };
        };
      };
    }
    const getConfig = async () => {
      const result = await request(
        `/api/forms/${publicId}/editor-config?responseId=${response.id}&pdmsOpeningId=${opening}`
      );
      expect(result.status).toBe(200);
      return (await result.json()) as Config;
    };
    let editor = await getConfig();
    expect(editor.bridge.pdmsProjectPopup).toMatchObject({
      documentKey: editor.config.document.key,
      channelId: expect.any(String),
    });
    const popupGuid = editor.config.editorConfig.plugins.autostart.find(
      (guid) =>
        editor.config.editorConfig.plugins.options[guid]?.pdmsPopupChannelId &&
        !editor.config.editorConfig.plugins.options[guid]?.action
    );
    expect(popupGuid).toBeDefined();
    if (!popupGuid) {
      throw new Error("Popup was not enabled");
    }
    expect(editor.config.editorConfig.plugins.options[popupGuid]).toEqual({
      bridgeId: editor.bridge.id,
      documentKey: editor.config.document.key,
      parentOrigin: expect.any(String),
      pdmsPopupChannelId: editor.bridge.pdmsProjectPopup.channelId,
    });
    const popupConfig = await request(
      "/onlyoffice-plugin/pdms-project/config.json"
    );
    expect(await popupConfig.json()).toMatchObject({
      guid: popupGuid,
      variations: [
        {
          type: "background",
          initOnSelectionChanged: true,
          EditorsSupport: ["cell"],
        },
      ],
    });
    expect(
      (await request("/onlyoffice-plugin/pdms-project/index.html")).status
    ).toBe(200);
    expect(
      (await request("/onlyoffice-plugin/pdms-project/popup.js")).status
    ).toBe(200);
    const firstCatalog = editor.pdmsProjectCatalog;
    const choose = async (bindingId: string, name: string, index?: number) => {
      const chosen = await request(
        `/api/forms/${publicId}/draft`,
        editor.bridge.capabilities["save-draft"],
        {
          documentKey: editor.config.document.key,
          responseId: response.id,
          fillMethod: "onlyoffice",
          data: {},
          pdmsCatalogSessionId: editor.pdmsProjectCatalog.sessionId,
          pdmsSelection: {
            bindingId,
            name,
            sessionId: editor.pdmsProjectCatalog.sessionId,
            ...(index === undefined
              ? {}
              : { row: { index, documentKey: editor.config.document.key } }),
          },
        }
      );
      expect(chosen.status).toBe(202);
      const job = (await chosen.json()) as {
        operationId: string;
        operationCapability: string;
      };
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const result = (await (
          await request(
            `/api/operations/${job.operationId}`,
            job.operationCapability
          )
        ).json()) as { operation: { status: string } };
        if (["completed", "failed"].includes(result.operation.status)) {
          expect(result.operation.status).toBe("completed");
          break;
        }
        if (attempt === 299) {
          throw new Error("Popup selection timed out");
        }
        await Bun.sleep(100);
      }
      snapshot = new Uint8Array(
        await (
          await request(`/api/responses/${response.id}/draft/xlsx`)
        ).arrayBuffer()
      );
      editor = await getConfig();
      expect(editor.pdmsProjectCatalog).toEqual(firstCatalog);
      expect(editor.bridge.pdmsProjectPopup.documentKey).toBe(
        editor.config.document.key
      );
    };
    await choose("folio_project", "โครงการ ก");
    await choose("folio_project", "00123");
    await choose("folio_column", "โครงการ ก", 1);
    if (!snapshot) {
      throw new Error("Saved workbook missing");
    }
    const book = readSpreadsheetWorkbook(snapshot);
    expect(book.cells.get("A1")?.value).toBe("00123");
    expect(book.cells.get("A5")?.value).toBe("โครงการ ก");
    expect(book.cells.get("D1")?.value).toBe("ordinary unsaved note");
    expect(
      await (await request(`/api/responses/${response.id}/draft/json`)).json()
    ).toEqual({
      project_name: "00123",
      notes: "ordinary unsaved note",
      projects: [{ project: "โครงการ ก", note: "physical second row" }],
    });
    expect(providerRequests).toBe(1);
  }
);
