import { expect, test } from "bun:test";

import { uploadPocGuid } from "../../server/src/documents/spreadsheets/upload-poc-preview.ts";
import { selectedUploadPocBinding } from "../src/spreadsheet-upload-poc.js";
import { acknowledgeBridge, createHarness, flushPlugin } from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const control = (harness, title) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === title
  )?.children[1];
const removeButton = (harness) =>
  descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === "ลบช่องนี้"
  );
const field = (id, key, label) => ({
  anchor: id,
  computed: false,
  id,
  key,
  label,
  options: [],
  required: false,
  type: "text",
});
const first = field("folio_first", "first", "First attachment");
const second = field("folio_second", "second", "Second attachment");
const proof = { ...field("folio_proof", "proof", "Table proof"), offset: 0 };
const bindings = {
  fields: [first, second],
  table: {
    anchor: "folio_items",
    columns: [proof],
    id: "folio_items",
    key: "items",
    label: "Items",
  },
  version: 1,
};
const names = {
  _folio_upload_poc_folio_first: "'Sheet1'!$B$3",
  _folio_upload_poc_folio_proof: "'Sheet1'!$B$7:$B$9",
  _folio_upload_poc_folio_second: "'Sheet1'!$D$13",
  folio_column_folio_proof: "'Sheet1'!$B$7:$B$9",
  folio_columns_folio_items: "'Sheet1'!$B$7:$B$9",
  folio_first: "'Sheet1'!$B$3",
  folio_items: "'Sheet1'!$B$7:$B$9",
  folio_second: "'Sheet1'!$D$13",
};
const object = (item, row, col, rowIndex = null, changes = {}) => ({
  Drawing: {
    Id: `${item.id}_${row}`,
    deleteDrawingBase() {
      this.removed = true;
    },
    drawingBase: { from: { col, row } },
  },
  GetApplicationId: () => uploadPocGuid,
  GetData: () =>
    JSON.stringify({
      bindingId: item.id,
      kind: "folio-upload-poc",
      rowIndex,
      tag: item === proof ? "items.proof" : item.key,
      version: 1,
      ...changes,
    }),
});
const setup = async (drawings, { failSave = false, saveFailures = 0 } = {}) => {
  const state = structuredClone(bindings);
  let revision = 0;
  let remainingSaveFailures = failSave ? Infinity : saveFailures;
  const response = (url, init) => {
    if (String(url).includes("/operations/")) {
      return {
        operation: {
          result: { documentKey: "document-key", editorSessionPreserved: true },
          status: "completed",
        },
      };
    }
    if (init.method === "POST") {
      if (remainingSaveFailures > 0) {
        remainingSaveFailures -= 1;
        return { body: { error: "save failed" }, httpStatus: 503 };
      }
      return { operationCapability: "save-cap", operationId: "save-op" };
    }
    if (init.method === "PATCH") {
      const { change } = JSON.parse(init.body);
      if (change.kind === "field") {
        state.fields = state.fields.filter((item) => item.id !== change.id);
      } else if (change.kind === "table") {
        state.table = null;
      } else {
        state.table.columns = state.table.columns.filter(
          (item) => item.id !== change.id
        );
      }
      revision += 1;
    }
    return { bindings: state, documentKey: "document-key", revision };
  };
  const selected = {
    address: "H18",
    drawings,
    names,
    oleObjects: [
      object(first, 2, 1),
      object(second, 12, 3),
      object(proof, 6, 1, 0),
      object(proof, 7, 1, 1),
      object(proof, 8, 1, 2),
    ],
  };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: Array.from({ length: 30 }, () => "cap"),
    documentKind: "xlsx",
    responses: Array.from({ length: 30 }, () => response),
    serializeCommands: true,
    spreadsheetBindings: bindings,
    spreadsheetSelection: selected,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  return { harness, selected, state: () => state };
};
const refresh = async (harness) => {
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
};
const remove = async (harness) => {
  removeButton(harness).dispatchEvent({ type: "click" });
  await flushPlugin();
  await flushPlugin();
};

test("selected OLE identity overrides stale cell and exposes Title Tag and delete", async () => {
  const { harness, selected } = await setup([object(second, 12, 3)]);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe(second.label);
  expect(control(harness, "Tag · รหัสช่อง").value).toBe(second.key);
  expect(removeButton(harness).hidden).toBe(false);
  expect(selected.address).toBe("H18");
  selected.drawings = [object(first, 2, 1)];
  await refresh(harness);
  expect(control(harness, "Tag · รหัสช่อง").value).toBe(first.key);
  expect(harness.requests).toHaveLength(0);
});

test("selected table OLE resolves the column rather than the previous cell or table", async () => {
  const { harness } = await setup([object(proof, 8, 1, 2)]);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe(proof.label);
  expect(control(harness, "Tag · รหัสช่อง").value).toBe(proof.key);
  expect(removeButton(harness).hidden).toBe(false);
});

