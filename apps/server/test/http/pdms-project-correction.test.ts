// oxlint-disable complexity sort-keys consistent-function-scoping unicorn/no-await-expression-member no-await-in-loop -- Public correction journeys preserve their ordered revision boundaries.
import { afterAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import {
  spreadsheetBindingSchema,
  spreadsheetColumnName,
} from "../../src/documents/spreadsheets/contract";
import type { SpreadsheetRange } from "../../src/documents/spreadsheets/contract";
import { protectSpreadsheet } from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { createOnlyOfficeAuthorization } from "../../src/onlyoffice";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

const enabled = process.env.RUN_PDMS_CORRECTION_HTTP === "1";
const correctionTest = enabled ? test : test.skip;
let requests = 0;
let upstreamStatus = 200;
let projectNames = ["Current scalar", "Current row", "00123"];
let snapshot: Uint8Array | null = null;
let callbackReady = Promise.withResolvers<{ key: string; userdata: string }>();
let holdCallback = false;
let lastCallback: { key: string; userdata: string } | null = null;
const upstream = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        requests += 1;
        return Response.json(
          projectNames.map((name, index) => ({
            name,
            confirmation_document_number: `DOC-${index}`,
          })),
          { status: upstreamStatus }
        );
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
    ? { baseUrl: upstream.url.origin, secret: "correction-fixture-secret" }
    : null,
  onlyOffice: {
    forceSave: (key, userdata) => {
      lastCallback = { key, userdata };
      callbackReady.resolve(lastCallback);
      if (holdCallback) {
        return Promise.resolve(true);
      }
      return Promise.resolve(native ? { url: native.url.href } : false);
    },
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-fixture")),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_207 });
}
afterAll(async () => {
  upstream?.stop(true);
  native?.stop(true);
  if (enabled) {
    await app.stop();
  }
});

const bindings = spreadsheetBindingSchema.parse({
  version: 1,
  fields: [
    {
      id: "folio_scalar",
      anchor: "folio_scalar",
      key: "project_name",
      label: "Scalar project",
      source: "pdms-project-name",
      type: "dropdown",
    },
    {
      id: "folio_note",
      anchor: "folio_note",
      key: "notes",
      label: "Required note",
      type: "text",
      required: true,
    },
  ],
  table: {
    id: "folio_table",
    anchor: "folio_body",
    key: "projects",
    label: "Project records",
    columns: [
      {
        id: "folio_project",
        offset: 0,
        key: "project",
        label: "Project",
        type: "dropdown",
        source: "pdms-project-name",
      },
      {
        id: "folio_second",
        offset: 1,
        key: "second_project",
        label: "Second project",
        type: "dropdown",
        source: "pdms-project-name",
      },
      {
        id: "folio_row_note",
        offset: 2,
        key: "note",
        label: "Record note",
        type: "text",
      },
    ],
  },
});
const names = {
  folio_scalar: "'Form'!$A$1:$B$1",
  folio_note: "'Form'!$D$1",
  folio_body: "'Form'!$A$4:$C$7",
};
interface Editor {
  config: { document: { key: string; url: string } };
  bridge: { capabilities: Record<string, string>; lease: { id: string } };
  pdmsProjectCatalog: { sessionId: string; status: string; names: string[] };
  openingId: string;
}
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
const waitFor = async (accepted: Response) => {
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
    const { operation } = (await response.json()) as {
      operation: {
        status: string;
        errorMessage?: string;
        result?: Record<string, unknown>;
      };
    };
    if (["completed", "failed"].includes(operation.status)) {
      return operation;
    }
    await Bun.sleep(100);
  }
  throw new Error("Correction operation did not finish");
};
const range = (value: SpreadsheetRange) =>
  `${spreadsheetColumnName(value.firstColumn)}${value.firstRow + 1}:${spreadsheetColumnName(value.lastColumn)}${value.lastRow + 1}`;
