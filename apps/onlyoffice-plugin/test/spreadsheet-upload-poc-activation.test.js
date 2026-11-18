// oxlint-disable prefer-await-to-callbacks -- Lifecycle tests inject activation and error observers to control readiness races.
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { spreadsheetUploadPocActivationCommand } from "../src/spreadsheet-upload-poc-activation.js";
import { createUploadPocActivationLifecycle } from "../src/upload-poc-activation-lifecycle.js";

const guid = "asc.{804C7D5D-8243-47D9-87A2-64E42806D42F}";
const harness = () => {
  let locked = true;
  let mutations = 0;
  let historyDepth = 0;
  let unsavedHistory = 0;
  const recordMutation = () => {
    mutations += 1;
    if (historyDepth === 0) {
      unsavedHistory += 1;
    }
  };
  const history = {
    TurnOff: () => {
      historyDepth += 1;
    },
    TurnOn: () => {
      historyDepth -= 1;
    },
  };
  const locks = new Map();
  const metadata = {
    bindingId: "folio_attachment",
    kind: "folio-upload-poc",
    rowIndex: null,
    tag: "attachment",
    version: 1,
  };
  const object = {
    Drawing: {
      drawingBase: { from: { col: 1, row: 2 } },
      getProtectionLocked: () => locked,
      setProtectionLocked: (value) => {
        locked = value;
        recordMutation();
      },
    },
    GetApplicationId: () => guid,
    GetData: () => JSON.stringify(metadata),
    GetLockValue: (type) => locks.get(type),
    SetLockValue: (type, value) => {
      locks.set(type, value);
      recordMutation();
      return true;
    },
  };
  const objects = [object, { GetApplicationId: () => "ordinary-author-image" }];
  const cells = new Map([
    ["2:1", "https://example.test/a"],
    ["2:2", "LATER"],
  ]);
  const visible = new Map(cells);
  const hyperlinks = new Map([["2:1", "https://example.test/a"]]);
  const worksheet = {
    getId: () => "sheet",
    getRange3: (row, column) => {
      const key = `${row}:${column}`;
      return {
        bbox: { c1: column, c2: column, r1: row, r2: row },
        cleanHyperlinks: () => {
          hyperlinks.delete(key);
          recordMutation();
        },
        getValue: () => cells.get(key) ?? "",
        setValue: (value) => {
          cells.set(key, value);
          recordMutation();
        },
        worksheet,
      };
    },
    workbook: {
      handlers: {
        trigger: (_event, _sheet, ranges) => {
          for (const box of ranges) {
            visible.delete(`${box.r1}:${box.c1}`);
          }
        },
      },
      oApi: {
        onWorksheetChange: (box) => {
          const key = `${box.r1}:${box.c1}`;
          visible.set(key, cells.get(key));
        },
      },
    },
  };
  const sheet = { GetAllOleObjects: () => objects, GetName: () => "Sheet1" };
  const range = {
    GetCol: () => 2,
    GetRow: () => 3,
    GetRowsCount: () => 1,
    GetWorksheet: () => sheet,
    range: { worksheet },
  };
  const bindings = {
    fields: [
      {
        anchor: "folio_attachment",
        computed: false,
        id: "folio_attachment",
        key: "attachment",
        type: "text",
      },
    ],
    table: null,
  };
  const run = (savedData) =>
    JSON.parse(
      runInNewContext(
        `(${spreadsheetUploadPocActivationCommand.toString()})()`,
        {
          Api: {
            GetActiveSheet: () => sheet,
            GetDefName: () => ({ GetRefersToRange: () => range }),
          },
          Asc: {
            scope: { folioUploadPocActivation: { bindings, guid, savedData } },
          },
          AscCommon: { History: history },
        }
      )
    );
  return {
    bindings,
    cell: (row, column) => cells.get(`${row}:${column}`),
    history,
    historyDepth: () => historyDepth,
    metadata,
    mutations: () => mutations,
    object,
    objects,
    range,
    run,
    unsavedHistory: () => unsavedHistory,
    visible: (row, column) => visible.get(`${row}:${column}`),
  };
};

test("9.4 activation unlocks only validated POC object and retains move/resize locks", () => {
  const h = harness();
  expect(h.run()).toEqual({ count: 1, ok: true });
  expect(h.object.Drawing.getProtectionLocked()).toBe(false);
  expect(h.object.GetLockValue("noMove")).toBe(true);
  expect(h.object.GetLockValue("noResize")).toBe(true);
  expect(h.object.GetLockValue("noSelect")).toBe(false);
  expect(h.unsavedHistory()).toBe(0);
  expect(h.historyDepth()).toBe(0);
  h.object.SetLockValue("noSelect", true);
  expect(h.unsavedHistory()).toBe(1);
});

test("retained canonical projection updates only verified attachment cells without discarding later answers or history", () => {
  const h = harness();
  h.bindings.fields[0].attachment = { category: "Proof" };
  expect(
    h.run({ attachment: { file_link: "https://example.test/b" } }).ok
  ).toBe(true);
  expect(h.cell(2, 1)).toBe("https://example.test/b");
  expect(h.visible(2, 1)).toBe("https://example.test/b");
  expect(h.cell(2, 2)).toBe("LATER");
  expect(h.unsavedHistory()).toBe(0);
  expect(h.historyDepth()).toBe(0);
});