test.each([
  { drawings: [object(second, 12, 3, null, { tag: "forged" })] },
  { drawings: [object(second, 11, 3)] },
  { drawings: [object(second, 12, 3), object(first, 2, 1)] },
  { drawings: [{ GetApplicationId: () => "ordinary-image" }] },
])(
  "untrusted or multiple drawings clear stale edit and delete targets",
  async ({ drawings }) => {
    const { harness, selected } = await setup([object(second, 12, 3)]);
    selected.drawings = drawings;
    await refresh(harness);
    expect(removeButton(harness).hidden).toBe(true);
    expect(control(harness, "Tag · รหัสช่อง").value).not.toBe(second.key);
    expect(harness.requests).toHaveLength(0);
  }
);

test.each([false, true])(
  "delete selected POC field/column removes only its binding and marker then saves: column %s",
  async (column) => {
    const target = column ? proof : second;
    const { harness, state } = await setup([
      column ? object(proof, 8, 1, 2) : object(second, 12, 3),
    ]);
    await remove(harness);
    expect(harness.requests.map((request) => request.method)).toEqual([
      "GET",
      "PATCH",
      "POST",
      "GET",
    ]);
    expect(JSON.parse(harness.requests[2].body)).toMatchObject({
      deletedUploadPocBindingIds: [target.id],
      preserveEditorSession: true,
      preserveEditorSessionPurpose: "delete",
    });
    expect(JSON.parse(harness.requests[1].body).change).toMatchObject({
      action: "delete",
      id: target.id,
      kind: column ? "column" : "field",
    });
    expect(harness.spreadsheetNames.has(`_folio_upload_poc_${target.id}`)).toBe(
      false
    );
    expect(harness.spreadsheetNames.get("folio_first")).toBe(names.folio_first);
    expect(harness.spreadsheetNames.has("_folio_upload_poc_folio_first")).toBe(
      true
    );
    expect(state().fields.find((item) => item.id === first.id)).toEqual(first);
    expect(harness.statusElement.textContent).toContain(
      "ลบช่องและปุ่ม POC พร้อมบันทึกต้นแบบแล้ว"
    );
  }
);

test("failed save after committed deletion has actionable ordinary save retry without another binding delete", async () => {
  const { harness, state } = await setup([object(second, 12, 3)], {
    failSave: true,
  });
  await remove(harness);
  expect(state().fields.some((item) => item.id === second.id)).toBe(false);
  expect(harness.statusElement.textContent).toContain(
    "ลบการตั้งค่าปุ่มแล้ว แต่ยังบันทึกต้นแบบไม่สำเร็จ"
  );
  expect(harness.statusElement.textContent).toContain("บันทึกแบบร่าง");
  await harness.window.FormBridge.runAction("save-template");
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(2);
});

test("selection polling stops on unload and never changes document dirty state", async () => {
  const { harness, selected } = await setup([]);
  selected.drawings = [object(second, 12, 3)];
  await harness.runDrawingSelectionTimer();
  await flushPlugin();
  expect(control(harness, "Tag · รหัสช่อง").value).toBe(second.key);
  expect(harness.requests).toHaveLength(0);
  harness.emitWindowEvent("unload");
  expect(await harness.runDrawingSelectionTimer()).toBe(false);
});

test("pure OLE resolver refuses deleted identity rather than resolving a neighboring cell", () => {
  expect(() =>
    selectedUploadPocBinding(
      {
        address: "B3",
        anchors: Object.entries(names),
        drawing: {
          applicationId: uploadPocGuid,
          count: 1,
          data: object(second, 12, 3).GetData(),
          from: { column: 3, row: 12 },
          marker: names._folio_upload_poc_folio_second,
        },
        sheet: "Sheet1",
      },
      { ...bindings, fields: [first] },
      uploadPocGuid
    )
  ).toThrow("ปัจจุบัน");
});

test("postcommit deletion removes native objects before save and manual retry preserves foreign objects without repeating metadata deletion", async () => {
  const { harness, selected, state } = await setup([object(second, 12, 3)], {
    saveFailures: 1,
  });
  await remove(harness);
  expect(state().fields.some((item) => item.id === second.id)).toBe(false);
  expect(
    selected.oleObjects.find((item) => item.GetData().includes(second.id))
      .Drawing.removed
  ).toBe(true);
  expect(
    selected.oleObjects.filter((item) => !item.Drawing.removed)
  ).toHaveLength(4);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  const patchCount = harness.requests.filter(
    (request) => request.method === "PATCH"
  ).length;
  const firstSave = JSON.parse(
    harness.requests.find((request) => request.method === "POST").body
  );
  const result = await harness.window.FormBridge.runAction("save-template");
  expect(result.ok).toBe(true);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(patchCount);
  const secondSave = JSON.parse(
    harness.requests.findLast((request) => request.method === "POST").body
  );
  expect(secondSave.spreadsheetSaveCheckpoint).not.toBe(
    firstSave.spreadsheetSaveCheckpoint
  );
  expect(secondSave).toMatchObject({
    deletedUploadPocBindingIds: [second.id],
    preserveEditorSessionPurpose: "delete",
  });
  expect(secondSave.spreadsheetUploadPocSnapshot).toHaveLength(4);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
  expect(
    [...harness.spreadsheetNames.keys()].filter((name) =>
      name.startsWith("_folio_editor_save_checkpoint_")
    )
  ).toHaveLength(1);
});

