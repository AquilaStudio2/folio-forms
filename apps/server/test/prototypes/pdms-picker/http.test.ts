// oxlint-disable no-await-in-loop sort-keys unicorn/no-await-expression-member -- Polling/fixture startup is ordered; expected answer literals follow the user-facing shape.
// The external forceSave transport is supplied; Folio HTTP operations, storage,
// extraction, protection and the pinned real HTTP builder run unchanged.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  descendants,
  workbookXml,
} from "../../spreadsheet-runtime/runtime-fixture";
import { fixtureWorkbook } from "../../spreadsheet-unit/fixture";

const enabled = process.env.RUN_PDMS_PICKER_PROTOTYPE_HTTP === "1";
let directory = "";
let snapshotPath = "";
let child: ReturnType<typeof Bun.spawn>;
let fixture: { origin: string; session: string };
const request = async (route: string, body?: unknown) => {
  const response = await fetch(`${fixture.origin}/prototype/${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "X-Prototype-Session": fixture.session,
    },
    method: body === undefined ? "GET" : "POST",
  });
  expect(response.ok).toBe(true);
  return response.json() as Promise<{
    operation: { status: string };
    revision: number;
    data: unknown;
    cells: Record<string, unknown>;
  }>;
};
const terminalOperation = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await request("poll");
    if (["completed", "failed"].includes(state.operation?.status)) {
      return state.operation;
    }
    await Bun.sleep(250);
  }
  throw new Error("HTTP operation did not finish");
};
beforeAll(async () => {
  if (!enabled) {
    return;
  }
  directory = await mkdtemp(path.join(tmpdir(), "folio-pdms-prototype-http-"));
  snapshotPath = path.join(directory, "native.xlsx");
  await Bun.write(
    snapshotPath,
    fixtureWorkbook({
      cells: [
        { address: "C1", value: "unsaved scalar" },
        { address: "B4", value: "unsaved row" },
      ],
      merges: ["A1:B1"],
      names: {
        folio_items: "'Form'!$A$4:$B$6",
        folio_note: "'Form'!$C$1",
        folio_project: "'Form'!$A$1:$B$1",
      },
    })
  );
  const statePath = path.join(directory, "state.json");
  child = Bun.spawn([process.execPath, `${import.meta.dir}/live.ts`], {
    env: {
      ...process.env,
      ONLYOFFICE_DOCUMENT_BASE_URL: "http://host.docker.internal:58103",
      PDMS_PROTOTYPE_NATIVE_SNAPSHOT: snapshotPath,
      PDMS_PROTOTYPE_PORT: "58103",
      PDMS_PROTOTYPE_STATE_PATH: statePath,
    },
    stderr: "pipe",
    stdout: "ignore",
  });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await Bun.file(statePath).exists()) {
      fixture = await Bun.file(statePath).json();
      return;
    }
    if (child.exitCode !== null) {
      throw new Error(
        await new Response(child.stderr as ReadableStream<Uint8Array>).text()
      );
    }
    await Bun.sleep(100);
  }
  throw new Error("Prototype fixture did not start");
}, 30_000);
afterAll(async () => {
  child?.kill();
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

test.skipIf(!enabled)(
  "authorized project selection saves the full native answers through Folio and exports matching XLSX/data",
  async () => {
    const selected = await request("select", {
      expected: { note: "unsaved scalar", rowNote: "unsaved row" },
      name: "โครงการทดสอบ 2499",
      revision: 0,
      target: "project",
    });
    expect(selected.revision).toBe(1);
    const operation = await terminalOperation();
    expect(operation.status).toBe("completed");
    const saved = await request("result");
    expect(saved.data).toEqual({
      items: [{ project: null, note: "unsaved row" }],
      note: "unsaved scalar",
      project: "โครงการทดสอบ 2499",
    });
    expect(saved.cells).toMatchObject({
      A1: "โครงการทดสอบ 2499",
      B4: "unsaved row",
      C1: "unsaved scalar",
    });
    const exported = await fetch(`${fixture.origin}/prototype/export`, {
      headers: { "X-Prototype-Session": fixture.session },
    });
    await Bun.write(snapshotPath, await exported.arrayBuffer());
    await fetch(fixture.origin);
  },
  120_000
);

test.skipIf(!enabled)(
  "a later table selection retains the previously saved merged project",
  async () => {
    await request("select", {
      expected: { note: "unsaved scalar", rowNote: "unsaved row" },
      name: "โครงการทดสอบ 0001",
      revision: 1,
      target: "table",
    });
    expect((await terminalOperation()).status).toBe("completed");
    const saved = await request("result");
    expect(saved.data).toEqual({
      project: "โครงการทดสอบ 2499",
      note: "unsaved scalar",
      items: [{ project: "โครงการทดสอบ 0001", note: "unsaved row" }],
    });
    const exported = await fetch(`${fixture.origin}/prototype/export`, {
      headers: { "X-Prototype-Session": fixture.session },
    });
    await Bun.write(snapshotPath, await exported.arrayBuffer());
    await fetch(fixture.origin);
  },
  120_000
);

test.skipIf(!enabled)(
  "a stale native snapshot fails without overwriting the saved Draft",
  async () => {
    await request("select", {
      expected: { note: "newer unsaved work", rowNote: "unsaved row" },
      name: "โครงการทดสอบ 0001",
      revision: 2,
      target: "table",
    });
    const operation = await terminalOperation();
    expect(operation.status).toBe("failed");
    const saved = await request("result");
    expect(saved.data).toEqual({
      items: [{ project: "โครงการทดสอบ 0001", note: "unsaved row" }],
      note: "unsaved scalar",
      project: "โครงการทดสอบ 2499",
    });
  },
  120_000
);

test.skipIf(!enabled)(
  "representative row insertion keeps protected project cells and ordinary inputs aligned",
  async () => {
    await request("row", { note: "unsaved scalar", rowNote: "unsaved row" });
    expect((await terminalOperation()).status).toBe("completed");
    const download = await fetch(`${fixture.origin}/prototype/export`, {
      headers: { "X-Prototype-Session": fixture.session },
    });
    expect(download.status).toBe(200);
    const workbook = workbookXml(new Uint8Array(await download.arrayBuffer()));
    expect(workbook.names.folio_items?.replaceAll("'", "")).toBe(
      "Form!$A$4:$B$7"
    );
    expect(descendants(workbook.sheet, "sheetProtection")).toHaveLength(1);
    const xfs =
      descendants(workbook.parse("xl/styles.xml"), "cellXfs")[0]?.children ??
      [];
    const locked = (address: string) =>
      xfs[Number(workbook.cell(address).style)]?.children.find(
        (node) => node.local === "protection"
      )?.attributes.locked;
    expect({
      merged: locked("A1"),
      project: locked("A5"),
      ordinary: locked("B5"),
    }).toEqual({ merged: "1", project: "1", ordinary: "0" });
    const saved = await request("result");
    expect(saved.data).toEqual({
      project: "โครงการทดสอบ 2499",
      note: "unsaved scalar",
      items: [{ project: "โครงการทดสอบ 0001", note: "unsaved row" }],
    });
  },
  120_000
);