test("canonical table projections follow physical row_index across compact empty gaps", () => {
  const h = harness();
  h.bindings.fields = [];
  h.bindings.table = {
    anchor: "folio_table",
    columns: [
      {
        attachment: { category: "Proof" },
        id: "folio_attachment",
        key: "file",
        offset: 0,
        type: "text",
      },
    ],
    id: "folio_table",
    key: "items",
  };
  h.metadata.rowIndex = 1;
  h.metadata.tag = "items.file";
  h.object.Drawing.drawingBase.from.row = 3;
  h.range.GetRowsCount = () => 2;
  h.objects.push({
    ...h.object,
    Drawing: { ...h.object.Drawing, drawingBase: { from: { col: 1, row: 2 } } },
    GetData: () => JSON.stringify({ ...h.metadata, rowIndex: 0 }),
  });
  expect(
    h.run({
      items: [{ file: { file_link: "https://example.test/b", row_index: 1 } }],
    }).ok
  ).toBe(true);
  expect(h.cell(2, 1)).toBe("");
  expect(h.cell(3, 1)).toBe("https://example.test/b");
  expect(h.cell(2, 2)).toBe("LATER");
});

test("ordinary old PoC text is never rewritten by attachment projection", () => {
  const h = harness();
  expect(
    h.run({ attachment: { file_link: "https://example.test/b" } }).ok
  ).toBe(true);
  expect(h.cell(2, 1)).toBe("https://example.test/a");
});

test("canonical projection rejects unsafe links or missing controls before any native change", () => {
  const unsafe = harness();
  unsafe.bindings.fields[0].attachment = { category: "Proof" };
  expect(
    // oxlint-disable-next-line no-script-url -- Reject executable links before changing a protected projection.
    unsafe.run({ attachment: { file_link: "javascript:alert(1)" } }).ok
  ).toBe(false);
  expect(unsafe.mutations()).toBe(0);
  expect(unsafe.cell(2, 1)).toBe("https://example.test/a");
  const missing = harness();
  missing.bindings.fields[0].attachment = { category: "Proof" };
  missing.objects.shift();
  expect(missing.run({}).ok).toBe(false);
  expect(missing.mutations()).toBe(0);
});

test("9.4 activation validates all recognized objects before any mutation", () => {
  const h = harness();
  h.objects.push({
    GetApplicationId: () => guid,
    GetData: () => JSON.stringify({ ...h.metadata, file: "unexpected" }),
  });
  expect(h.run().ok).toBe(false);
  expect(h.mutations()).toBe(0);
  expect(h.object.Drawing.getProtectionLocked()).toBe(true);
});

test("9.4 activation fails closed for wrong coordinates, binding or unsupported native API", () => {
  const moved = harness();
  moved.object.Drawing.drawingBase.from.row = 3;
  expect(moved.run().ok).toBe(false);
  expect(moved.mutations()).toBe(0);
  const incompatible = harness();
  incompatible.bindings.fields[0].type = "number";
  expect(incompatible.run().ok).toBe(false);
  expect(incompatible.mutations()).toBe(0);
  const unsupported = harness();
  unsupported.object.Drawing.setProtectionLocked = undefined;
  expect(unsupported.run().ok).toBe(false);
  expect(unsupported.mutations()).toBe(0);
  const unsupportedHistory = harness();
  unsupportedHistory.history.TurnOff = undefined;
  expect(unsupportedHistory.run().ok).toBe(false);
  expect(unsupportedHistory.mutations()).toBe(0);
});

test("public lock getter proof precedes private unlock and failed unlock rolls protection back", () => {
  const publicFailure = harness();
  const calls = [];
  const originalSetter = publicFailure.object.Drawing.setProtectionLocked;
  publicFailure.object.Drawing.setProtectionLocked = (value) => {
    calls.push(value);
    originalSetter(value);
  };
  publicFailure.object.GetLockValue = () => false;
  expect(publicFailure.run().ok).toBe(false);
  expect(calls).not.toContain(false);
  expect(publicFailure.object.Drawing.getProtectionLocked()).toBe(true);
  expect(publicFailure.historyDepth()).toBe(0);
  expect(publicFailure.unsavedHistory()).toBe(0);

  const privateFailure = harness();
  const originalGetter = privateFailure.object.Drawing.getProtectionLocked;
  privateFailure.object.Drawing.getProtectionLocked = () => true;
  expect(privateFailure.run().ok).toBe(false);
  expect(originalGetter()).toBe(true);
  expect(privateFailure.historyDepth()).toBe(0);
  expect(privateFailure.unsavedHistory()).toBe(0);
});

test("early fallback failure cannot consume the later content-ready activation", async () => {
  let calls = 0;
  const errors = [];
  const lifecycle = createUploadPocActivationLifecycle(
    () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("document not ready");
      }
    },
    (error) => errors.push(error.message)
  );
  await lifecycle.fallback();
  expect(calls).toBe(1);
  expect(errors).toEqual(["document not ready"]);
  await lifecycle.ready();
  await lifecycle.ready();
  await lifecycle.fallback();
  expect(calls).toBe(2);
});

test("content-ready during an early in-flight fallback schedules one settled retry", async () => {
  let calls = 0;
  const gate = Promise.withResolvers();
  const errors = [];
  const lifecycle = createUploadPocActivationLifecycle(
    async () => {
      calls += 1;
      if (calls === 1) {
        await gate.promise;
      }
    },
    (error) => errors.push(error)
  );
  const early = lifecycle.fallback();
  await Promise.resolve();
  expect(calls).toBe(1);
  const ready = lifecycle.ready();
  gate.resolve();
  await Promise.all([early, ready]);
  expect(calls).toBe(2);
  expect(errors).toHaveLength(0);
});

test("ready-first initialization activates once even when fallback and ready repeat", async () => {
  let calls = 0;
  const errors = [];
  const lifecycle = createUploadPocActivationLifecycle(
    () => {
      calls += 1;
    },
    (error) => errors.push(error)
  );
  await lifecycle.ready();
  await lifecycle.fallback();
  await lifecycle.ready();
  expect(calls).toBe(1);
});