test("native cleanup failure stays retryable after metadata commit and blocks new authoring until manual save succeeds", async () => {
  const { harness, selected, state } = await setup([object(second, 12, 3)]);
  const target = selected.oleObjects.find((item) =>
    item.GetData().includes(second.id)
  );
  const original = target.Drawing.deleteDrawingBase;
  target.Drawing.deleteDrawingBase = () => {
    throw new Error("native delete unavailable");
  };
  await remove(harness);
  expect(state().fields.some((item) => item.id === second.id)).toBe(false);
  expect(target.Drawing.removed).not.toBe(true);
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(0);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  const publish = await harness.window.FormBridge.runAction("publish");
  expect(publish.ok).toBe(false);
  target.Drawing.deleteDrawingBase = original;
  const retry = await harness.window.FormBridge.runAction("save-template");
  expect(retry.ok).toBe(true);
  expect(target.Drawing.removed).toBe(true);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
});

test("Undo resurrecting a deleted POC marker fails closed before a later save instead of persisting it", async () => {
  const { harness, selected } = await setup([object(second, 12, 3)]);
  await remove(harness);
  const target = selected.oleObjects.find((item) =>
    item.GetData().includes(second.id)
  );
  target.Drawing.removed = false;
  harness.spreadsheetNames.set(
    `_folio_upload_poc_${second.id}`,
    names._folio_upload_poc_folio_second
  );
  const savedBefore = harness.requests.filter(
    (request) => request.method === "POST"
  ).length;
  const result = await harness.window.FormBridge.runAction("save-template");
  expect(result.ok).toBe(false);
  expect(result.error).toContain("Undo");
  expect(target.Drawing.removed).toBe(false);
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(savedBefore);
});

const selectWholeTable = async (harness, selected) => {
  selected.drawings = [];
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  const saved = control(harness, "ช่องที่บันทึกแล้ว");
  saved.value = bindings.table.id;
  saved.dispatchEvent({ type: "change" });
};

test("deleting a whole managed table removes every native column button and saves retained scalar slots", async () => {
  const { harness, selected, state } = await setup([]);
  selected.values = { A2: 42, H18: "Unrelated value" };
  selected.formulas = { A3: "=A2*2" };
  await selectWholeTable(harness, selected);
  await remove(harness);
  expect(state().table).toBe(null);
  const remaining = selected.oleObjects.filter((item) => !item.Drawing.removed);
  expect(remaining.map((item) => JSON.parse(item.GetData()).bindingId)).toEqual(
    [first.id, second.id]
  );
  const save = JSON.parse(
    harness.requests.find((request) => request.method === "POST").body
  );
  expect(save).toMatchObject({
    deletedUploadPocBindingIds: [proof.id],
    preserveEditorSessionPurpose: "delete",
  });
  expect(save.spreadsheetUploadPocSnapshot).toHaveLength(2);
  expect(selected.values).toEqual({ A2: 42, H18: "Unrelated value" });
  expect(selected.formulas).toEqual({ A3: "=A2*2" });
});

test("partial native table cleanup failure retries only remaining captured objects after the confirmed metadata delete", async () => {
  const { harness, selected, state } = await setup([]);
  const targets = selected.oleObjects.filter(
    (item) => JSON.parse(item.GetData()).bindingId === proof.id
  );
  const original = targets[1].Drawing.deleteDrawingBase;
  let fail = true;
  targets[1].Drawing.deleteDrawingBase = function deleteDrawingBase() {
    if (fail) {
      fail = false;
      throw new Error("temporary native failure");
    }
    original.call(this);
  };
  await selectWholeTable(harness, selected);
  await remove(harness);
  expect(state().table).toBe(null);
  expect(targets.map((item) => Boolean(item.Drawing.removed))).toEqual([
    true,
    false,
    false,
  ]);
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(0);
  const retry = await harness.window.FormBridge.runAction("save-template");
  expect(retry.ok).toBe(true);
  expect(targets.every((item) => item.Drawing.removed)).toBe(true);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  expect(
    selected.oleObjects.filter((item) => !item.Drawing.removed)
  ).toHaveLength(2);
});
