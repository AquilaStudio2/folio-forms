// oxlint-disable sort-keys unicorn/no-await-expression-member no-await-in-loop -- Public document operations are sequential and revision-fenced.
import { afterAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import {
  spreadsheetBindingSchema,
  spreadsheetColumnName,
} from "../../src/documents/spreadsheets/contract";
import {
  readSpreadsheetWorkbook,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { spreadsheetDraftFieldData } from "../../src/forms/spreadsheet-fields";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import {
  descendants,
  workbookXml,
} from "../spreadsheet-runtime/runtime-fixture";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

const enabled = process.env.RUN_PDMS_TABLE_HTTP === "1";
const workflowTest = enabled ? test : test.skip;
let requests = 0;
const upstream = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => {
        requests += 1;
        return Response.json([
          { confirmation_document_number: "DOC-1", name: "โครงการ ก" },
          { confirmation_document_number: "DOC-2", name: "Project B" },
          { confirmation_document_number: "DOC-3", name: "00123" },
        ]);
      },
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
    ? { baseUrl: upstream.url.origin, secret: "synthetic-table-secret" }
    : null,
  onlyOffice: {
    forceSave: () => Promise.resolve(native ? { url: native.url.href } : false),
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-fixture")),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_205 });
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
      label: "Notes",
      type: "text",
    },
  ],
  table: {
    id: "folio_table",
    anchor: "folio_body",
    key: "projects",
    label: "Project rows",
    columns: [
      {
        id: "folio_column_1",
        offset: 0,
        key: "column_1",
        label: "คอลัมน์ 1",
        type: "text",
      },
      {
        id: "folio_column_2",
        offset: 1,
        key: "column_2",
        label: "คอลัมน์ 2",
        type: "text",
      },
      {
        id: "folio_note_column",
        offset: 2,
        key: "note",
        label: "Row note",
        type: "text",
      },
    ],
  },
});
const names = {
  folio_scalar: "'Form'!$A$1:$B$1",
  folio_note: "'Form'!$D$1",
  folio_body: "'Form'!$A$4:$C$6",
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
const poll = async (id: string, capability: string) => {
  for (let count = 0; count < 300; count += 1) {
    const response = await request(
      `/api/operations/${id}`,
      capability,
      undefined,
      true
    );
    expect(response.status).toBe(200);
    const { operation } = (await response.json()) as {
      operation: {
        status: string;
        result?: Record<string, unknown>;
        error?: string;
      };
    };
    if (["completed", "failed"].includes(operation.status)) {
      return operation;
    }
    await Bun.sleep(100);
  }
  throw new Error("Table operation did not finish");
};
const waitFor = async (response: Response) => {
  expect(response.status).toBe(202);
  const job = (await response.json()) as {
    operationId: string;
    operationCapability: string;
  };
  return await poll(job.operationId, job.operationCapability);
};
interface Config {
  config: { document: { key: string } };
  bridge: { capabilities: Record<string, string> };
  pdmsProjectCatalog: { sessionId: string; status: string; names: string[] };
}

const address = (column: number, row: number) =>
  `${spreadsheetColumnName(column)}${row + 1}`;
const range = (value: {
  firstColumn: number;
  lastColumn: number;
  firstRow: number;
  lastRow: number;
}) =>
  `${address(value.firstColumn, value.firstRow)}:${address(value.lastColumn, value.lastRow)}`;
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
  for (const [cell, value] of Object.entries(edits)) {
    cells.set(cell, { address: cell, value });
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

const expectProtectedRows = (bytes: Uint8Array, lastRow: number) => {
  const xml = workbookXml(bytes);
  const styles =
    descendants(xml.parse("xl/styles.xml"), "cellXfs")[0]?.children ?? [];
  const locked = (cell: string) =>
    styles[Number(xml.cell(cell).style ?? "0")]?.children.find(
      (node) => node.local === "protection"
    )?.attributes.locked;
  expect(descendants(xml.sheet, "sheetProtection")[0]?.attributes.sheet).toBe(
    "1"
  );
  expect(locked("A1")).toBe("1");
  expect(locked("D1")).toBe("0");
  for (let row = 4; row <= lastRow; row += 1) {
    expect(locked(`A${row}`)).toBe("1");
    expect(locked(`B${row}`)).toBe("1");
    expect(locked(`C${row}`)).toBe("0");
  }
};

const openTable = async () => {
  const id = crypto.randomUUID();
  const publicId = id.replaceAll("-", "");
  const password = `Table-${id}`;
  const admin = await createCredentialFixture({
    email: `admin-${id}@example.test`,
    name: "Table author",
    role: "admin",
    password,
  });
  const user = await createCredentialFixture({
    email: `user-${id}@example.test`,
    name: "Table user",
    password,
  });
  const adminToken = await bearerFor(app, admin.email, password);
  const userToken = await bearerFor(app, user.email, password);
  const objectKey = `tests/${id}/template.xlsx`;
  snapshot = fixtureWorkbook({
    cells: [
      { address: "A4", value: "Template project sample" },
      { address: "B5", value: "Another template sample" },
    ],
    names,
    merges: ["A1:B1"],
  });
  await putObject(objectKey, snapshot, XLSX_CONTENT_TYPE);
  await prisma.form.create({
    data: {
      id,
      publicId,
      documentKind: "xlsx",
      title: "Managed project table",
      templateDraft: {
        create: {
          bindingRevision: 1,
          objectKey,
          documentKey: `template-${id}`,
          fieldRules: { create: spreadsheetDraftFieldData(bindings) },
        },
      },
    },
  });
  const author = (await (
    await request(`/api/admin/forms/${publicId}/editor-config`, adminToken)
  ).json()) as Config;
  const sourceColumn = (
    column: typeof bindings.table extends null
      ? never
      : NonNullable<typeof bindings.table>["columns"][number]
  ) => ({
    ...column,
    source: "pdms-project-name",
    type: "dropdown",
    options: [],
  });
  for (let index = 0; index < 2; index += 1) {
    const column = bindings.table?.columns[index];
    if (!column) {
      throw new Error("Table fixture column is missing");
    }
    const changed = await request(
      `/api/admin/forms/${publicId}/spreadsheet-bindings`,
      author.bridge.capabilities["configure-fields"] as string,
      {
        documentKey: `template-${id}`,
        revision: index + 1,
        change: {
          action: "upsert",
          kind: "column",
          value: sourceColumn(column),
        },
      },
      true,
      "PATCH"
    );
    expect(changed.status).toBe(200);
  }
  const reopened = await request(
    `/api/admin/forms/${publicId}/spreadsheet-bindings`,
    author.bridge.capabilities["configure-fields"] as string,
    undefined,
    true
  );
  expect(await reopened.json()).toMatchObject({
    bindings: {
      table: {
        key: "projects",
        columns: [
          {
            id: "folio_column_1",
            key: "column_1",
            label: "คอลัมน์ 1",
            source: "pdms-project-name",
            type: "dropdown",
          },
          {
            id: "folio_column_2",
            key: "column_2",
            label: "คอลัมน์ 2",
            source: "pdms-project-name",
            type: "dropdown",
          },
          { key: "note", type: "text" },
        ],
      },
    },
  });
  const published = await waitFor(
    await request(
      `/api/admin/forms/${publicId}/publish`,
      author.bridge.capabilities.publish as string,
      {
        documentKey: `template-${id}`,
        spreadsheetAnchors: Object.entries(names),
      },
      true
    )
  );
  expect(published.status).toBe("completed");
  const start = await request(`/api/forms/${publicId}/start`, userToken, {});
  expect(start.status).toBe(200);
  const { response } = (await start.json()) as { response: { id: string } };
  const openingId = crypto.randomUUID();
  const getConfig = async () => {
    const result = await request(
      `/api/forms/${publicId}/editor-config?responseId=${response.id}&pdmsOpeningId=${openingId}`,
      userToken
    );
    expect(result.status).toBe(200);
    return (await result.json()) as Config;
  };
  const getBytes = async () => {
    const result = await request(
      `/api/responses/${response.id}/draft/xlsx`,
      userToken
    );
    expect(result.status).toBe(200);
    return new Uint8Array(await result.arrayBuffer());
  };
  const getData = async () =>
    await (
      await request(`/api/responses/${response.id}/draft/json`, userToken)
    ).json();
  const editor = await getConfig();
  const action = async (
    current: Config,
    body: Record<string, unknown> = {},
    submit = false
  ) =>
    await request(
      `/api/forms/${publicId}/${submit ? "submit" : "draft"}`,
      current.bridge.capabilities[submit ? "submit" : "save-draft"] as string,
      {
        documentKey: current.config.document.key,
        responseId: response.id,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: current.pdmsProjectCatalog.sessionId,
        ...body,
      },
      true
    );
  return { publicId, userToken, editor, getConfig, getBytes, getData, action };
};

workflowTest(
  "fresh Response clears managed table examples while preserving configured column Title and Tag",
  async () => {
    const workflow = await openTable();
    expect(workflow.editor.pdmsProjectCatalog.status).toBe("ready");
    const book = readSpreadsheetWorkbook(await workflow.getBytes());
    expect(book.cells.get("A4")?.value ?? null).toBe(null);
    expect(book.cells.get("B5")?.value ?? null).toBe(null);
  },
  120_000
);

workflowTest(
  "selecting a project for a physical table row saves the name under its unchanged nested Tag",
  async () => {
    const workflow = await openTable();
    snapshot = await workflow.getBytes();
    const selected = await workflow.action(workflow.editor, {
      pdmsSelection: {
        sessionId: workflow.editor.pdmsProjectCatalog.sessionId,
        bindingId: "folio_column_1",
        name: "00123",
        row: { index: 1, documentKey: workflow.editor.config.document.key },
      },
    });
    expect(selected.status).toBe(202);
    expect((await waitFor(selected)).status).toBe("completed");
    expect(await workflow.getData()).toEqual({
      project_name: null,
      notes: null,
      projects: [{ column_1: "00123", column_2: null, note: null }],
    });
    const book = readSpreadsheetWorkbook(await workflow.getBytes());
    expect(book.cells.get("A5")?.value).toBe("00123");
    expect(book.cells.get("A4")?.value ?? null).toBe(null);
    expect(book.cells.get("A6")?.value ?? null).toBe(null);
  },
  120_000
);

workflowTest(
  "consecutive scalar and table choices preserve unsaved inputs and follow explicit inserted and deleted rows through submission",
  async () => {
    const openedRequests = requests;
    const workflow = await openTable();
    let { editor } = workflow;
    const catalog = editor.pdmsProjectCatalog;
    const pick = async (
      bindingId: string,
      name: string,
      index?: number,
      edits: Record<string, string> = {}
    ) => {
      snapshot = callbackBytes(await workflow.getBytes(), edits);
      const result = await waitFor(
        await workflow.action(editor, {
          pdmsSelection: {
            sessionId: catalog.sessionId,
            bindingId,
            name,
            ...(index === undefined
              ? {}
              : { row: { index, documentKey: editor.config.document.key } }),
          },
        })
      );
      expect(result.status).toBe("completed");
      editor = await workflow.getConfig();
      expect(editor.pdmsProjectCatalog).toEqual(catalog);
    };
    await pick("folio_scalar", "Project B", undefined, {
      D1: "unsaved scalar note",
      C5: "row two note",
    });
    await pick("folio_column_1", "00123", 1);
    await pick("folio_column_2", "โครงการ ก", 0, { C4: "row one note" });
    expect(await workflow.getData()).toEqual({
      project_name: "Project B",
      notes: "unsaved scalar note",
      projects: [
        { column_1: null, column_2: "โครงการ ก", note: "row one note" },
        { column_1: "00123", column_2: null, note: "row two note" },
      ],
    });
    const oldKey = editor.config.document.key;
    snapshot = await workflow.getBytes();
    expect(
      (
        await waitFor(
          await workflow.action(editor, {
            rowChange: { action: "insert", index: 1 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await workflow.getConfig();
    const insertedBytes = await workflow.getBytes();
    expectProtectedRows(insertedBytes, 7);
    let book = readSpreadsheetWorkbook(insertedBytes);
    expect(book.names.get("folio_body")?.lastRow).toBe(6);
    expect(book.cells.get("A5")?.value ?? null).toBe(null);
    expect(book.cells.get("A6")?.value).toBe("00123");
    expect(book.cells.get("C6")?.value).toBe("row two note");
    const delayed = await workflow.action(editor, {
      pdmsSelection: {
        sessionId: catalog.sessionId,
        bindingId: "folio_column_1",
        name: "Project B",
        row: { index: 1, documentKey: oldKey },
      },
    });
    expect(delayed.status).toBe(409);
    await pick("folio_column_1", "Project B", 1);
    snapshot = await workflow.getBytes();
    expect(
      (
        await waitFor(
          await workflow.action(editor, {
            rowChange: { action: "delete", index: 0 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await workflow.getConfig();
    const deletedBytes = await workflow.getBytes();
    expectProtectedRows(deletedBytes, 6);
    book = readSpreadsheetWorkbook(deletedBytes);
    expect(book.names.get("folio_body")?.lastRow).toBe(5);
    expect(book.cells.get("A4")?.value).toBe("Project B");
    expect(book.cells.get("A5")?.value).toBe("00123");
    expect(book.cells.get("B4")?.value ?? null).toBe(null);
    expect(book.cells.get("C5")?.value).toBe("row two note");
    const expected = {
      project_name: "Project B",
      notes: "unsaved scalar note",
      projects: [
        { column_1: "Project B", column_2: null, note: null },
        { column_1: "00123", column_2: null, note: "row two note" },
      ],
    };
    expect(await workflow.getData()).toEqual(expected);
    snapshot = await workflow.getBytes();
    expect(
      (await waitFor(await workflow.action(editor, {}, true))).status
    ).toBe("completed");
    const submissions = await request(
      `/api/forms/${workflow.publicId}/my-submissions/export`,
      workflow.userToken
    );
    expect(await submissions.json()).toMatchObject([{ data: expected }]);
    // One successful snapshot serves scalar fields, every table column and all reloads.
    expect(requests - openedRequests).toBe(2);
  },
  120_000
);

workflowTest(
  "invalid row claims and native protected-cell tampering cannot establish a project selection",
  async () => {
    const workflow = await openTable();
    const { editor } = workflow;
    const selection = {
      sessionId: editor.pdmsProjectCatalog.sessionId,
      bindingId: "folio_column_1",
      name: "Project B",
      row: { index: 1, documentKey: editor.config.document.key },
    };
    snapshot = await workflow.getBytes();
    const unchanged = snapshot;
    expect(
      (
        await workflow.action(editor, {
          pdmsSelection: { ...selection, row: undefined },
        })
      ).status
    ).toBe(422);
    expect(
      (
        await workflow.action(editor, {
          pdmsSelection: { ...selection, row: { ...selection.row, index: 3 } },
        })
      ).status
    ).toBe(422);
    expect(
      (
        await workflow.action(editor, {
          pdmsSelection: { ...selection, row: { ...selection.row, index: -1 } },
        })
      ).status
    ).toBe(400);
    expect(
      (
        await workflow.action(editor, {
          pdmsSelection: { ...selection, bindingId: "folio_foreign" },
        })
      ).status
    ).toBe(422);
    expect(
      (
        await workflow.action(editor, {
          pdmsSelection: { ...selection, bindingId: "folio_note_column" },
        })
      ).status
    ).toBe(422);
    expect(
      (
        await workflow.action(editor, {
          pdmsSelection: selection,
          rowChange: { action: "delete", index: 0 },
        })
      ).status
    ).toBe(400);
    // A callback containing a current valid name still has no picker provenance.
    snapshot = callbackBytes(unchanged, {
      A4: "Project B",
      C5: "ordinary unsaved text",
    });
    expect((await waitFor(await workflow.action(editor))).status).toBe(
      "failed"
    );
    expect(await workflow.getBytes()).toEqual(new Uint8Array(unchanged));
    expect(await workflow.getData()).toEqual({});
    const retained = await workflow.getConfig();
    expect(retained.config.document.key).toBe(editor.config.document.key);
    expect(retained.pdmsProjectCatalog).toEqual(editor.pdmsProjectCatalog);
    // Failure retains the exact revision so a genuine picker action can retry.
    snapshot = callbackBytes(unchanged, { C5: "ordinary unsaved text" });
    expect(
      (
        await waitFor(
          await workflow.action(retained, { pdmsSelection: selection })
        )
      ).status
    ).toBe("completed");
    expect(await workflow.getData()).toEqual({
      project_name: null,
      notes: null,
      projects: [
        {
          column_1: "Project B",
          column_2: null,
          note: "ordinary unsaved text",
        },
      ],
    });
  },
  120_000
);