const callbackBytes = (
  bytes: Uint8Array,
  edits: Record<string, string> = {}
) => {
  const book = readSpreadsheetWorkbook(bytes);
  const cells = new Map(
    [...book.cells.values()].map((cell) => [
      cell.address,
      {
        address: cell.address,
        ...(cell.value === null ? {} : { value: cell.value }),
        ...(cell.formula === null ? {} : { formula: cell.formula }),
      },
    ])
  );
  for (const [address, value] of Object.entries(edits)) {
    cells.set(address, { address, value });
  }
  return fixtureWorkbook({
    cells: [...cells.values()],
    merges: book.merges.map(range),
    names: Object.fromEntries(
      [...book.names].map(([name, location]) => [
        name,
        `'${location.sheet}'!${range(location)}`,
      ])
    ),
  });
};
const fixture = async () => {
  holdCallback = false;
  upstreamStatus = 200;
  projectNames = ["Current scalar", "Current row", "00123"];
  const id = crypto.randomUUID();
  const password = `Correction-${id}`;
  const identities = await Promise.all(
    (["admin", "user", "viewer"] as const).map((role) =>
      createCredentialFixture({
        email: `${role}-${id}@example.test`,
        name: `Correction ${role}`,
        role,
        password,
      })
    )
  );
  const [admin, user, viewer] = await Promise.all(
    identities.map((identity) => bearerFor(app, identity.email, password))
  );
  const publicId = id.replaceAll("-", "");
  const templateId = crypto.randomUUID();
  const objectKey = `tests/${id}/submitted.xlsx`;
  const originalData = {
    project_name: "Historical scalar",
    notes: "Original note",
    projects: [
      { project: "Removed record A", second_project: null, note: "record A" },
      {
        project: "Removed record B",
        second_project: "Removed record A",
        note: "record B",
      },
    ],
  };
  const raw = fixtureWorkbook({
    names,
    merges: ["A1:B1"],
    cells: [
      { address: "A1", value: "Historical scalar" },
      { address: "D1", value: "Original note" },
      { address: "A5", value: "Removed record A" },
      { address: "C5", value: "record A" },
      { address: "A7", value: "Removed record B" },
      { address: "B7", value: "Removed record A" },
      { address: "C7", value: "record B" },
    ],
  });
  const originalBytes = new Uint8Array(
    protectSpreadsheet(
      raw,
      resolveSpreadsheetContract(bindings, readSpreadsheetWorkbook(raw))
    )
  );
  await putObject(objectKey, originalBytes, XLSX_CONTENT_TYPE);
  await prisma.form.create({
    data: {
      id,
      publicId,
      documentKind: "xlsx",
      status: "published",
      title: "Correction source fixture",
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
      status: "submitted",
      userId: identities[1]?.id as string,
    },
  });
  const submission = await prisma.submission.create({
    data: {
      responseId: response.id,
      formId: id,
      userId: identities[1]?.id as string,
      documentKey: `submission-${id}`,
      objectKey,
      data: originalData,
    },
  });
  const open = async (openingId: string = crypto.randomUUID()) => {
    const result = await request(
      `/api/admin/results/${response.id}/correction/editor-config?pdmsOpeningId=${openingId}`,
      admin as string
    );
    expect(result.status).toBe(200);
    return { ...((await result.json()) as Editor), openingId };
  };
  const bytes = async (editor: Editor) => {
    const result = await app.handle(
      new Request(editor.config.document.url, {
        headers: {
          Authorization: createOnlyOfficeAuthorization({
            url: editor.config.document.url,
          }),
        },
      })
    );
    expect(result.status).toBe(200);
    return new Uint8Array(await result.arrayBuffer());
  };
  const history = async () =>
    (await (
      await request(
        `/api/submissions/${submission.id}/corrections`,
        admin as string
      )
    ).json()) as {
      latestRevision: number;
      revisions: { revision: number; reason: string | null; data: unknown }[];
    };
  const action = (
    editor: Editor,
    body: Record<string, unknown> = {},
    final = false
  ) =>
    request(
      `/api/admin/results/${response.id}/correction${final ? "" : "/workspace"}`,
      editor.bridge.capabilities[
        final ? "save-correction" : "save-correction-workspace"
      ] as string,
      {
        documentKey: editor.config.document.key,
        data: {},
        pdmsCatalogSessionId: editor.pdmsProjectCatalog.sessionId,
        ...body,
      },
      true
    );
  const pick = async (
    editor: Editor,
    bindingId: string,
    name: string,
    index?: number,
    edits: Record<string, string> = {}
  ) => {
    snapshot = callbackBytes(await bytes(editor), edits);
    const operation = await waitFor(
      await action(editor, {
        pdmsSelection: {
          sessionId: editor.pdmsProjectCatalog.sessionId,
          bindingId,
          name,
          ...(index === undefined
            ? {}
            : { row: { index, documentKey: editor.config.document.key } }),
        },
      })
    );
    expect(operation.status).toBe("completed");
    return await open(editor.openingId);
  };
  return {
    adminId: identities[0]?.id as string,
    responseId: response.id,
    submissionId: submission.id,
    publicId,
    admin: admin as string,
    user: user as string,
    viewer: viewer as string,
    originalData,
    originalBytes,
    open,
    bytes,
    history,
    action,
    pick,
  };
};

