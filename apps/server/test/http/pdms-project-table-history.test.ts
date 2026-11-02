// oxlint-disable complexity sort-keys unicorn/no-await-expression-member no-await-in-loop -- Public journeys retain sequential saved-record and revision transitions.
import { afterAll, expect, test } from "bun:test";

import { prisma } from "@onlyoffice/db";

import { createApp } from "../../src/app";
import {
  spreadsheetBindingSchema,
  spreadsheetColumnName,
} from "../../src/documents/spreadsheets/contract";
import type { SpreadsheetRange } from "../../src/documents/spreadsheets/contract";
import {
  readSpreadsheetWorkbook,
  XLSX_CONTENT_TYPE,
} from "../../src/documents/spreadsheets/workbook";
import { spreadsheetManifestFieldData } from "../../src/forms/spreadsheet-fields";
import { createOnlyOfficeAuthorization } from "../../src/onlyoffice";
import { putObject } from "../../src/storage";
import { bearerFor, createCredentialFixture } from "../fixtures/http";
import {
  descendants,
  workbookXml,
} from "../spreadsheet-runtime/runtime-fixture";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";

const enabled = process.env.RUN_PDMS_TABLE_HISTORY_HTTP === "1";
const historyTest = enabled ? test : test.skip;
let projectNames: string[] = [];
let snapshot: Uint8Array | null = null;
let lastCallback: { key: string; userdata: string } | null = null;
const upstream = enabled
  ? Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        Response.json(
          projectNames.map((name, index) => ({
            confirmation_document_number: `DOC-${index}`,
            name,
          }))
        ),
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
    ? { baseUrl: upstream.url.origin, secret: "table-history-fixture-secret" }
    : null,
  onlyOffice: {
    forceSave: (key, userdata) => {
      lastCallback = { key, userdata };
      return Promise.resolve(native ? { url: native.url.href } : false);
    },
    convertDocxToPdf: () =>
      Promise.resolve(new TextEncoder().encode("%PDF-table-history-fixture")),
  },
  onlyOfficeCallbackOrigins: native ? [native.url.origin] : [],
});
if (enabled) {
  app.listen({ hostname: "0.0.0.0", port: 18_206 });
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
  config: { document: { key: string } };
  bridge: { capabilities: Record<string, string> };
  pdmsProjectCatalog: { sessionId: string; status: string; names: string[] };
  openingId: string;
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
        error?: string;
        errorMessage?: string;
        result?: { submissionId?: string };
      };
    };
    if (["completed", "failed"].includes(operation.status)) {
      return operation;
    }
    await Bun.sleep(100);
  }
  throw new Error("Table history operation did not finish");
};
const range = (value: SpreadsheetRange) =>
  `${spreadsheetColumnName(value.firstColumn)}${value.firstRow + 1}:${spreadsheetColumnName(value.lastColumn)}${value.lastRow + 1}`;
