// oxlint-disable sort-keys unicorn/no-await-expression-member no-await-in-loop -- Exercise the public persisted workflow in order.
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
const runtimeTest = enabled ? test : test.skip;
let failing = false;
let names: string[] = ["โครงการหลังคืนบริการ"];
let requests = 0;
let snapshot: Uint8Array | null = null;
let failSnapshot = false;
let unchangedNative = false;
const upstream = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        requests += 1;
        return failing
          ? new Response("Unavailable", { status: 503 })
          : Response.json(
              names.map((name, index) => ({
                name,
                confirmation_document_number: `DOC-${index}`,
              }))
            );
      },
    })
  : null;
const native = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        failSnapshot
          ? new Response("unavailable", { status: 503 })
          : new Response(snapshot),
    })
  : null;
const app = createApp({
  legacySso: null,
  omniRoute: null,
  pdmsProjects: upstream
    ? { baseUrl: upstream.url.origin, secret: "isolated-outage-provider" }
    : null,
  onlyOffice: {
    forceSave: () =>
      Promise.resolve(
        native && !unchangedNative ? { url: native.url.href } : false
      ),
    convertDocxToPdf: () => Promise.resolve(new Uint8Array()),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_203 });
}
afterAll(async () => {
  upstream?.stop(true);
  native?.stop(true);
  if (enabled) {
    await app.stop();
  }
});
interface Editor {
  config: { document: { key: string } };
  bridge: { capabilities: Record<string, string> };
  pdmsProjectCatalog: { sessionId: string; status: string; names: string[] };
}
interface Job {
  operationId: string;
  operationCapability: string;
}
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
const complete = async (response: Response) => {
  expect(response.status).toBe(202);
  const job = (await response.json()) as Job;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const polled = await request(
      `/api/operations/${job.operationId}`,
      job.operationCapability,
      undefined,
      true
    );
    expect(polled.status).toBe(200);
    const result = (await polled.json()) as {
      operation: { status: string; result?: { validationErrors?: unknown[] } };
    };
    if (["completed", "failed"].includes(result.operation.status)) {
      return result.operation;
    }
    await Bun.sleep(100);
  }
  throw new Error("Outage workflow did not settle");
};
const anchors = {
  folio_project: "'Form'!$A$1:$B$1",
  folio_note: "'Form'!$D$1",
  folio_more: "'Form'!$D$3",
};
const workbook = (first: string, second = "") =>
  fixtureWorkbook({
    merges: ["A1:B1"],
    names: anchors,
    cells: [
      { address: "D1", value: first },
      { address: "D3", value: second },
    ],
  });