correctionTest(
  "multiple scalar and physical-row picker previews create no Correction; only explicit reasoned save creates matching immutable history",
  async () => {
    const f = await fixture();
    const beforeRequests = requests;
    let editor = await f.open();
    expect(editor.pdmsProjectCatalog.status).toBe("ready");
    const catalog = editor.pdmsProjectCatalog;
    editor = await f.pick(editor, "folio_scalar", "Current scalar", undefined, {
      D1: "",
      C5: "unsaved record A",
    });
    expect(editor.pdmsProjectCatalog).toEqual(catalog);
    expect((await f.history()).revisions).toHaveLength(1);
    editor = await f.pick(editor, "folio_project", "00123", 3);
    expect((await f.history()).latestRevision).toBe(0);
    expect(requests - beforeRequests).toBe(1);
    let book = readSpreadsheetWorkbook(await f.bytes(editor));
    expect(book.cells.get("A1")?.value).toBe("Current scalar");
    expect(book.cells.get("A5")?.value).toBe("Removed record A");
    expect(book.cells.get("A7")?.value).toBe("00123");
    expect(book.cells.get("B7")?.value).toBe("Removed record A");
    expect(book.cells.get("C5")?.value).toBe("unsaved record A");
    snapshot = await f.bytes(editor);
    expect(
      (
        await waitFor(
          await f.action(editor, { reason: "Reviewed project choices" }, true)
        )
      ).status
    ).toBe("failed");
    expect((await f.history()).latestRevision).toBe(0);
    snapshot = callbackBytes(await f.bytes(editor), { D1: "Completed note" });
    expect(
      (
        await waitFor(
          await f.action(editor, { reason: "Reviewed project choices" }, true)
        )
      ).status
    ).toBe("completed");
    const history = await f.history();
    expect(history.latestRevision).toBe(1);
    expect(history.revisions).toHaveLength(2);
    expect(history.revisions[1]?.reason).toBe("Reviewed project choices");
    const latest = (await (
      await request(`/api/submissions/${f.submissionId}/data`, f.user)
    ).json()) as { data: unknown };
    expect(latest.data).toEqual({
      project_name: "Current scalar",
      notes: "Completed note",
      projects: [
        {
          project: "Removed record A",
          second_project: null,
          note: "unsaved record A",
        },
        {
          project: "00123",
          second_project: "Removed record A",
          note: "record B",
        },
      ],
    });
    const xlsx = await request(
      `/api/submissions/${f.submissionId}/xlsx`,
      f.user
    );
    expect(xlsx.status).toBe(200);
    book = readSpreadsheetWorkbook(new Uint8Array(await xlsx.arrayBuffer()));
    expect(book.cells.get("A7")?.value).toBe("00123");
    expect(book.cells.get("D1")?.value).toBe("Completed note");
    expect(
      (
        (await (
          await request(
            `/api/submissions/${f.submissionId}/data?revision=0`,
            f.user
          )
        ).json()) as { data: unknown }
      ).data
    ).toEqual(f.originalData);
    expect(
      new Uint8Array(
        await (
          await request(
            `/api/submissions/${f.submissionId}/xlsx?revision=0`,
            f.user
          )
        ).arrayBuffer()
      )
    ).toEqual(f.originalBytes);
  },
  120_000
);

