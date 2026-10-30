// oxlint-disable sort-keys unicorn/no-await-expression-member -- Keep HTTP assertions beside each public request.
import { expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

interface Catalog {
  names: string[];
  sessionId: string;
  status: "ready" | "error" | "loading";
}
interface Editor {
  pdmsProjectCatalog: Catalog;
  config: { document: { key: string } };
  bridge: { capabilities: Record<string, string>; lease: { id: string } };
}
const fixture = async (
  options: { source?: boolean; timeoutMs?: number } = {}
) => {
  let requests = 0;
  let payload: unknown = [
    { confirmation_document_number: "DOC-1", name: "โครงการแรก" },
  ];
  let status = 200;
  let delayMs = 0;
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async () => {
      requests += 1;
      const result = Response.json(payload, { status });
      await Bun.sleep(delayMs);
      return result;
    },
  });
  const app = createApp({
    onlyOffice: {
      forceSave: () => Promise.resolve(false),
      convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
    },
    legacySso: null,
    omniRoute: null,
    pdmsProjects: {
      baseUrl: upstream.url.origin,
      secret: "session-upstream-only-secret",
      timeoutMs: options.timeoutMs,
    },
  });
  const id = crypto.randomUUID();
  const password = `Session-${id}`;
  const user = await createCredentialFixture({
    email: `${id}@example.test`,
    name: "Session User",
    password,
  });
  const token = await bearerFor(app, user.email, password);
  const publicId = id.replaceAll("-", "");
  const templateId = crypto.randomUUID();
  const bindings = spreadsheetBindingSchema.parse({
    fields: [
      {
        anchor: "folio_project",
        id: "folio_project",
        key: "project_name",
        label: "Project",
        type: "dropdown",
        options: options.source === false ? ["Static"] : [],
        source: options.source === false ? undefined : "pdms-project-name",
      },
      {
        anchor: "folio_second",
        id: "folio_second",
        key: "second_project",
        label: "Second",
        type: "dropdown",
        options: options.source === false ? ["Static"] : [],
        source: options.source === false ? undefined : "pdms-project-name",
      },
      {
        anchor: "folio_note",
        id: "folio_note",
        key: "notes",
        label: "Notes",
        type: "text",
      },
    ],
    table: null,
    version: 1,
  });
  const objectKey = `tests/${id}/published.xlsx`;
  await putObject(
    objectKey,
    fixtureWorkbook({
      merges: [],
      cells: [{ address: "D1", value: "saved ordinary answer" }],
      names: {
        folio_project: "'Form'!$A$1",
        folio_second: "'Form'!$A$3",
        folio_note: "'Form'!$D$1",
      },
    }),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  await prisma.form.create({
    data: {
      id,
      publicId,
      documentKind: "xlsx",
      status: "published",
      title: "Session source fixture",
      version: 1,
      publishedTemplate: {
        create: {
          id: templateId,
          contentHash: id,
          documentKey: `published-${id}`,
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
      draftObjectKey: objectKey,
      spreadsheetInitialized: true,
      draftData: { notes: "saved ordinary answer" },
    },
  });
  const request = (path: string, body?: unknown, capability?: string) =>
    app.handle(
      new Request(`http://test.local${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(capability
            ? { "X-Editor-Capability": capability }
            : { Authorization: `Bearer ${token}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    );
  const config = (opening: string) =>
    request(
      `/api/forms/${publicId}/editor-config?responseId=${response.id}&pdmsOpeningId=${opening}`
    );
  const retry = (
    editor: Editor,
    sessionId = editor.pdmsProjectCatalog.sessionId
  ) =>
    request(
      "/api/editor/pdms-project-catalog/retry",
      {
        documentKey: editor.config.document.key,
        sessionId,
      },
      editor.bridge.capabilities["save-draft"]
    );
  return {
    app,
    publicId,
    responseId: response.id,
    config,
    retry,
    request,
    get requests() {
      return requests;
    },
    healthy() {
      delayMs = 0;
      status = 200;
      payload = [
        { confirmation_document_number: "DOC-2", name: "โครงการหลังคืนบริการ" },
      ];
    },
    fail() {
      status = 503;
    },
    malformed() {
      payload = [{ confirmation_document_number: "DOC-invalid", name: 17 }];
    },
    empty() {
      status = 200;
      payload = [];
    },
    slow() {
      delayMs = 200;
    },
    release(editor: Editor) {
      return app.handle(
        new Request(
          `http://test.local/api/editor-leases/${editor.bridge.lease.id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
        )
      );
    },
    dispose() {
      upstream.stop(true);
    },
  };
};

test("Retry loads the failed opening once without replacing the active editor or its saved answers", async () => {
  const f = await fixture();
  try {
    f.fail();
    const opening = crypto.randomUUID();
    const opened = await f.config(opening);
    expect(opened.status).toBe(200);
    const editor = (await opened.json()) as Editor;
    expect(editor.pdmsProjectCatalog.status).toBe("error");
    expect(
      ((await (await f.config(opening)).json()) as Editor).pdmsProjectCatalog
    ).toEqual(editor.pdmsProjectCatalog);
    expect(f.requests).toBe(1);
    f.healthy();
    const [first, second] = await Promise.all([
      f.retry(editor),
      f.retry(editor),
    ]);
    expect(first.status).toBe(200);
    const loaded = await first.json();
    expect(loaded).toEqual({
      pdmsProjectCatalog: {
        sessionId: editor.pdmsProjectCatalog.sessionId,
        status: "ready",
        names: ["โครงการหลังคืนบริการ"],
      },
    });
    expect(await second.json()).toEqual(loaded);
    expect(f.requests).toBe(2);
    expect(
      ((await (await f.config(opening)).json()) as Editor).config.document.key
    ).toBe(editor.config.document.key);
    expect(
      await (
        await f.request(`/api/responses/${f.responseId}/draft/json`)
      ).json()
    ).toEqual({ notes: "saved ordinary answer" });
    f.fail();
    expect(await (await f.retry(editor)).json()).toEqual(loaded);
    expect(f.requests).toBe(2);
  } finally {
    f.dispose();
  }
});

test("a failed new opening cannot submit or Retry with the ready catalog from an earlier opening on the same lease", async () => {
  const f = await fixture();
  try {
    const first = (await (
      await f.config(crypto.randomUUID())
    ).json()) as Editor;
    expect(first.pdmsProjectCatalog.status).toBe("ready");
    f.fail();
    const second = (await (
      await f.config(crypto.randomUUID())
    ).json()) as Editor;
    expect(second.pdmsProjectCatalog.status).toBe("error");
    const submit = (sessionId: string) =>
      f.request(
        `/api/forms/${f.publicId}/submit`,
        {
          responseId: f.responseId,
          documentKey: second.config.document.key,
          fillMethod: "onlyoffice",
          data: {},
          pdmsCatalogSessionId: sessionId,
        },
        second.bridge.capabilities.submit
      );
    expect((await submit(first.pdmsProjectCatalog.sessionId)).status).toBe(409);
    expect(
      (await f.retry(second, first.pdmsProjectCatalog.sessionId)).status
    ).toBe(409);
    expect((await submit(second.pdmsProjectCatalog.sessionId)).status).toBe(
      422
    );
    expect(f.requests).toBe(2);
    expect(
      await (
        await f.request(`/api/responses/${f.responseId}/draft/json`)
      ).json()
    ).toEqual({ notes: "saved ordinary answer" });
    f.healthy();
    expect((await f.retry(second)).status).toBe(200);
    expect(f.requests).toBe(3);
  } finally {
    f.dispose();
  }
});

test("malformed provider data stays retryable and a successful empty catalog is ready", async () => {
  const f = await fixture();
  try {
    f.malformed();
    const editor = (await (
      await f.config(crypto.randomUUID())
    ).json()) as Editor;
    expect(editor.pdmsProjectCatalog).toMatchObject({
      names: [],
      status: "error",
    });
    f.empty();
    const recovered = await f.retry(editor);
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({
      pdmsProjectCatalog: {
        ...editor.pdmsProjectCatalog,
        names: [],
        status: "ready",
      },
    });
    f.healthy();
    expect(
      (
        (await (await f.retry(editor)).json()) as {
          pdmsProjectCatalog: Catalog;
        }
      ).pdmsProjectCatalog.names
    ).toEqual([]);
    expect(f.requests).toBe(2);
  } finally {
    f.dispose();
  }
});

test("a timed out catalog cannot overwrite a successful manual Retry with its late response", async () => {
  const f = await fixture({ timeoutMs: 30 });
  try {
    f.slow();
    const opening = crypto.randomUUID();
    const editor = (await (await f.config(opening)).json()) as Editor;
    expect(editor.pdmsProjectCatalog.status).toBe("error");
    f.healthy();
    const retried = await f.retry(editor);
    expect(retried.status).toBe(200);
    const loaded = (await retried.json()) as { pdmsProjectCatalog: Catalog };
    expect(loaded.pdmsProjectCatalog.names).toEqual(["โครงการหลังคืนบริการ"]);
    await Bun.sleep(250);
    expect(
      ((await (await f.config(opening)).json()) as Editor).pdmsProjectCatalog
    ).toEqual(loaded.pdmsProjectCatalog);
    expect(f.requests).toBe(2);
  } finally {
    f.dispose();
  }
});

test("replacement of a released editor lease fetches a fresh catalog and rejects old capabilities", async () => {
  const f = await fixture();
  try {
    const opening = crypto.randomUUID();
    const first = (await (await f.config(opening)).json()) as Editor;
    expect((await f.release(first)).status).toBe(200);
    f.healthy();
    const replacement = (await (await f.config(opening)).json()) as Editor;
    expect(replacement.pdmsProjectCatalog.sessionId).not.toBe(
      first.pdmsProjectCatalog.sessionId
    );
    expect(replacement.pdmsProjectCatalog.names).toEqual(["โครงการหลังคืนบริการ"]);
    expect((await f.retry(first)).status).toBe(409);
    expect(
      (await f.retry(replacement, first.pdmsProjectCatalog.sessionId)).status
    ).toBe(409);
    expect(f.requests).toBe(2);
  } finally {
    f.dispose();
  }
});

test("ordinary source-free editors do not fetch or accept catalog Retry", async () => {
  const f = await fixture({ source: false });
  try {
    const editor = (await (
      await f.config(crypto.randomUUID())
    ).json()) as Editor;
    expect(editor.pdmsProjectCatalog).toBeUndefined();
    const retried = await f.request(
      "/api/editor/pdms-project-catalog/retry",
      {
        documentKey: editor.config.document.key,
        sessionId: crypto.randomUUID(),
      },
      editor.bridge.capabilities["save-draft"]
    );
    expect(retried.status).toBe(409);
    expect(f.requests).toBe(0);
  } finally {
    f.dispose();
  }
});
