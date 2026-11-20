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
  let revision = 0;
  let draft;
  let remainingSaveFailures = saveFailures;
  const response = (url, init) => {
    if (String(url).endsWith("/save")) {
      draft = JSON.parse(init.body).xlsxDraft;
      if (failSave) {
        return {
          body: { error: "save acknowledgement lost" },
          httpStatus: 503,
        };
      }
      return { operationCapability: "save-cap", operationId: "save-op" };
    }
    if (String(url).endsWith("/xlsx-draft/recover")) {
      expect(JSON.parse(init.body)).toEqual({
        checkpoint: draft.checkpoint,
        leaseId: "test-editor-lease",
      });
      return {
        action: "save-template",
        operationCapability: "save-cap",
        operationId: "save-op",
      };
    }
    expect(String(url)).toContain("/operations/");
    if (remainingSaveFailures > 0) {
      remainingSaveFailures -= 1;
      return { operation: { status: "failed" } };
    }
    revision += 1;
    return {
      operation: {
        result: {
          bindingRevision: revision,
          bindings: draft.bindings,
          documentKey: "document-key",
          editorSessionPreserved: true,
        },
        status: "completed",
      },
    };
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
    scopeIdentity: "selection-template",
    serializeCommands: true,
    spreadsheetBindings: bindings,
    spreadsheetSelection: selected,
  });
  const post = harness.parentWindow.postMessage;
  harness.parentWindow.postMessage = (message, origin) => {
    post(message, origin);
    if (message.type === "pending-file-check") {
      harness.dispatch({
        data: {
          ...message,
          allowed: true,
          source: "folio-upload-poc-host",
          type: "pending-file-result",
        },
        origin: harness.parentOrigin,
        source: harness.parentWindow,
      });
    }
  };
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
    const { harness, working } = await setup([
      column ? object(proof, 8, 1, 2) : object(second, 12, 3),
    ]);
    await remove(harness);
    expect(harness.requests.map(({ method }) => method)).toEqual([
      "POST",
      "GET",
    ]);
    const save = JSON.parse(harness.requests[0].body);
    expect(save).toMatchObject({
      deletedUploadPocBindingIds: [target.id],
      preserveEditorSession: true,
      preserveEditorSessionPurpose: "delete",
      xlsxDraft: { revision: 0, version: 1 },
    });
    expect(save.xlsxDraft.bindings.fields).toEqual(
      column ? [first, second] : [first]
    );
    expect(save.xlsxDraft.bindings.table.columns).toEqual(
      column ? [] : [proof]
    );
    expect(save.spreadsheetUploadPocSnapshot).toHaveLength(column ? 2 : 4);
    expect(harness.spreadsheetNames.has(`_folio_upload_poc_${target.id}`)).toBe(
      false
    );
    expect(harness.spreadsheetNames.get("folio_first")).toBe(names.folio_first);
    expect(harness.spreadsheetNames.has("_folio_upload_poc_folio_first")).toBe(
      true
    );
    expect(state().fields.find((item) => item.id === first.id)).toEqual(first);
  }
);

test("lost deletion save acknowledgement locks editing and recovers the original checkpoint without replay", async () => {
  const { harness, working } = await setup([object(second, 12, 3)], {
    failSave: true,
  });
  await remove(harness);
  expect(await working()).toMatchObject({ fields: [first] });
  expect(harness.statusElement.textContent).toContain("บันทึกแบบร่าง");
  expect(harness.editorRestriction).toBe("readOnly");
  expect(harness.requests.map(({ url }) => url.split("/").at(-1))).toEqual([
    "save",
  ]);
  const result = await harness.window.FormBridge.runAction("save-template");
  expect(result).toMatchObject({ ok: true, operationId: "save-op" });
  expect(harness.requests.map(({ url }) => url.split("/").at(-1))).toEqual([
    "save",
    "recover",
    "save-op",
  ]);
  expect(harness.editorRestriction).toBe("readOnly");
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

test("definitive save failure retries deletion without touching foreign objects", async () => {
  const { harness, selected, working } = await setup([object(second, 12, 3)], {
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
  const firstSave = JSON.parse(
    harness.requests.find((request) => request.method === "POST").body
  );
  const result = await harness.window.FormBridge.runAction("save-template");
  expect(result.ok).toBe(true);
  expect(harness.requests.map(({ method }) => method)).toEqual([
    "POST",
    "GET",
    "POST",
    "GET",
  ]);
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
  expect(secondSave.xlsxDraft.checkpoint).not.toBe(
    firstSave.xlsxDraft.checkpoint
  );
  expect(secondSave.xlsxDraft.bindings).toEqual(firstSave.xlsxDraft.bindings);
  expect(secondSave.xlsxDraft.revision).toBe(0);
  expect(secondSave.spreadsheetUploadPocSnapshot).toEqual(
    firstSave.spreadsheetUploadPocSnapshot
  );
  expect(secondSave.spreadsheetUploadPocSnapshot).toHaveLength(4);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
  expect(
    [...harness.spreadsheetNames.keys()].filter((name) =>
      name.startsWith("_folio_editor_save_checkpoint_")
    )
  ).toHaveLength(1);
});

test("native cleanup failure stays retryable after local Apply and blocks new authoring until manual save succeeds", async () => {
  const { harness, selected, working } = await setup([object(second, 12, 3)]);
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
  expect(harness.requests.map(({ method }) => method)).toEqual(["POST", "GET"]);
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
  const { harness, selected, working } = await setup([]);
  selected.values = { A2: 42, H18: "Unrelated value" };
  selected.formulas = { A3: "=A2*2" };
  await selectWholeTable(harness, selected);
  await remove(harness);
  expect(await working()).toMatchObject({ table: null });
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
    xlsxDraft: {
      bindings: { fields: [first, second], table: null },
      revision: 0,
    },
  });
  expect(save.spreadsheetUploadPocSnapshot).toHaveLength(2);
  expect(selected.values).toEqual({ A2: 42, H18: "Unrelated value" });
  expect(selected.formulas).toEqual({ A3: "=A2*2" });
});

test("partial native table cleanup failure retries only remaining captured objects after local Apply", async () => {
  const { harness, selected, working } = await setup([]);
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
  expect(await working()).toMatchObject({ table: null });
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
  expect(harness.requests.map(({ method }) => method)).toEqual(["POST", "GET"]);
  expect(
    selected.oleObjects.filter((item) => !item.Drawing.removed)
  ).toHaveLength(2);
});