correctionTest(
  "read-only persisted results and exports never load a catalog or gain editor capabilities, and Viewer mutations remain forbidden",
  async () => {
    const f = await fixture();
    let editor = await f.open();
    editor = await f.pick(editor, "folio_scalar", "Current scalar");
    snapshot = await f.bytes(editor);
    expect(
      (
        await waitFor(
          await f.action(editor, { reason: "Reviewed scalar" }, true)
        )
      ).status
    ).toBe("completed");
    const before = requests;
    upstreamStatus = 503;
    for (const revision of ["0", "latest"]) {
      for (const token of [f.admin, f.viewer]) {
        const response = await request(
          `/api/admin/results/${f.responseId}/viewer-config?revision=${revision}`,
          token
        );
        expect(response.status).toBe(200);
        const config = (await response.json()) as {
          pdmsProjectCatalog?: unknown;
          bridge?: { capabilities?: unknown };
          config: { editorConfig: { mode: string; plugins?: unknown } };
        };
        expect(config.pdmsProjectCatalog).toBeUndefined();
        expect(config.bridge?.capabilities).toBeUndefined();
        expect(config.config.editorConfig.mode).toBe("view");
        expect(config.config.editorConfig.plugins).toBeUndefined();
      }
      for (const token of [f.user, f.viewer]) {
        for (const format of ["data", "json", "xlsx", "pdf"]) {
          const response = await request(
            `/api/submissions/${f.submissionId}/${format}?revision=${revision}`,
            token
          );
          expect(response.status).toBe(200);
        }
      }
    }
    expect(requests).toBe(before);
    for (const suffix of ["", "/workspace"]) {
      expect(
        (
          await request(
            `/api/admin/results/${f.responseId}/correction${suffix}`,
            f.viewer,
            {
              documentKey: editor.config.document.key,
              data: {},
              reason: "forbidden",
            }
          )
        ).status
      ).toBe(403);
    }
    expect(
      (
        await request(
          `/api/admin/results/${f.responseId}/correction/editor-config`,
          f.viewer
        )
      ).status
    ).toBe(403);
    expect(requests).toBe(before);
  },
  120_000
);

correctionTest(
  "Correction outage retries in the same opening without publishing previews or rewriting original/prior revisions",
  async () => {
    const f = await fixture();
    let editor = await f.open();
    editor = await f.pick(editor, "folio_scalar", "Current scalar");
    snapshot = await f.bytes(editor);
    expect(
      (await waitFor(await f.action(editor, { reason: "First review" }, true)))
        .status
    ).toBe("completed");
    const prior = new Uint8Array(
      await (
        await request(
          `/api/submissions/${f.submissionId}/xlsx?revision=1`,
          f.user
        )
      ).arrayBuffer()
    );
    upstreamStatus = 503;
    const before = requests;
    editor = await f.open();
    expect(editor.pdmsProjectCatalog.status).toBe("error");
    expect(requests - before).toBe(1);
    snapshot = await f.bytes(editor);
    expect(
      (await f.action(editor, { reason: "Second review" }, true)).status
    ).toBe(422);
    expect((await f.history()).latestRevision).toBe(1);
    const same = await f.open(editor.openingId);
    expect(same.pdmsProjectCatalog.sessionId).toBe(
      editor.pdmsProjectCatalog.sessionId
    );
    expect(requests - before).toBe(1);
    upstreamStatus = 200;
    const retried = await request(
      "/api/editor/pdms-project-catalog/retry",
      editor.bridge.capabilities["save-correction"] as string,
      {
        documentKey: editor.config.document.key,
        sessionId: editor.pdmsProjectCatalog.sessionId,
      },
      true
    );
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({
      pdmsProjectCatalog: {
        status: "ready",
        sessionId: editor.pdmsProjectCatalog.sessionId,
      },
    });
    editor = await f.open(editor.openingId);
    editor = await f.pick(editor, "folio_project", "Current row", 1, {
      D1: "Second review note",
    });
    expect((await f.history()).latestRevision).toBe(1);
    snapshot = await f.bytes(editor);
    expect(
      (await waitFor(await f.action(editor, { reason: "Second review" }, true)))
        .status
    ).toBe("completed");
    expect(
      (await f.history()).revisions.map((revision) => revision.reason)
    ).toEqual([null, "First review", "Second review"]);
    expect(
      new Uint8Array(
        await (
          await request(
            `/api/submissions/${f.submissionId}/xlsx?revision=1`,
            f.user
          )
        ).arrayBuffer()
      )
    ).toEqual(prior);
    expect(
      new Uint8Array(
        await (
          await request(
            `/api/submissions/${f.submissionId}/xlsx?revision=0`,
            f.user
          )
        ).arrayBuffer()
      )
    ).toEqual(f.originalBytes);
  },
  120_000
);