const callbackBytes = (
  bytes: Uint8Array,
  edits: Record<string, string> = {},
  positions: Record<string, string> = {}
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
    names: {
      ...Object.fromEntries(
        [...book.names].map(([name, location]) => [
          name,
          `'${location.sheet}'!${range(location)}`,
        ])
      ),
      ...positions,
    },
  });
};
const expectFormattedRow = (bytes: Uint8Array, row: number) => {
  const xml = workbookXml(bytes);
  const styles = xml.parse("xl/styles.xml");
  const xfs = descendants(styles, "cellXfs")[0]?.children ?? [];
  const fonts = descendants(styles, "fonts")[0]?.children ?? [];
  for (const column of ["A", "B", "C"]) {
    const xf = xfs[Number(xml.cell(`${column}${row}`).style ?? "0")];
    const font = fonts[Number(xf?.attributes.fontId ?? "0")];
    expect(font?.children.some((node) => node.local === "b")).toBe(true);
    const protection = xf?.children.find((node) => node.local === "protection");
    expect(protection?.attributes.locked).toBe(column === "C" ? "0" : "1");
  }
};
const createFixture = async () => {
  const id = crypto.randomUUID();
  const publicId = id.replaceAll("-", "");
  const password = `Table-history-${id}`;
  const user = await createCredentialFixture({
    email: `table-history-${id}@example.test`,
    name: "Historical table user",
    password,
  });
  const token = await bearerFor(app, user.email, password);
  const objectKey = `tests/${id}/table-history.xlsx`;
  await putObject(
    objectKey,
    fixtureWorkbook({
      cells: [4, 5, 6, 7].flatMap((row) =>
        ["A", "B", "C"].map((column) => ({
          address: `${column}${row}`,
          style: 1,
        }))
      ),
      merges: ["A1:B1"],
      names,
    }),
    XLSX_CONTENT_TYPE
  );
  await prisma.form.create({
    data: {
      id,
      publicId,
      documentKind: "xlsx",
      status: "published",
      title: "Historical project records",
      version: 1,
      publishedTemplate: {
        create: {
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
  const start = await request(`/api/forms/${publicId}/start`, token, {});
  expect(start.status).toBe(200);
  const { response } = (await start.json()) as { response: { id: string } };
  const open = async (openingId: string = crypto.randomUUID()) => {
    const result = await request(
      `/api/forms/${publicId}/editor-config?responseId=${response.id}&pdmsOpeningId=${openingId}`,
      token
    );
    expect(result.status).toBe(200);
    return { ...((await result.json()) as Editor), openingId };
  };
  const bytes = async () => {
    const result = await request(
      `/api/responses/${response.id}/draft/xlsx`,
      token
    );
    expect(result.status).toBe(200);
    return new Uint8Array(await result.arrayBuffer());
  };
  const data = async () => {
    const result = await request(
      `/api/responses/${response.id}/draft/json`,
      token
    );
    expect(result.status).toBe(200);
    return await result.json();
  };
  const action = async (
    editor: Editor,
    body: Record<string, unknown> = {},
    submit = false
  ) =>
    await request(
      `/api/forms/${publicId}/${submit ? "submit" : "draft"}`,
      editor.bridge.capabilities[submit ? "submit" : "save-draft"] as string,
      {
        documentKey: editor.config.document.key,
        responseId: response.id,
        fillMethod: "onlyoffice",
        data: {},
        pdmsCatalogSessionId: editor.pdmsProjectCatalog.sessionId,
        ...body,
      },
      true
    );
  const pick = async (
    editor: Editor,
    name: string,
    index?: number,
    edits: Record<string, string> = {},
    bindingId = "folio_project"
  ) => {
    snapshot = callbackBytes(await bytes(), edits);
    const selected = await waitFor(
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
    expect(selected.status).toBe("completed");
    return await open(editor.openingId);
  };
  return {
    publicId,
    responseId: response.id,
    token,
    open,
    bytes,
    data,
    action,
    pick,
  };
};

historyTest(
  "renamed and removed project names stay on physical rows across empty gaps, insertion, deletion and immutable submission",
  async () => {
    const oldName = " โครงการเดิม 00123 ";
    const removedName = "โครงการที่ลบออก";
    projectNames = [oldName, removedName, "โครงการหลัก"];
    const fixture = await createFixture();
    let editor = await fixture.open();
    editor = await fixture.pick(
      editor,
      "โครงการหลัก",
      undefined,
      {
        D1: "ordinary scalar note",
      },
      "folio_scalar"
    );
    editor = await fixture.pick(editor, oldName, 1, { C5: "record A" });
    editor = await fixture.pick(editor, removedName, 3, { C7: "record B" });
    editor = await fixture.pick(editor, oldName, 3, {}, "folio_second");
    expect(await fixture.data()).toEqual({
      project_name: "โครงการหลัก",
      notes: "ordinary scalar note",
      projects: [
        { project: oldName, second_project: null, note: "record A" },
        { project: removedName, second_project: oldName, note: "record B" },
      ],
    });
    // Compact answer ordinal 0 is physical row 5; rows 4 and 6 remain empty.
    projectNames = ["โครงการเปลี่ยนชื่อ"];
    editor = await fixture.open();
    expect(editor.pdmsProjectCatalog.names).toEqual(["โครงการเปลี่ยนชื่อ"]);
    snapshot = callbackBytes(await fixture.bytes(), { C5: "record A resumed" });
    expect((await waitFor(await fixture.action(editor))).status).toBe(
      "completed"
    );
    editor = await fixture.open(editor.openingId);
    snapshot = callbackBytes(await fixture.bytes(), {
      D1: "unsaved ordinary edit",
    });
    expect(
      (
        await waitFor(
          await fixture.action(editor, {
            rowChange: { action: "insert", index: 1 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open(editor.openingId);
    let saved = await fixture.bytes();
    let book = readSpreadsheetWorkbook(saved);
    expect(book.names.get("folio_body")?.lastRow).toBe(7);
    expect(book.cells.get("A5")?.value ?? null).toBe(null);
    expect(book.cells.get("B5")?.value ?? null).toBe(null);
    expect(book.cells.get("C5")?.value ?? null).toBe(null);
    expect(book.cells.get("A6")?.value).toBe(oldName);
    expect(book.cells.get("C6")?.value).toBe("record A resumed");
    expect(book.cells.get("A8")?.value).toBe(removedName);
    expect(book.cells.get("B8")?.value).toBe(oldName);
    expectFormattedRow(saved, 5);
    expectFormattedRow(saved, 6);
    snapshot = saved;
    expect(
      (
        await waitFor(
          await fixture.action(editor, {
            rowChange: { action: "delete", index: 0 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open(editor.openingId);
    saved = await fixture.bytes();
    book = readSpreadsheetWorkbook(saved);
    expect(book.cells.get("A4")?.value ?? null).toBe(null);
    expect(book.cells.get("A5")?.value).toBe(oldName);
    expect(book.cells.get("A7")?.value).toBe(removedName);
    expect(book.cells.get("B7")?.value).toBe(oldName);
    expectFormattedRow(saved, 4);
    const expected = {
      project_name: "โครงการหลัก",
      notes: "unsaved ordinary edit",
      projects: [
        { project: oldName, second_project: null, note: "record A resumed" },
        { project: removedName, second_project: oldName, note: "record B" },
      ],
    };
    expect(await fixture.data()).toEqual(expected);
    // A successful empty catalog still accepts only the same saved physical cells.
    projectNames = [];
    editor = await fixture.open();
    expect(editor.pdmsProjectCatalog).toMatchObject({
      status: "ready",
      names: [],
    });
    snapshot = saved;
    const submitted = await waitFor(await fixture.action(editor, {}, true));
    expect(submitted.status).toBe("completed");
    const submissionId = submitted.result?.submissionId;
    expect(submissionId).toBeString();
    const originalData = await request(
      `/api/submissions/${submissionId}/json`,
      fixture.token
    );
    expect(await originalData.json()).toEqual(expected);
    const original = await request(
      `/api/submissions/${submissionId}/xlsx`,
      fixture.token
    );
    expect(original.status).toBe(200);
    const immutable = new Uint8Array(await original.arrayBuffer());
    const submittedBook = readSpreadsheetWorkbook(immutable);
    for (const [address, value] of Object.entries({
      A1: "โครงการหลัก",
      D1: "unsaved ordinary edit",
      A5: oldName,
      C5: "record A resumed",
      A7: removedName,
      B7: oldName,
      C7: "record B",
    })) {
      expect(submittedBook.cells.get(address)?.value).toBe(value);
    }
    expectFormattedRow(immutable, 5);
    // Starting the next entry does not import prior row history.
    expect(
      (await request(`/api/forms/${fixture.publicId}/start`, fixture.token, {}))
        .status
    ).toBe(200);
    editor = await fixture.open();
    snapshot = await fixture.bytes();
    expect(
      readSpreadsheetWorkbook(snapshot).cells.get("A5")?.value ?? null
    ).toBe(null);
    const rejected = await fixture.action(editor, {
      pdmsSelection: {
        sessionId: editor.pdmsProjectCatalog.sessionId,
        bindingId: "folio_project",
        name: oldName,
        row: { index: 1, documentKey: editor.config.document.key },
      },
    });
    expect(rejected.status).toBe(422);
    projectNames = ["โครงการสำหรับการส่งครั้งถัดไป"];
    editor = await fixture.open();
    editor = await fixture.pick(editor, "โครงการสำหรับการส่งครั้งถัดไป", 0, {
      C4: "next entry record",
    });
    snapshot = await fixture.bytes();
    expect((await waitFor(await fixture.action(editor, {}, true))).status).toBe(
      "completed"
    );
    const retained = await request(
      `/api/submissions/${submissionId}/xlsx`,
      fixture.token
    );
    expect(new Uint8Array(await retained.arrayBuffer())).toEqual(immutable);
    const retainedData = await request(
      `/api/submissions/${submissionId}/json`,
      fixture.token
    );
    expect(await retainedData.json()).toEqual(expected);
  },
  120_000
);

historyTest(
  "copied, duplicated, moved and native structural row changes cannot borrow another record's historical name",
  async () => {
    const oldName = "ชื่อเก่าของแถวสอง";
    const otherName = "ชื่อเก่าของแถวสี่";
    const currentName = "ชื่อใหม่ปัจจุบัน";
    projectNames = [oldName, otherName];
    const fixture = await createFixture();
    let editor = await fixture.open();
    editor = await fixture.pick(editor, oldName, 1, {
      C5: "record A",
      D1: "ordinary scalar survives failed rows",
    });
    editor = await fixture.pick(editor, otherName, 3, { C7: "record B" });
    const baseline = await fixture.bytes();
    const expected = await fixture.data();
    projectNames = [currentName];
    editor = await fixture.open();
    const unchangedKey = editor.config.document.key;
    const rejectedSnapshots = [
      // Copy to an empty physical row or another managed Field.
      callbackBytes(baseline, { A4: oldName, C4: "copied record A" }),
      callbackBytes(baseline, { B5: oldName }),
      // Duplicate a whole row into the existing empty row.
      callbackBytes(baseline, { A6: oldName, C6: "record A" }),
      // Move records while retaining the original body named range.
      callbackBytes(baseline, {
        A5: otherName,
        C5: "record B",
        A7: oldName,
        C7: "record A",
      }),
      // Native insert, delete and range move cannot establish a new mapping,
      // even when the action only crosses an empty input row.
      callbackBytes(baseline, {}, { folio_body: "'Form'!$A$4:$C$8" }),
      callbackBytes(baseline, {}, { folio_body: "'Form'!$A$4:$C$6" }),
      callbackBytes(baseline, {}, { folio_body: "'Form'!$A$5:$C$8" }),
    ];
    for (const changed of rejectedSnapshots) {
      snapshot = changed;
      const operation = await waitFor(await fixture.action(editor));
      expect(operation.status).toBe("failed");
      expect(operation.errorMessage).toBeString();
      expect(await fixture.bytes()).toEqual(baseline);
      expect(await fixture.data()).toEqual(expected);
      const retained = await fixture.open(editor.openingId);
      expect(retained.config.document.key).toBe(unchangedKey);
      expect(retained.pdmsProjectCatalog).toEqual(editor.pdmsProjectCatalog);
    }
    // A canonical worker failure must not commit ordinary inputs before the
    // row transaction succeeds, or consume its managed historical baseline.
    snapshot = callbackBytes(baseline, { C5: "must remain uncommitted" });
    const invalidRow = await waitFor(
      await fixture.action(editor, {
        rowChange: { action: "insert", index: 99 },
      })
    );
    expect(invalidRow.status).toBe("failed");
    expect(invalidRow.errorMessage).toBeString();
    expect(await fixture.bytes()).toEqual(baseline);
    expect(await fixture.data()).toEqual(expected);
    expect((await fixture.open(editor.openingId)).config.document.key).toBe(
      unchangedKey
    );
    // Supplying the same text as a picker choice does not confer history.
    expect(
      (
        await fixture.action(editor, {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: oldName,
            row: { index: 0, documentKey: unchangedKey },
          },
        })
      ).status
    ).toBe(422);
    // Failed native changes retain both editable recovery state and formatting.
    editor = await fixture.pick(editor, currentName, 0, {
      C4: "recovered ordinary row",
    });
    const recovered = await fixture.bytes();
    expectFormattedRow(recovered, 4);
    expect(readSpreadsheetWorkbook(recovered).cells.get("A5")?.value).toBe(
      oldName
    );
    expect(readSpreadsheetWorkbook(recovered).cells.get("A7")?.value).toBe(
      otherName
    );
    expect(await fixture.data()).toEqual({
      project_name: null,
      notes: "ordinary scalar survives failed rows",
      projects: [
        {
          project: currentName,
          second_project: null,
          note: "recovered ordinary row",
        },
        { project: oldName, second_project: null, note: "record A" },
        { project: otherName, second_project: null, note: "record B" },
      ],
    });
  },
  120_000
);

historyTest(
  "deleting the sole record clears its history and fences delayed choices, callback replays and native undo from the reused cell",
  async () => {
    const oldName = "ชื่อประวัติที่ต้องไม่กลับมา";
    const currentName = "ชื่อสำหรับระเบียนใหม่";
    projectNames = [oldName, currentName];
    const fixture = await createFixture();
    let editor = await fixture.open();
    // Reduce the body through the same authoritative public row actions.
    for (const index of [3, 2, 1]) {
      snapshot = await fixture.bytes();
      expect(
        (
          await waitFor(
            await fixture.action(editor, {
              rowChange: { action: "delete", index },
            })
          )
        ).status
      ).toBe("completed");
      editor = await fixture.open(editor.openingId);
    }
    editor = await fixture.pick(editor, oldName, 0, {
      C4: "deleted record note",
      D1: "unrelated scalar note",
    });
    // Appending copies a nonempty prototype's formatting, never its source or
    // ordinary values; its new historical baseline must still be blank.
    snapshot = await fixture.bytes();
    expect(
      (
        await waitFor(
          await fixture.action(editor, {
            rowChange: { action: "insert", index: 1 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open(editor.openingId);
    const appended = await fixture.bytes();
    expect(readSpreadsheetWorkbook(appended).cells.get("A4")?.value).toBe(
      oldName
    );
    expect(
      readSpreadsheetWorkbook(appended).cells.get("A5")?.value ?? null
    ).toBe(null);
    expect(
      readSpreadsheetWorkbook(appended).cells.get("C5")?.value ?? null
    ).toBe(null);
    expectFormattedRow(appended, 5);
    snapshot = appended;
    expect(
      (
        await waitFor(
          await fixture.action(editor, {
            rowChange: { action: "delete", index: 1 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open(editor.openingId);
    // Capture a completed selection specifically for the soon-deleted record.
    editor = await fixture.pick(editor, oldName, 0);
    const selectedCallback = lastCallback;
    expect(selectedCallback).not.toBeNull();
    const deletedEditor = editor;
    const beforeDelete = await fixture.bytes();
    snapshot = beforeDelete;
    expect(
      (
        await waitFor(
          await fixture.action(editor, {
            rowChange: { action: "delete", index: 0 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open(editor.openingId);
    const cleared = await fixture.bytes();
    const book = readSpreadsheetWorkbook(cleared);
    expect(book.names.get("folio_body")).toMatchObject({
      firstRow: 3,
      lastRow: 3,
    });
    expect(book.cells.get("A4")?.value ?? null).toBe(null);
    expect(book.cells.get("B4")?.value ?? null).toBe(null);
    expect(book.cells.get("C4")?.value ?? null).toBe(null);
    expect(book.cells.get("D1")?.value).toBe("unrelated scalar note");
    expectFormattedRow(cleared, 4);
    const expected = {
      project_name: null,
      notes: "unrelated scalar note",
      projects: [],
    };
    expect(await fixture.data()).toEqual(expected);
    const currentKey = editor.config.document.key;
    expect(currentKey).not.toBe(deletedEditor.config.document.key);
    // The old action capability fails, even though physical row 4 exists again.
    expect((await fixture.action(deletedEditor)).status).toBe(409);
    expect(
      (
        await fixture.action(editor, {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: currentName,
            row: { index: 0, documentKey: deletedEditor.config.document.key },
          },
        })
      ).status
    ).toBe(409);
    // An already consumed Office callback is acknowledged idempotently but
    // cannot restore the completed selection into this new document revision.
    if (!selectedCallback || !native) {
      throw new Error("Synthetic completed callback is unavailable");
    }
    snapshot = beforeDelete;
    const replayPayload = {
      ...selectedCallback,
      status: 6,
      url: native.url.href,
    };
    const replay = await app.handle(
      new Request("http://test.local/onlyoffice/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: createOnlyOfficeAuthorization(replayPayload),
        },
        body: JSON.stringify(replayPayload),
      })
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ error: 0 });
    expect(await fixture.bytes()).toEqual(cleared);
    expect(await fixture.data()).toEqual(expected);
    expect((await fixture.open(editor.openingId)).config.document.key).toBe(
      currentKey
    );
    // Native undo of the cleared row is an untrusted callback change.
    const undo = await waitFor(await fixture.action(editor));
    expect(undo.status).toBe("failed");
    expect(undo.errorMessage).toBeString();
    expect(await fixture.bytes()).toEqual(cleared);
    expect(await fixture.data()).toEqual(expected);

    projectNames = [currentName];
    editor = await fixture.open();
    expect(
      (
        await fixture.action(editor, {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: oldName,
            row: { index: 0, documentKey: editor.config.document.key },
          },
        })
      ).status
    ).toBe(422);
    // Insert a fresh record at the same physical cell. Neither this new row nor
    // the retained blank prototype may acquire the deleted name's exception.
    snapshot = cleared;
    const clearedEditor = editor;
    expect(
      (
        await waitFor(
          await fixture.action(editor, {
            rowChange: { action: "insert", index: 0 },
          })
        )
      ).status
    ).toBe("completed");
    editor = await fixture.open(editor.openingId);
    const inserted = await fixture.bytes();
    expect(
      readSpreadsheetWorkbook(inserted).cells.get("A4")?.value ?? null
    ).toBe(null);
    expect(
      readSpreadsheetWorkbook(inserted).cells.get("A5")?.value ?? null
    ).toBe(null);
    expectFormattedRow(inserted, 4);
    expectFormattedRow(inserted, 5);
    expect(
      (
        await fixture.action(editor, {
          pdmsSelection: {
            sessionId: editor.pdmsProjectCatalog.sessionId,
            bindingId: "folio_project",
            name: currentName,
            row: { index: 0, documentKey: clearedEditor.config.document.key },
          },
        })
      ).status
    ).toBe(409);
    // A native undo back to the pre-insert workbook cannot shrink the body.
    snapshot = cleared;
    expect((await waitFor(await fixture.action(editor))).status).toBe("failed");
    expect(await fixture.bytes()).toEqual(inserted);
    editor = await fixture.pick(editor, currentName, 0, {
      C4: "new record note",
    });
    const replacement = await fixture.bytes();
    expect(readSpreadsheetWorkbook(replacement).cells.get("A4")?.value).toBe(
      currentName
    );
    expect(
      readSpreadsheetWorkbook(replacement).cells.get("A5")?.value ?? null
    ).toBe(null);
    // Undo/redo of an older selection has no authority over a replacement.
    snapshot = callbackBytes(replacement, { A4: oldName });
    expect((await waitFor(await fixture.action(editor))).status).toBe("failed");
    expect(await fixture.bytes()).toEqual(replacement);
    expect(await fixture.data()).toEqual({
      project_name: null,
      notes: "unrelated scalar note",
      projects: [
        { project: currentName, second_project: null, note: "new record note" },
      ],
    });
  },
  120_000
);
