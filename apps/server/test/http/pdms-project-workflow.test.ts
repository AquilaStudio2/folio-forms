// oxlint-disable sort-keys unicorn/no-await-expression-member no-await-in-loop -- Follow the public asynchronous workflow in its persisted order.
import { afterAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { readSpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import { spreadsheetDraftFieldData } from "../../src/forms/spreadsheet-fields";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

const enabled = process.env.RUN_PDMS_PROJECT_HTTP === "1";
const workflowTest = enabled ? test : test.skip;
const upstream = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        Response.json([
          { confirmation_document_number: "DOC-1", name: "โครงการ ก" },
          { confirmation_document_number: "DOC-2", name: "Project B" },
          { confirmation_document_number: "DOC-3", name: "00123" },
        ]),
    })
  : null;
let snapshot: Uint8Array | null = null;
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
    ? { baseUrl: upstream.url.origin, secret: "workflow-fixture-secret" }
    : null,
  onlyOffice: {
    forceSave: () => Promise.resolve(native ? { url: native.url.href } : false),
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-fixture")),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_202 });
}
afterAll(async () => {
  upstream?.stop(true);
  native?.stop(true);
  if (enabled) {
    await app.stop();
  }
});
const names = {
  folio_project: "'Form'!$A$1:$B$1",
  folio_other: "'Form'!$D$1",
  folio_second: "'Form'!$A$3",
};
const merges = ["A1:B1"];
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_project",
      id: "folio_project",
      key: "project_name",
      label: "ชื่อโครงการ",
      type: "dropdown",
      source: "pdms-project-name",
      required: true,
    },
    {
      anchor: "folio_other",
      id: "folio_other",
      key: "notes",
      label: "Notes",
      type: "text",
    },
    {
      anchor: "folio_second",
      id: "folio_second",
      key: "second_project",
      label: "Second project",
      type: "dropdown",
      source: "pdms-project-name",
    },
  ],
  table: null,
  version: 1,
});
const request = (
  path: string,
  token: string,
  body?: unknown,
  capability = false
) =>
  app.handle(
    new Request(`http://test.local${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        [capability ? "X-Editor-Capability" : "Authorization"]: capability
          ? token
          : `Bearer ${token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );
const poll = async (id: string, capability: string) => {
  for (let count = 0; count < 300; count += 1) {
    const response = await request(
      `/api/operations/${id}`,
      capability,
      undefined,
      true
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      operation: {
        status: string;
        result?: { documentKey: string };
        error?: string;
      };
    };
    if (["completed", "failed"].includes(body.operation.status)) {
      return body.operation;
    }
    await Bun.sleep(100);
  }
  throw new Error("PDMS workflow operation did not finish");
};
workflowTest(
  "Admin publication through picker Draft save/reload and submit keeps workbook and Tag answers consistent",
  async () => {
    const fixtureId = crypto.randomUUID();
    const publicId = fixtureId.replaceAll("-", "");
    const password = `Workflow-${fixtureId}`;
    const admin = await createCredentialFixture({
      email: `admin-${fixtureId}@example.test`,
      name: "Workflow author",
      role: "admin",
      password,
    });
    const user = await createCredentialFixture({
      email: `user-${fixtureId}@example.test`,
      name: "Workflow user",
      password,
    });
    const adminToken = await bearerFor(app, admin.email, password);
    const userToken = await bearerFor(app, user.email, password);
    const key = `tests/${fixtureId}/draft.xlsx`;
    snapshot = fixtureWorkbook({
      cells: [{ address: "A1", value: "Template example" }],
      merges,
      names,
    });
    await putObject(
      key,
      snapshot,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await prisma.form.create({
      data: {
        id: fixtureId,
        publicId,
        documentKind: "xlsx",
        title: "PDMS workflow",
        templateDraft: {
          create: {
            documentKey: `template-${fixtureId}`,
            objectKey: key,
            fieldRules: { create: spreadsheetDraftFieldData(bindings) },
          },
        },
      },
    });
    const config = (await (
      await request(`/api/admin/forms/${publicId}/editor-config`, adminToken)
    ).json()) as { bridge: { capabilities: Record<string, string> } };
    const published = await request(
      `/api/admin/forms/${publicId}/publish`,
      config.bridge.capabilities.publish as string,
      {
        documentKey: `template-${fixtureId}`,
        spreadsheetAnchors: Object.entries(names),
      },
      true
    );
    expect(published.status).toBe(202);
    const publishJob = (await published.json()) as {
      operationId: string;
      operationCapability: string;
    };
    expect(
      (await poll(publishJob.operationId, publishJob.operationCapability))
        .status
    ).toBe("completed");
    const started = await request(
      `/api/forms/${publicId}/start`,
      userToken,
      {}
    );
    expect(started.status).toBe(200);
    const start = (await started.json()) as { response: { id: string } };
    const responseId = start.response.id;
    const openingId = crypto.randomUUID();
    const getConfig = () =>
      request(
        `/api/forms/${publicId}/editor-config?responseId=${responseId}&pdmsOpeningId=${openingId}`,
        userToken
      );
    interface Config {
      config: { document: { key: string } };
      bridge: { capabilities: Record<string, string> };
      pdmsProjectCatalog: {
        sessionId: string;
        status: string;
        names: string[];
      };
    }
    let editor = (await (await getConfig()).json()) as Config;
    expect(editor.pdmsProjectCatalog.status).toBe("ready");
    const initialized = await request(
      `/api/responses/${responseId}/draft/xlsx`,
      userToken
    );
    expect(
      readSpreadsheetWorkbook(
        new Uint8Array(await initialized.arrayBuffer())
      ).cells.get("A1")?.value ?? null
    ).toBe(null);
    snapshot = fixtureWorkbook({
      cells: [{ address: "D1", value: "unsaved ordinary input" }],
      merges,
      names,
    });
    const pick = await request(
      `/api/forms/${publicId}/draft`,
      editor.bridge.capabilities["save-draft"] as string,
      {
        documentKey: editor.config.document.key,
        responseId,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: editor.pdmsProjectCatalog.sessionId,
        pdmsSelection: {
          sessionId: editor.pdmsProjectCatalog.sessionId,
          bindingId: "folio_project",
          name: "โครงการ ก",
        },
      },
      true
    );
    expect(pick.status).toBe(202);
    const pickJob = (await pick.json()) as {
      operationId: string;
      operationCapability: string;
    };
    expect(
      (await poll(pickJob.operationId, pickJob.operationCapability)).status
    ).toBe("completed");
    const draftData = await request(
      `/api/responses/${responseId}/draft/json`,
      userToken
    );
    expect(await draftData.json()).toEqual({
      project_name: "โครงการ ก",
      notes: "unsaved ordinary input",
      second_project: null,
    });
    const draft = await request(
      `/api/responses/${responseId}/draft/xlsx`,
      userToken
    );
    let savedBytes = new Uint8Array(await draft.arrayBuffer());
    expect(readSpreadsheetWorkbook(savedBytes).cells.get("A1")?.value).toBe(
      "โครงการ ก"
    );
    const firstCatalog = editor.pdmsProjectCatalog;
    editor = (await (await getConfig()).json()) as Config;
    // Even a current catalog name pasted into the protected callback is not a picker selection.
    snapshot = fixtureWorkbook({
      cells: [
        { address: "A1", value: "Project B" },
        { address: "D1", value: "unsaved ordinary input" },
      ],
      merges,
      names,
    });
    const forged = await request(
      `/api/forms/${publicId}/draft`,
      editor.bridge.capabilities["save-draft"] as string,
      {
        documentKey: editor.config.document.key,
        responseId,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: firstCatalog.sessionId,
      },
      true
    );
    expect(forged.status).toBe(202);
    const forgedJob = (await forged.json()) as {
      operationId: string;
      operationCapability: string;
    };
    expect(
      (await poll(forgedJob.operationId, forgedJob.operationCapability)).status
    ).toBe("failed");
    expect(
      await (
        await request(`/api/responses/${responseId}/draft/json`, userToken)
      ).json()
    ).toEqual({
      project_name: "โครงการ ก",
      notes: "unsaved ordinary input",
      second_project: null,
    });
    const preserved = (await (await getConfig()).json()) as Config;
    expect(preserved.config.document.key).toBe(editor.config.document.key);
    expect(preserved.pdmsProjectCatalog).toEqual(firstCatalog);

    editor = (await (await getConfig()).json()) as Config;
    expect(editor.pdmsProjectCatalog).toEqual(firstCatalog);
    snapshot = savedBytes;
    const second = await request(
      `/api/forms/${publicId}/draft`,
      editor.bridge.capabilities["save-draft"] as string,
      {
        documentKey: editor.config.document.key,
        responseId,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: firstCatalog.sessionId,
        pdmsSelection: {
          sessionId: firstCatalog.sessionId,
          bindingId: "folio_second",
          name: "00123",
        },
      },
      true
    );
    const secondJob = (await second.json()) as {
      operationId: string;
      operationCapability: string;
    };
    expect(
      (await poll(secondJob.operationId, secondJob.operationCapability)).status
    ).toBe("completed");
    expect(
      await (
        await request(`/api/responses/${responseId}/draft/json`, userToken)
      ).json()
    ).toEqual({
      project_name: "โครงการ ก",
      notes: "unsaved ordinary input",
      second_project: "00123",
    });
    savedBytes = new Uint8Array(
      await (
        await request(`/api/responses/${responseId}/draft/xlsx`, userToken)
      ).arrayBuffer()
    );
    editor = (await (await getConfig()).json()) as Config;
    snapshot = savedBytes;
    const submit = await request(
      `/api/forms/${publicId}/submit`,
      editor.bridge.capabilities.submit as string,
      {
        documentKey: editor.config.document.key,
        responseId,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: firstCatalog.sessionId,
      },
      true
    );
    expect(submit.status).toBe(202);
    const submitJob = (await submit.json()) as {
      operationId: string;
      operationCapability: string;
    };
    expect(
      (await poll(submitJob.operationId, submitJob.operationCapability)).status
    ).toBe("completed");
    const submissions = await request(
      `/api/forms/${publicId}/my-submissions/export`,
      userToken
    );
    expect(await submissions.json()).toMatchObject([
      {
        data: {
          project_name: "โครงการ ก",
          notes: "unsaved ordinary input",
          second_project: "00123",
        },
      },
    ]);
    // The existing submit-to-new-entry flow opens a new document under the same Response.
    const nextEntry = await request(
      `/api/forms/${publicId}/start`,
      userToken,
      {}
    );
    expect(nextEntry.status).toBe(200);
    const nextConfig = await request(
      `/api/forms/${publicId}/editor-config?responseId=${responseId}&pdmsOpeningId=${crypto.randomUUID()}`,
      userToken
    );
    expect(nextConfig.status).toBe(200);
    const nextEditor = (await nextConfig.json()) as Config;
    expect(nextEditor.pdmsProjectCatalog.status).toBe("ready");
    expect(nextEditor.pdmsProjectCatalog.sessionId).not.toBe(
      firstCatalog.sessionId
    );
    expect(nextEditor.config.document.key).not.toBe(editor.config.document.key);
    const stillSaved = await request(
      `/api/forms/${publicId}/my-submissions/export`,
      userToken
    );
    expect(await stillSaved.json()).toMatchObject([
      {
        data: {
          project_name: "โครงการ ก",
          notes: "unsaved ordinary input",
          second_project: "00123",
        },
      },
    ]);
  },
  120_000
);