correctionTest(
  "foreign, stale and reopened Correction selections cannot change the workspace or immutable Submission",
  async () => {
    const f = await fixture();
    const other = await fixture();
    let editor = await f.open();
    const foreign = await other.open();
    const oldEditor = editor;
    const selection = (
      current: Editor,
      index: number,
      name = "Current row"
    ) => ({
      sessionId: current.pdmsProjectCatalog.sessionId,
      bindingId: "folio_project",
      name,
      row: { index, documentKey: current.config.document.key },
    });
    expect(
      (await f.action(editor, { pdmsSelection: selection(foreign, 0) })).status
    ).toBe(400);
    expect(
      (
        await request(
          `/api/admin/results/${other.responseId}/correction/workspace`,
          editor.bridge.capabilities["save-correction-workspace"] as string,
          {
            documentKey: editor.config.document.key,
            data: {},
            pdmsSelection: selection(editor, 0),
          },
          true
        )
      ).status
    ).toBe(403);
    expect(
      (await f.action(editor, { pdmsSelection: selection(editor, 4) })).status
    ).toBe(422);
    expect(
      (
        await f.action(editor, {
          pdmsSelection: selection(editor, 0, "Removed record A"),
        })
      ).status
    ).toBe(422);
    const baseline = await f.bytes(editor);
    for (const typedName of ["Removed record A", "Current row"]) {
      snapshot = callbackBytes(baseline, { A4: typedName });
      expect((await waitFor(await f.action(editor))).status).toBe("failed");
      expect(await f.bytes(editor)).toEqual(baseline);
    }
    snapshot = callbackBytes(baseline, { A1: "Current scalar" });
    expect(
      (
        await waitFor(
          await f.action(editor, { pdmsSelection: selection(editor, 0) })
        )
      ).status
    ).toBe("failed");
    expect(await f.bytes(editor)).toEqual(baseline);
    editor = await f.pick(editor, "folio_project", "Current row", 0);
    expect(
      (await f.action(oldEditor, { pdmsSelection: selection(oldEditor, 1) }))
        .status
    ).toBe(409);
    expect(
      (
        await f.action(editor, {
          pdmsSelection: {
            ...selection(editor, 1),
            row: { index: 1, documentKey: oldEditor.config.document.key },
          },
        })
      ).status
    ).toBe(409);
    const reopened = await request(
      `/api/forms/${f.publicId}/start`,
      f.user,
      {}
    );
    expect(reopened.status).toBe(200);
    expect(
      (await f.action(editor, { pdmsSelection: selection(editor, 1) })).status
    ).toBe(404);
    expect(
      (
        await request(
          `/api/admin/results/${f.responseId}/correction/editor-config`,
          f.admin
        )
      ).status
    ).toBe(404);
    expect((await f.history()).latestRevision).toBe(0);
    const nextConfig = await request(
      `/api/forms/${f.publicId}/editor-config?responseId=${f.responseId}`,
      f.user
    );
    expect(nextConfig.status).toBe(200);
    const nextEditor = (await nextConfig.json()) as Editor;
    snapshot = callbackBytes(await f.bytes(nextEditor), {
      D1: "Next Submission note",
    });
    expect(
      (
        await waitFor(
          await request(
            `/api/forms/${f.publicId}/submit`,
            nextEditor.bridge.capabilities.submit as string,
            {
              documentKey: nextEditor.config.document.key,
              responseId: f.responseId,
              fillMethod: "onlyoffice",
              data: {},
              pdmsCatalogSessionId: nextEditor.pdmsProjectCatalog.sessionId,
            },
            true
          )
        )
      ).status
    ).toBe("completed");
    expect(
      (await f.action(editor, { pdmsSelection: selection(editor, 1) })).status
    ).toBe(409);
    expect((await f.history()).latestRevision).toBe(0);
    expect(
      new Uint8Array(
        await (
          await request(
            `/api/submissions/${f.submissionId}/xlsx?revision=0`,
            f.user
          )
        ).arrayBuffer()
      )
    ).toEqual(f.originalBytes);
  },
  120_000
);

