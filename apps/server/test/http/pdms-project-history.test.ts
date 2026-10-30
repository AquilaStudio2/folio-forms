// oxlint-disable sort-keys unicorn/no-await-expression-member no-await-in-loop -- Follow each public save/reopen workflow in order.
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

const enabled = process.env.RUN_PDMS_PROJECT_HTTP === "1";
const historyTest = enabled ? test : test.skip;
let projectNames: string[] = [];
let upstreamFailed = false;
let upstreamRequests = 0;
let snapshot: Uint8Array | null = null;
let nativeFailed = false;
const upstream = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        upstreamRequests += 1;
        return upstreamFailed
          ? new Response("unavailable", { status: 503 })
          : Response.json(
              projectNames.map((name, index) => ({
                confirmation_document_number: `DOC-${index}`,
                name,
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
        nativeFailed
          ? new Response("temporary save failure", { status: 503 })
          : new Response(snapshot),
    })
  : null;
const app = createApp({
  legacySso: null,
  omniRoute: null,
  prefillHandoffSecret: "project-history-fixture-handoff-secret",
  pdmsProjects: upstream
    ? { baseUrl: upstream.url.origin, secret: "history-fixture-secret" }
    : null,
  onlyOffice: {
    forceSave: () => Promise.resolve(native ? { url: native.url.href } : false),
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-history-fixture")),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_204 });
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
      prefillPointer: "/person/name",
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
const workbook = (cells: { address: string; value: string }[] = []) =>
  fixtureWorkbook({ cells, merges: ["A1:B1"], names });
interface Editor {
  config: { document: { key: string } };
  bridge: {
    capabilities: Record<string, string>;
    lease: { id: string; releaseUrl: string };
  };
  pdmsProjectCatalog: {
    sessionId: string;
    status: string;
    names: string[];
  };
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
const poll = async (accepted: Response) => {
  expect(accepted.status).toBe(202);
  const job = (await accepted.json()) as {
    operationId: string;
    operationCapability: string;
  };
  for (let count = 0; count < 300; count += 1) {
    const response = await request(
      `/api/operations/${job.operationId}`,
      job.operationCapability,
      undefined,
      true
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      operation: {
        status: string;
        result?: { submissionId?: string };
        error?: string;
      };
    };
    if (["completed", "failed"].includes(body.operation.status)) {
      return body.operation;
    }
    await Bun.sleep(100);
  }
  throw new Error("Historical project operation did not finish");
};
const createFixture = async (prefillNotes?: string) => {
  const id = crypto.randomUUID();
  const publicId = id.replaceAll("-", "");
  const publishedId = crypto.randomUUID();
  const password = `History-${id}`;
  const user = await createCredentialFixture({
    email: `history-${id}@example.test`,
    name: "Project history user",
    password,
  });
  const token = await bearerFor(app, user.email, password);
  const key = `tests/${id}/history-template.xlsx`;
  await putObject(key, workbook(), XLSX_CONTENT_TYPE);
  await prisma.form.create({
    data: {
      id,
      publicId,
      documentKind: "xlsx",
      status: "published",
      title: "Saved project names",
      version: 1,
      publishedTemplate: {
        create: {
          id: publishedId,
          contentHash: id,
          documentKey: `published-${id}`,
          objectKey: key,
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
  let cookie = "";
  if (prefillNotes !== undefined) {
    await prisma.prefillConfiguration.create({
      data: {
        formId: id,
        configurationHash: id,
        fields: {
          create: { tag: "notes", pointer: "/person/name", policy: "editable" },
        },
      },
    });
    await prisma.prefillConfiguration.update({
      where: { formId: id },
      data: { publishedTemplateId: publishedId },
    });
    const handoff = await app.handle(
      new Request("http://test.local/api/integrations/prefill/handoffs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prefill-handoff-secret": "project-history-fixture-handoff-secret",
        },
        body: JSON.stringify({
          publicId,
          email: user.email,
          externalReference: crypto.randomUUID(),
          values: { person: { name: prefillNotes } },
        }),
      })
    );
    expect(handoff.status).toBe(200);
    const { code } = (await handoff.json()) as { code: string };
    const launched = await app.handle(
      new Request("http://test.local/prefill/handoff", {
        method: "POST",
        body: new URLSearchParams({ code }),
      })
    );
    expect(launched.status).toBe(303);
    expect(launched.headers.get("location")).toBe(`/forms/${publicId}/fill`);
    cookie = launched.headers.get("set-cookie")?.split(";")[0] ?? "";
  }
  const started = await app.handle(
    new Request(`http://test.local/api/forms/${publicId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: cookie },
    })
  );
  expect(started.status).toBe(200);
  const start = (await started.json()) as { response: { id: string } };
  const responseId = start.response.id;
  const open = async (opening = crypto.randomUUID()) => {
    const response = await request(
      `/api/forms/${publicId}/editor-config?responseId=${responseId}&pdmsOpeningId=${opening}`,
      token
    );
    expect(response.status).toBe(200);
    return (await response.json()) as Editor;
  };
  const action = (editor: Editor, kind = "save-draft", extra = {}) =>
    request(
      `/api/forms/${publicId}/${kind === "submit" ? "submit" : "draft"}`,
      editor.bridge.capabilities[kind] as string,
      {
        documentKey: editor.config.document.key,
        responseId,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: editor.pdmsProjectCatalog.sessionId,
        ...extra,
      },
      true
    );
  const download = async () => {
    const response = await request(
      `/api/responses/${responseId}/draft/xlsx`,
      token
    );
    expect(response.status).toBe(200);
    return new Uint8Array(await response.arrayBuffer());
  };
  const data = async () => {
    const response = await request(
      `/api/responses/${responseId}/draft/json`,
      token
    );
    expect(response.status).toBe(200);
    return response.json();
  };
  return { action, data, download, open, publicId, responseId, token };
};

historyTest(
  "a saved exact scalar name survives reopening after a rename and submits after successful empty loading",
  async () => {
    const oldName = " โครงการเดิม 00123 ";
    projectNames = [oldName, "ชื่อปัจจุบัน"];
    upstreamFailed = false;
    const fixture = await createFixture();
    let editor = await fixture.open();
    snapshot = await fixture.download();
    const selected = await poll(
      await fixture.action(editor, "save-draft", {
        pdmsSelection: {
          sessionId: editor.pdmsProjectCatalog.sessionId,
          bindingId: "folio_project",
          name: oldName,
        },
      })
    );
    expect(selected.status).toBe("completed");
    const saved = await fixture.download();
    expect(readSpreadsheetWorkbook(saved).cells.get("A1")?.value).toBe(oldName);

    projectNames = ["โครงการเปลี่ยนชื่อ", "ชื่อปัจจุบัน"];
    const beforeReopen = upstreamRequests;
    const resumed = await request(
      `/api/forms/${fixture.publicId}/start`,
      fixture.token,
      {}
    );
    expect(resumed.status).toBe(200);
    editor = await fixture.open();
    expect(upstreamRequests).toBe(beforeReopen + 1);
    expect(editor.pdmsProjectCatalog.names).toEqual(projectNames);
    expect(
      readSpreadsheetWorkbook(await fixture.download()).cells.get("A1")?.value
    ).toBe(oldName);
    snapshot = workbook([
      { address: "A1", value: oldName },
      { address: "D1", value: "ordinary work after reopening" },
    ]);
    expect((await poll(await fixture.action(editor))).status).toBe("completed");
    expect(await fixture.data()).toEqual({
      project_name: oldName,
      notes: "ordinary work after reopening",
      second_project: null,
    });

    // A successful empty source still permits this Field's unchanged saved answer.
    projectNames = [];
    editor = await fixture.open();
    expect(editor.pdmsProjectCatalog).toMatchObject({
      status: "ready",
      names: [],
    });
    snapshot = await fixture.download();
    const submitted = await poll(await fixture.action(editor, "submit"));
    expect(submitted.status).toBe("completed");
    const submissionId = submitted.result?.submissionId;
    expect(submissionId).toBeString();
    const json = await request(
      `/api/submissions/${submissionId}/json`,
      fixture.token
    );
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({
      project_name: oldName,
      notes: "ordinary work after reopening",
      second_project: null,
    });
    const document = await request(
      `/api/submissions/${submissionId}/xlsx`,
      fixture.token
    );
    expect(document.status).toBe(200);
    expect(
      readSpreadsheetWorkbook(
        new Uint8Array(await document.arrayBuffer())
      ).cells.get("A1")?.value
    ).toBe(oldName);
  },
  120_000
);

historyTest(
  "historical authority stays with the saved Field and Response through failed picks and replacement sessions",
  async () => {
    const oldName = "ประวัติของช่องแรก";
    const unsavedName = "เลือกแล้วแต่ยังบันทึกไม่สำเร็จ";
    projectNames = [oldName];
    upstreamFailed = false;
    const fixture = await createFixture();
    let editor = await fixture.open();
    snapshot = await fixture.download();
    expect(
      (
        await poll(
          await fixture.action(editor, "save-draft", {
            pdmsSelection: {
              sessionId: editor.pdmsProjectCatalog.sessionId,
              bindingId: "folio_project",
              name: oldName,
            },
          })
        )
      ).status
    ).toBe("completed");
    const baseline = await fixture.download();
    const expected = {
      project_name: oldName,
      notes: null,
      second_project: null,
    };

    projectNames = [];
    editor = await fixture.open();
    snapshot = workbook([
      { address: "A1", value: oldName },
      { address: "A3", value: oldName },
    ]);
    // Copying the first Field's saved name into a different Field is still an edit.
    expect(
      (
        await poll(
          await fixture.action(editor, "save-draft", {
            historical: true,
            data: { project_name: oldName, second_project: oldName },
          })
        )
      ).status
    ).toBe("failed");
    expect(await fixture.data()).toEqual(expected);
    expect(await fixture.download()).toEqual(baseline);
    const forgedHistory = await fixture.action(editor, "save-draft", {
      pdmsSelection: {
        sessionId: editor.pdmsProjectCatalog.sessionId,
        bindingId: "folio_second",
        name: oldName,
        historical: true,
      },
    });
    expect(forgedHistory.status).toBe(400);
    expect(
      (
        await fixture.action(editor, "save-draft", {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_second",
            name: oldName,
          },
        })
      ).status
    ).toBe(422);
    expect(
      (
        await fixture.action(editor, "save-draft", {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: "",
          },
        })
      ).status
    ).toBe(400);

    // Another Response's saved answer cannot establish this new Response's baseline.
    const otherPassword = `Other-response-${crypto.randomUUID()}`;
    const otherUser = await createCredentialFixture({
      email: `other-${crypto.randomUUID()}@example.test`,
      name: "Another Response owner",
      password: otherPassword,
    });
    const otherToken = await bearerFor(app, otherUser.email, otherPassword);
    const otherStarted = await request(
      `/api/forms/${fixture.publicId}/start`,
      otherToken,
      {}
    );
    expect(otherStarted.status).toBe(200);
    const { response: otherResponse } = (await otherStarted.json()) as {
      response: { id: string };
    };
    const otherConfig = await request(
      `/api/forms/${fixture.publicId}/editor-config?responseId=${otherResponse.id}&pdmsOpeningId=${crypto.randomUUID()}`,
      otherToken
    );
    expect(otherConfig.status).toBe(200);
    const otherEditor = (await otherConfig.json()) as Editor;
    snapshot = workbook([{ address: "A1", value: oldName }]);
    expect(
      (
        await poll(
          await request(
            `/api/forms/${fixture.publicId}/draft`,
            otherEditor.bridge.capabilities["save-draft"] as string,
            {
              documentKey: otherEditor.config.document.key,
              responseId: otherResponse.id,
              fillMethod: "onlyoffice",
              data: { project_name: oldName },
              historical: true,
              pdmsCatalogSessionId: otherEditor.pdmsProjectCatalog.sessionId,
            },
            true
          )
        )
      ).status
    ).toBe("failed");
    const otherDocument = await request(
      `/api/responses/${otherResponse.id}/draft/xlsx`,
      otherToken
    );
    expect(
      readSpreadsheetWorkbook(
        new Uint8Array(await otherDocument.arrayBuffer())
      ).cells.get("A1")?.value ?? null
    ).toBe(null);

    projectNames = [unsavedName];
    editor = await fixture.open();
    snapshot = baseline;
    nativeFailed = true;
    try {
      expect(
        (
          await poll(
            await fixture.action(editor, "save-draft", {
              pdmsSelection: {
                sessionId: editor.pdmsProjectCatalog.sessionId,
                bindingId: "folio_project",
                name: unsavedName,
              },
            })
          )
        ).status
      ).toBe("failed");
    } finally {
      nativeFailed = false;
    }
    expect(await fixture.data()).toEqual(expected);
    expect(await fixture.download()).toEqual(baseline);
    const release = await app.handle(
      new Request(`http://test.local${editor.bridge.lease.releaseUrl}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${fixture.token}` },
      })
    );
    expect(release.status).toBe(200);
    projectNames = [];
    const replacement = await fixture.open();
    expect(replacement.bridge.lease.id).not.toBe(editor.bridge.lease.id);
    expect(replacement.pdmsProjectCatalog.sessionId).not.toBe(
      editor.pdmsProjectCatalog.sessionId
    );
    expect((await fixture.action(editor)).status).toBe(409);
    expect(
      (
        await fixture.action(replacement, "save-draft", {
          pdmsSelection: {
            sessionId: replacement.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: unsavedName,
          },
        })
      ).status
    ).toBe(422);
    snapshot = baseline;
    expect((await poll(await fixture.action(replacement))).status).toBe(
      "completed"
    );
    expect(await fixture.data()).toEqual(expected);
    expect(
      readSpreadsheetWorkbook(await fixture.download()).cells.get("A1")?.value
    ).toBe(oldName);
  },
  120_000
);

historyTest(
  "catalog failure preserves Prefill edits and current replacements without carrying history into the next entry",
  async () => {
    const oldName = "ชื่อที่ลบออกภายหลัง";
    const replacement = "ชื่อที่เลือกทดแทน";
    projectNames = [oldName];
    upstreamFailed = false;
    const fixture = await createFixture("original Prefill snapshot");
    let editor = await fixture.open();
    snapshot = await fixture.download();
    expect(readSpreadsheetWorkbook(snapshot).cells.get("D1")?.value).toBe(
      "original Prefill snapshot"
    );
    expect(
      (
        await poll(
          await fixture.action(editor, "save-draft", {
            pdmsSelection: {
              sessionId: editor.pdmsProjectCatalog.sessionId,
              bindingId: "folio_project",
              name: oldName,
            },
          })
        )
      ).status
    ).toBe("completed");

    const previousOpening = await fixture.open();
    upstreamFailed = true;
    editor = await fixture.open();
    expect(editor.pdmsProjectCatalog.status).toBe("error");
    snapshot = workbook([
      { address: "A1", value: oldName },
      { address: "D1", value: "edited after Prefill" },
    ]);
    expect(
      (
        await fixture.action(editor, "submit", {
          pdmsCatalogSessionId: previousOpening.pdmsProjectCatalog.sessionId,
        })
      ).status
    ).toBe(409);
    expect((await fixture.action(editor, "submit")).status).toBe(422);
    expect((await poll(await fixture.action(editor))).status).toBe("completed");
    expect(await fixture.data()).toEqual({
      project_name: oldName,
      notes: "edited after Prefill",
      second_project: null,
    });

    upstreamFailed = false;
    projectNames = [replacement];
    const resumed = await request(
      `/api/forms/${fixture.publicId}/start`,
      fixture.token,
      {}
    );
    expect(resumed.status).toBe(200);
    editor = await fixture.open();
    snapshot = await fixture.download();
    expect(readSpreadsheetWorkbook(snapshot).cells.get("D1")?.value).toBe(
      "edited after Prefill"
    );
    expect(
      (
        await poll(
          await fixture.action(editor, "save-draft", {
            pdmsSelection: {
              sessionId: editor.pdmsProjectCatalog.sessionId,
              bindingId: "folio_project",
              name: replacement,
            },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open();
    // Once replaced, a formerly saved name is no longer this Field's current baseline.
    snapshot = workbook([
      { address: "A1", value: oldName },
      { address: "D1", value: "edited after Prefill" },
    ]);
    expect((await poll(await fixture.action(editor))).status).toBe("failed");
    expect(
      (
        await fixture.action(editor, "save-draft", {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: oldName,
          },
        })
      ).status
    ).toBe(422);
    snapshot = await fixture.download();
    const submitted = await poll(await fixture.action(editor, "submit"));
    expect(submitted.status).toBe("completed");
    const submissionId = submitted.result?.submissionId;
    expect(submissionId).toBeString();
    const savedSubmission = await request(
      `/api/submissions/${submissionId}/xlsx`,
      fixture.token
    );
    expect(savedSubmission.status).toBe(200);
    const immutableBytes = new Uint8Array(await savedSubmission.arrayBuffer());

    // Existing XLSX behavior starts the next entry from the blank template.
    const next = await request(
      `/api/forms/${fixture.publicId}/start`,
      fixture.token,
      {}
    );
    expect(next.status).toBe(200);
    projectNames = [];
    editor = await fixture.open();
    snapshot = await fixture.download();
    const blank = readSpreadsheetWorkbook(snapshot);
    expect(blank.cells.get("A1")?.value ?? null).toBe(null);
    expect(blank.cells.get("D1")?.value ?? null).toBe(null);
    expect(
      (
        await fixture.action(editor, "save-draft", {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: replacement,
          },
        })
      ).status
    ).toBe(422);
    expect((await poll(await fixture.action(editor, "submit"))).status).toBe(
      "failed"
    );

    projectNames = ["รายการถัดไป"];
    editor = await fixture.open();
    snapshot = await fixture.download();
    expect(
      (
        await poll(
          await fixture.action(editor, "save-draft", {
            pdmsSelection: {
              sessionId: editor.pdmsProjectCatalog.sessionId,
              bindingId: "folio_project",
              name: "รายการถัดไป",
            },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open();
    snapshot = await fixture.download();
    expect((await poll(await fixture.action(editor, "submit"))).status).toBe(
      "completed"
    );
    const original = await request(
      `/api/submissions/${submissionId}/xlsx`,
      fixture.token
    );
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(
      immutableBytes
    );
    const originalData = await request(
      `/api/submissions/${submissionId}/json`,
      fixture.token
    );
    expect(await originalData.json()).toEqual({
      project_name: replacement,
      notes: "edited after Prefill",
      second_project: null,
    });
  },
  120_000
);