const fixture = async (required: boolean) => {
  failing = false;
  failSnapshot = false;
  unchangedNative = false;
  names = ["โครงการหลังคืนบริการ"];
  const id = crypto.randomUUID();
  const publicId = id.replaceAll("-", "");
  const password = `Outage-${id}`;
  const admin = await createCredentialFixture({
    email: `admin-${id}@example.test`,
    name: "Outage Admin",
    password,
    role: "admin",
  });
  const user = await createCredentialFixture({
    email: `user-${id}@example.test`,
    name: "Outage User",
    password,
  });
  const adminToken = await bearerFor(app, admin.email, password);
  const token = await bearerFor(app, user.email, password);
  const bindings = spreadsheetBindingSchema.parse({
    fields: [
      {
        anchor: "folio_project",
        id: "folio_project",
        key: "project_name",
        label: "Project",
        required,
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
      {
        anchor: "folio_more",
        id: "folio_more",
        key: "more_notes",
        label: "More notes",
        type: "text",
      },
    ],
    table: null,
    version: 1,
  });
  snapshot = workbook("");
  const objectKey = `tests/outage/${id}/template.xlsx`;
  await putObject(
    objectKey,
    snapshot,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  await prisma.form.create({
    data: {
      id,
      publicId,
      title: "Outage proof",
      documentKind: "xlsx",
      templateDraft: {
        create: {
          documentKey: `outage-template-${id}`,
          objectKey,
          fieldRules: { create: spreadsheetDraftFieldData(bindings) },
        },
      },
    },
  });
  const author = (await (
    await request(`/api/admin/forms/${publicId}/editor-config`, adminToken)
  ).json()) as Editor;
  const publication = await complete(
    await request(
      `/api/admin/forms/${publicId}/publish`,
      author.bridge.capabilities.publish as string,
      {
        documentKey: author.config.document.key,
        spreadsheetAnchors: Object.entries(anchors),
      },
      true
    )
  );
  expect(publication.status).toBe("completed");
  const start = await request(`/api/forms/${publicId}/start`, token, {});
  expect(start.status).toBe(200);
  const responseId = ((await start.json()) as { response: { id: string } })
    .response.id;
  const opening = crypto.randomUUID();
  const config = async (openingId = opening) => {
    const result = await request(
      `/api/forms/${publicId}/editor-config?responseId=${responseId}&pdmsOpeningId=${openingId}`,
      token
    );
    expect(result.status).toBe(200);
    return result.json() as Promise<Editor>;
  };
  const read = (suffix: string) =>
    request(`/api/responses/${responseId}/draft/${suffix}`, token);
  const bytes = async () =>
    new Uint8Array(await (await read("xlsx")).arrayBuffer());
  const act = (
    editor: Editor,
    action: "draft" | "submit",
    selection?: string
  ) =>
    request(
      `/api/forms/${publicId}/${action}`,
      editor.bridge.capabilities[
        action === "draft" ? "save-draft" : "submit"
      ] as string,
      {
        responseId,
        documentKey: editor.config.document.key,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: editor.pdmsProjectCatalog.sessionId,
        ...(selection === undefined
          ? {}
          : {
              pdmsSelection: {
                sessionId: editor.pdmsProjectCatalog.sessionId,
                bindingId: "folio_project",
                name: selection,
              },
            }),
      },
      true
    );
  const retry = (editor: Editor) =>
    request(
      "/api/editor/pdms-project-catalog/retry",
      editor.bridge.capabilities["save-draft"] as string,
      {
        documentKey: editor.config.document.key,
        sessionId: editor.pdmsProjectCatalog.sessionId,
      },
      true
    );
  return { token, publicId, responseId, config, read, bytes, act, retry };
};

runtimeTest(
  "an outage permits Draft saving, Retry preserves the document, and only current ready choices can submit",
  async () => {
    const f = await fixture(true);
    failing = true;
    let editor = await f.config();
    expect(editor.pdmsProjectCatalog.status).toBe("error");
    const initialRequests = requests;
    snapshot = workbook("ordinary input entered during outage");
    expect((await complete(await f.act(editor, "draft"))).status).toBe(
      "completed"
    );
    expect(await (await f.read("json")).json()).toEqual({
      notes: "ordinary input entered during outage",
      more_notes: null,
      project_name: null,
    });
    const duringOutage = await f.bytes();
    expect(readSpreadsheetWorkbook(duringOutage).cells.get("D1")?.value).toBe(
      "ordinary input entered during outage"
    );
    editor = await f.config();
    expect(editor.pdmsProjectCatalog.status).toBe("error");
    expect(requests).toBe(initialRequests);
    expect((await f.act(editor, "submit")).status).toBe(422);
    failing = false;
    const loaded = await f.retry(editor);
    expect(loaded.status).toBe(200);
    expect(
      ((await loaded.json()) as { pdmsProjectCatalog: { status: string } })
        .pdmsProjectCatalog.status
    ).toBe("ready");
    expect(await f.bytes()).toEqual(duringOutage);
    expect(requests).toBe(initialRequests + 1);
    snapshot = workbook(
      "ordinary input entered during outage",
      "unsaved text kept through Retry"
    );
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("completed");
    expect(await (await f.read("json")).json()).toEqual({
      project_name: "โครงการหลังคืนบริการ",
      notes: "ordinary input entered during outage",
      more_notes: "unsaved text kept through Retry",
    });
    editor = await f.config();
    snapshot = await f.bytes();
    failing = true;
    expect((await complete(await f.act(editor, "submit"))).status).toBe(
      "completed"
    );
    expect(requests).toBe(initialRequests + 1);
    const submissions = await request(
      `/api/forms/${f.publicId}/my-submissions/export`,
      f.token
    );
    expect(await submissions.json()).toMatchObject([
      {
        data: {
          project_name: "โครงการหลังคืนบริการ",
          notes: "ordinary input entered during outage",
          more_notes: "unsaved text kept through Retry",
        },
      },
    ]);
    const next = await request(`/api/forms/${f.publicId}/start`, f.token, {});
    expect(next.status).toBe(200);
    const nextEditor = await f.config(crypto.randomUUID());
    expect(nextEditor.pdmsProjectCatalog.status).toBe("error");
    expect(nextEditor.pdmsProjectCatalog.sessionId).not.toBe(
      editor.pdmsProjectCatalog.sessionId
    );
    expect(requests).toBe(initialRequests + 2);
  }
);

runtimeTest(
  "a failed native capture cannot turn a later no-change response into a successful stale Draft reload",
  async () => {
    const f = await fixture(false);
    const editor = await f.config();
    snapshot = workbook(
      "native edits awaiting reliable capture",
      "another unsaved input"
    );
    failSnapshot = true;
    expect((await complete(await f.act(editor, "draft"))).status).toBe(
      "failed"
    );
    failSnapshot = false;
    unchangedNative = true;
    const retried = await complete(await f.act(editor, "draft"));
    expect(retried.status).toBe("failed");
    expect(await (await f.read("json")).json()).toEqual({});
    unchangedNative = false;
    expect((await complete(await f.act(editor, "draft"))).status).toBe(
      "completed"
    );
    expect(await (await f.read("json")).json()).toEqual({
      project_name: null,
      notes: "native edits awaiting reliable capture",
      more_notes: "another unsaved input",
    });
  }
);

const emptyCatalogTest = (required: boolean) => {
  runtimeTest(
    `a successful empty catalog ${required ? "keeps a required project incomplete" : "allows an optional empty project"}`,
    async () => {
      const f = await fixture(required);
      names = [];
      const editor = await f.config();
      expect(editor.pdmsProjectCatalog).toMatchObject({
        status: "ready",
        names: [],
      });
      snapshot = workbook("ordinary note with an empty catalog");
      const result = await complete(await f.act(editor, "submit"));
      expect(result.status).toBe(required ? "failed" : "completed");
      const exported = await request(
        `/api/forms/${f.publicId}/my-submissions/export`,
        f.token
      );
      expect(await exported.json()).toMatchObject(
        required
          ? []
          : [
              {
                data: {
                  project_name: null,
                  notes: "ordinary note with an empty catalog",
                  more_notes: null,
                },
              },
            ]
      );
    }
  );
};
for (const required of [true, false]) {
  emptyCatalogTest(required);
}