correctionTest(
  "a held native callback cannot promote a preview after the User reopens its Response",
  async () => {
    const f = await fixture();
    const editor = await f.open();
    snapshot = await f.bytes(editor);
    holdCallback = true;
    lastCallback = null;
    callbackReady = Promise.withResolvers<{ key: string; userdata: string }>();
    const accepted = await f.action(editor, {
      pdmsSelection: {
        sessionId: editor.pdmsProjectCatalog.sessionId,
        bindingId: "folio_scalar",
        name: "Current scalar",
      },
    });
    expect(accepted.status).toBe(202);
    const job = (await accepted.clone().json()) as { operationId: string };
    const captured = await callbackReady.promise;
    expect(captured).toBeDefined();
    expect(
      (await request(`/api/forms/${f.publicId}/start`, f.user, {})).status
    ).toBe(200);
    const payload = { ...captured, status: 6, url: native?.url.href };
    const callback = await app.handle(
      new Request("http://test.local/onlyoffice/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createOnlyOfficeAuthorization(payload),
        },
        body: JSON.stringify(payload),
      })
    );
    expect(callback.status).toBe(200);
    holdCallback = false;
    expect((await waitFor(accepted)).status).toBe("failed");
    expect((await f.history()).latestRevision).toBe(0);
    expect(
      new Uint8Array(
        await (
          await request(
            `/api/submissions/${f.submissionId}/xlsx?revision=0`,
            f.user
          )
        ).arrayBuffer()
      )
    ).toEqual(f.originalBytes);
    expect(
      (await request(`/api/operations/${job.operationId}`, f.admin)).status
    ).toBe(200);
  },
  120_000
);

correctionTest(
  "an Admin losing its role during native capture cannot finalize a preview or Correction",
  async () => {
    for (const final of [false, true]) {
      const f = await fixture();
      const backup = await fixture();
      const editor = await f.open();
      snapshot = await f.bytes(editor);
      callbackReady = Promise.withResolvers<{
        key: string;
        userdata: string;
      }>();
      holdCallback = true;
      const accepted = await f.action(
        editor,
        final ? { reason: "Reviewed before role change" } : {},
        final
      );
      expect(accepted.status).toBe(202);
      const job = (await accepted.json()) as { operationId: string };
      const captured = await callbackReady.promise;
      const changed = await request(
        `/api/admin/users/${f.adminId}`,
        backup.admin,
        { role: "viewer" },
        false,
        "PATCH"
      );
      expect(changed.status).toBe(200);
      const payload = { ...captured, status: 6, url: native?.url.href };
      const callback = await app.handle(
        new Request("http://test.local/onlyoffice/callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: createOnlyOfficeAuthorization(payload),
          },
          body: JSON.stringify(payload),
        })
      );
      expect(callback.status).toBe(200);
      holdCallback = false;
      const polled = await request(
        `/api/operations/${job.operationId}`,
        backup.admin
      );
      expect(polled.status).toBe(200);
      expect(await polled.json()).toMatchObject({
        operation: { status: "failed" },
      });
      expect(
        (await f.action(editor, final ? { reason: "Stale role" } : {}, final))
          .status
      ).toBe(401);
      expect(
        await (
          await request(
            `/api/submissions/${f.submissionId}/corrections`,
            f.user
          )
        ).json()
      ).toMatchObject({ latestRevision: 0 });
      expect(
        new Uint8Array(
          await (
            await request(
              `/api/submissions/${f.submissionId}/xlsx?revision=0`,
              f.user
            )
          ).arrayBuffer()
        )
      ).toEqual(f.originalBytes);
    }
  },
  120_000
);
