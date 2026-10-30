// oxlint-disable sort-keys unicorn/no-await-expression-member no-await-in-loop -- Exercise the public persisted workflow in order.
import { afterAll, expect, spyOn, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { readSpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import { spreadsheetDraftFieldData } from "../../src/forms/spreadsheet-fields";
import { objectExists, putObject } from "../../src/storage";
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
let failNativeCommand = false;
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
      failNativeCommand
        ? Promise.reject(new Error("temporary native command outage"))
        : Promise.resolve(
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
const fixture = async (required: boolean, sourceOnly = false) => {
  failing = false;
  failSnapshot = false;
  unchangedNative = false;
  failNativeCommand = false;
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
      ...(sourceOnly
        ? [
            {
              anchor: "folio_second",
              id: "folio_second",
              key: "second_project",
              label: "Second project",
              required,
              type: "dropdown",
              source: "pdms-project-name",
            },
          ]
        : [
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
          ]),
    ],
    table: null,
    version: 1,
  });
  const fixtureAnchors = sourceOnly
    ? { folio_project: anchors.folio_project, folio_second: "'Form'!$A$3" }
    : anchors;
  snapshot = sourceOnly
    ? fixtureWorkbook({ merges: ["A1:B1"], names: fixtureAnchors, cells: [] })
    : workbook("");
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
        spreadsheetAnchors: Object.entries(fixtureAnchors),
      },
      true
    )
  );
  expect(publication.status).toBe("completed");
  const start = await request(`/api/forms/${publicId}/start`, token, {});
  expect(start.status).toBe(200);
  const responseId = ((await start.json()) as { response: { id: string } })
    .response.id;
  let opening = crypto.randomUUID();
  const config = async (openingId = opening) => {
    opening = openingId;
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
    selection?: string,
    bindingId = "folio_project"
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
                bindingId,
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
  return {
    token,
    adminToken,
    adminId: admin.id,
    formId: id,
    publicId,
    responseId,
    userId: user.id,
    config,
    read,
    bytes,
    act,
    retry,
  };
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

runtimeTest(
  "an incomplete source-only Submit can reopen, choose the missing required project, and submit without a native edit",
  async () => {
    const f = await fixture(true, true);
    unchangedNative = true;
    let editor = await f.config();
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("completed");
    editor = await f.config();
    const submittedKey = editor.config.document.key;
    const incomplete = await complete(await f.act(editor, "submit"));
    expect(incomplete.status).toBe("failed");
    expect(incomplete.result?.validationErrors).toContainEqual({
      address: "A3",
      message: expect.any(String),
    });
    editor = await f.config(crypto.randomUUID());
    expect(editor.config.document.key).toBe(submittedKey);
    expect(
      (
        await complete(
          await f.act(editor, "draft", "โครงการหลังคืนบริการ", "folio_second")
        )
      ).status
    ).toBe("completed");
    expect(await (await f.read("json")).json()).toEqual({
      project_name: "โครงการหลังคืนบริการ",
      second_project: "โครงการหลังคืนบริการ",
    });
    const saved = readSpreadsheetWorkbook(await f.bytes());
    expect(saved.cells.get("A1")?.value).toBe("โครงการหลังคืนบริการ");
    expect(saved.cells.get("A3")?.value).toBe("โครงการหลังคืนบริการ");
    editor = await f.config();
    expect((await complete(await f.act(editor, "submit"))).status).toBe(
      "completed"
    );
    expect(
      await (
        await request(`/api/forms/${f.publicId}/my-submissions/export`, f.token)
      ).json()
    ).toMatchObject([
      {
        data: {
          project_name: "โครงการหลังคืนบริการ",
          second_project: "โครงการหลังคืนบริการ",
        },
      },
    ]);
  }
);

runtimeTest(
  "a picker retry after required validation preserves the failed Submit's newly captured ordinary values",
  async () => {
    const f = await fixture(true);
    let editor = await f.config();
    snapshot = workbook("ordinary canonical baseline");
    expect((await complete(await f.act(editor, "draft"))).status).toBe(
      "completed"
    );
    editor = await f.config();
    snapshot = workbook(
      "new ordinary value captured only by the failed Submit",
      "new second value"
    );
    expect((await complete(await f.act(editor, "submit"))).status).toBe(
      "failed"
    );
    expect(await (await f.read("json")).json()).toMatchObject({
      notes: "ordinary canonical baseline",
    });
    unchangedNative = true;
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("completed");
    expect(await (await f.read("json")).json()).toEqual({
      project_name: "โครงการหลังคืนบริการ",
      notes: "new ordinary value captured only by the failed Submit",
      more_notes: "new second value",
    });
    const saved = readSpreadsheetWorkbook(await f.bytes());
    expect(saved.cells.get("D1")?.value).toBe(
      "new ordinary value captured only by the failed Submit"
    );
    expect(saved.cells.get("D3")?.value).toBe("new second value");
    editor = await f.config();
    expect((await complete(await f.act(editor, "submit"))).status).toBe(
      "completed"
    );
  }
);

runtimeTest(
  "a newer uncertain capture fences an older retained snapshot until a fresh native capture succeeds",
  async () => {
    const f = await fixture(true);
    const editor = await f.config();
    snapshot = workbook("retained but now older unsaved input");
    expect((await complete(await f.act(editor, "submit"))).status).toBe(
      "failed"
    );
    snapshot = workbook("newer input whose first capture fails");
    failSnapshot = true;
    expect((await complete(await f.act(editor, "draft"))).status).toBe(
      "failed"
    );
    failSnapshot = false;
    unchangedNative = true;
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("failed");
    expect(await (await f.read("json")).json()).toEqual({});
    unchangedNative = false;
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("completed");
    expect(await (await f.read("json")).json()).toEqual({
      project_name: "โครงการหลังคืนบริการ",
      notes: "newer input whose first capture fails",
      more_notes: null,
    });
  }
);

runtimeTest(
  "terminal polling and hard deletion retire uploaded native captures whose proof was never registered",
  async () => {
    const f = await fixture(true, true);
    const editor = await f.config();
    const capturedBytes = await f.bytes();
    const crashedUpload = async (template?: {
      id: string;
      publicId: string;
    }) => {
      const id = crypto.randomUUID();
      const stagedObjectKey = `operations/${id}/staged.xlsx`;
      const key = `${stagedObjectKey}.native`;
      await prisma.operation.create({
        data: {
          id,
          actorId: template ? f.adminId : f.userId,
          documentKey: template ? `crashed-${id}` : editor.config.document.key,
          errorCode: "force_save_failed",
          formId: template?.id ?? f.formId,
          metadata: {
            action: template ? "save-template" : "save-draft",
            documentKind: "xlsx",
            finalObjectKey: `operations/${id}/final.xlsx`,
            formId: template?.id ?? f.formId,
            pdmsCatalogSessionId: editor.pdmsProjectCatalog.sessionId,
            ...(template ? {} : { responseId: f.responseId }),
            stagedObjectKey,
          },
          ownerUserId: f.userId,
          ...(template ? {} : { responseId: f.responseId }),
          stagingObjectKey: stagedObjectKey,
          status: "failed",
          targetId: template ? crypto.randomUUID() : f.responseId,
          targetType: template ? "template_draft" : "response",
          type: template ? "save_template_draft" : "save_draft",
        },
      });
      await putObject(
        key,
        capturedBytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      expect(await objectExists(key)).toBe(true);
      return { id, key };
    };
    const polled = await crashedUpload();
    const result = await request(`/api/operations/${polled.id}`, f.token);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      operation: { status: "failed" },
    });
    expect(await objectExists(polled.key)).toBe(false);
    const discarded = await crashedUpload();
    const removedResponse = await app.handle(
      new Request(`http://test.local/api/responses/${f.responseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${f.token}` },
      })
    );
    expect(removedResponse.status).toBe(200);
    expect(await objectExists(discarded.key)).toBe(false);
    const draftId = crypto.randomUUID();
    const draft = await prisma.form.create({
      data: {
        id: draftId,
        publicId: draftId.replaceAll("-", ""),
        title: "Crashed authoring upload",
        documentKind: "xlsx",
      },
    });
    const orphan = await crashedUpload(draft);
    const removedForm = await app.handle(
      new Request(`http://test.local/api/admin/forms/${draft.publicId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${f.adminToken}` },
      })
    );
    expect(removedForm.status).toBe(200);
    expect(await objectExists(orphan.key)).toBe(false);
  }
);

runtimeTest(
  "a retained snapshot read outage stays retryable without losing newly captured ordinary inputs",
  async () => {
    const f = await fixture(true);
    const editor = await f.config();
    snapshot = workbook("ordinary input retained across storage read failure");
    expect((await complete(await f.act(editor, "submit"))).status).toBe(
      "failed"
    );
    unchangedNative = true;
    const nativeFile = Bun.S3Client.prototype.file;
    const storageOutage = spyOn(
      Bun.S3Client.prototype,
      "file"
    ).mockImplementation(function storageOutage(
      this: Bun.S3Client,
      ...args: Parameters<Bun.S3Client["file"]>
    ) {
      const file = nativeFile.apply(this, args);
      if (String(args[0]).endsWith(".native")) {
        file.bytes = () =>
          Promise.reject(new Error("temporary retained snapshot read outage"));
      }
      return file;
    });
    try {
      expect(
        (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ")))
          .status
      ).toBe("failed");
    } finally {
      storageOutage.mockRestore();
    }
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("completed");
    expect(await (await f.read("json")).json()).toEqual({
      project_name: "โครงการหลังคืนบริการ",
      notes: "ordinary input retained across storage read failure",
      more_notes: null,
    });
  }
);

runtimeTest(
  "a protected source-only workbook recovers from a native command failure without inventing an ordinary edit",
  async () => {
    const f = await fixture(true, true);
    const editor = await f.config();
    failNativeCommand = true;
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("failed");
    failNativeCommand = false;
    unchangedNative = true;
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("completed");
    expect(await (await f.read("json")).json()).toEqual({
      project_name: "โครงการหลังคืนบริการ",
      second_project: null,
    });
  }
);

runtimeTest(
  "a transient Builder failure does not block an unchanged source-only picker retry",
  async () => {
    const f = await fixture(true, true);
    const editor = await f.config();
    unchangedNative = true;
    const nativeFetch = globalThis.fetch;
    const failBuilder: typeof fetch = Object.assign(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
      ) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input)
        );
        return url.pathname === "/docbuilder"
          ? Promise.resolve(
              new Response("temporary Builder outage", { status: 503 })
            )
          : nativeFetch(input, init);
      },
      { preconnect: nativeFetch.preconnect }
    );
    const builderFailure = spyOn(globalThis, "fetch").mockImplementation(
      failBuilder
    );
    try {
      expect(
        (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ")))
          .status
      ).toBe("failed");
    } finally {
      builderFailure.mockRestore();
    }
    expect(await (await f.read("json")).json()).toEqual({});
    expect(
      (await complete(await f.act(editor, "draft", "โครงการหลังคืนบริการ"))).status
    ).toBe("completed");
    expect(await (await f.read("json")).json()).toEqual({
      project_name: "โครงการหลังคืนบริการ",
      second_project: null,
    });
    expect(
      readSpreadsheetWorkbook(await f.bytes()).cells.get("A1")?.value
    ).toBe("โครงการหลังคืนบริการ");
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
