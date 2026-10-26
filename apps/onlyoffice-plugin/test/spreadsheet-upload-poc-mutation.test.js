// oxlint-disable sort-keys no-await-expression-member -- Compact native fixtures and asynchronous save assertions.
import { expect, test } from "bun:test";

import { uploadPocGuid } from "../../server/src/documents/spreadsheets/upload-poc-preview.ts";
import { acknowledgeBridge, createHarness, flushPlugin } from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const control = (harness, caption) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === caption
  )?.children[1];
const click = async (harness) => {
  descendants(harness.body)
    .find(
      (node) => node.tagName === "BUTTON" && node.textContent === "บันทึกการแก้ไข"
    )
    .dispatchEvent({ type: "click" });
  await flushPlugin();
  await flushPlugin();
};
const setup = async ({
  reject = false,
  table = false,
  saveFailures = 0,
  projectionFailures = 0,
} = {}) => {
  const field = {
    anchor: "folio_a",
    computed: false,
    id: "folio_a",
    key: "a",
    label: "A",
    options: [],
    required: false,
    type: "text",
  };
  const state = {
    fields: table ? [] : [field],
    table: table
      ? {
          id: "folio_table",
          anchor: "folio_table",
          key: "items",
          label: "Items",
          columns: [{ ...field, offset: 0 }],
        }
      : null,
    version: 1,
  };
  const object = {
    Drawing: {
      Id: "native-a",
      deleteDrawingBase() {
        this.removed = true;
      },
      drawingBase: { from: { col: 1, row: 2 } },
    },
    GetApplicationId: () => uploadPocGuid,
    GetData() {
      return this.data;
    },
    data: JSON.stringify({
      bindingId: field.id,
      kind: "folio-upload-poc",
      rowIndex: table ? 0 : null,
      tag: table ? "items.a" : "a",
      version: 1,
    }),
  };
  let revision = 0;
  let remainingSaveFailures = saveFailures;
  let remainingProjectionFailures = projectionFailures;
  const response = (url, init) => {
    if (String(url).includes("/operations/")) {
      return {
        operation: {
          status: "completed",
          result: { documentKey: "document-key", editorSessionPreserved: true },
        },
      };
    }
    if (init.method === "POST") {
      if (remainingSaveFailures > 0) {
        remainingSaveFailures -= 1;
        return { httpStatus: 503, body: { error: "save unavailable" } };
      }
      return { operationCapability: "cap", operationId: "save" };
    }
    if (init.method === "PATCH") {
      if (reject) {
        return { httpStatus: 409, body: { error: "rejected" } };
      }
      const { change } = JSON.parse(init.body);
      if (change.kind === "table") {
        state.table = change.value;
      } else if (table) {
        state.table.columns = [change.value];
      } else {
        state.fields = [change.value];
      }
      revision += 1;
    }
    return { bindings: state, documentKey: "document-key", revision };
  };
  const selected = {
    address: "B3",
    names: {
      _folio_upload_poc_folio_a: "'Sheet1'!$B$3",
      folio_a: "'Sheet1'!$B$3",
      ...(table
        ? {
            folio_table: "'Sheet1'!$B$3:$B$3",
            folio_column_folio_a: "'Sheet1'!$B$3:$B$3",
            folio_columns_folio_table: "'Sheet1'!$B$3:$B$3",
          }
        : {}),
    },
    oleObjects: [object],
  };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: Array.from({ length: 40 }, () => "cap"),
    documentKind: "xlsx",
    responses: Array.from({ length: 40 }, () => response),
    serializeCommands: true,
    spreadsheetBindings: state,
    spreadsheetSelection: selected,
  });
  const original = harness.window.Asc.plugin.callCommand;
  let projections = 0;
  harness.window.Asc.plugin.callCommand = (...args) => {
    if (args[0].name !== "spreadsheetUploadPocCommand") {
      return original(...args);
    }
    projections += 1;
    expect(
      harness.methodInvocations.findLast(
        (call) => call.method === "SetEditingRestrictions"
      ).args[0]
    ).toBe("readOnly");
    const [target] = harness.window.Asc.scope.folioSpreadsheetUploadPoc.targets;
    object.data = JSON.stringify({
      ...JSON.parse(object.data),
      tag: target.tag,
    });
    args.at(-1)(
      JSON.stringify(
        remainingProjectionFailures > 0
          ? { error: "projection unavailable", ok: false }
          : { ok: true }
      )
    );
    remainingProjectionFailures -= 1;
  };
  acknowledgeBridge(harness);
  await flushPlugin();
  return { harness, object, projections: () => projections, selected, state };
};

test.each(["number", "date"])(
  "changing managed text to %s stages cleanup only after commit and manually saves zero controls",
  async (type) => {
    const { harness, object } = await setup();
    control(harness, "ชนิดข้อมูล").value = type;
    await click(harness);
    expect(
      harness.requests.filter((request) => request.method === "PATCH")
    ).toHaveLength(1);
    expect(object.Drawing.removed).not.toBe(true);
    expect(harness.spreadsheetNames.has("_folio_upload_poc_folio_a")).toBe(
      false
    );
    const result = await harness.window.FormBridge.runAction("save-template");
    expect(result.ok).toBe(true);
    expect(object.Drawing.removed).toBe(true);
    const save = harness.requests.find((request) => request.method === "POST");
    expect(JSON.parse(save.body).preserveEditorSessionPurpose).toBe("manual");
    expect(JSON.parse(save.body).spreadsheetUploadPocSnapshot).toEqual([]);
  }
);

test("metadata rejection restores marker and never removes or reprojects control", async () => {
  const { harness, object, projections } = await setup({ reject: true });
  control(harness, "ชนิดข้อมูล").value = "number";
  await click(harness);
  expect(object.Drawing.removed).not.toBe(true);
  expect(harness.spreadsheetNames.has("_folio_upload_poc_folio_a")).toBe(true);
  expect(projections()).toBe(0);
});

test.each([false, true])(
  "rename reprojects captured controls before checkpoint and tolerates partial retry: table %s",
  async (table) => {
    const { harness, object, projections } = await setup({
      projectionFailures: 1,
      table,
    });
    control(harness, "Tag · รหัสช่อง").value = "renamed";
    await click(harness);
    expect(projections()).toBe(0);
    expect(
      (await harness.window.FormBridge.runAction("save-template")).ok
    ).toBe(false);
    expect(
      (await harness.window.FormBridge.runAction("save-template")).ok
    ).toBe(true);
    expect(projections()).toBe(2);
    expect(JSON.parse(object.data).tag).toBe(
      table ? "items.renamed" : "renamed"
    );
    expect(object.Drawing.removed).not.toBe(true);
  }
);

test("failed storage save retries cleanup without a second metadata write", async () => {
  const { harness, object } = await setup({ saveFailures: 1 });
  control(harness, "ชนิดข้อมูล").value = "number";
  await click(harness);
  expect((await harness.window.FormBridge.runAction("save-template")).ok).toBe(
    false
  );
  expect(object.Drawing.removed).toBe(true);
  expect((await harness.window.FormBridge.runAction("save-template")).ok).toBe(
    true
  );
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
});

test("table key change reprojects retained column tags", async () => {
  const { harness, object } = await setup({ table: true });
  const existing = control(harness, "ช่องที่บันทึกแล้ว");
  existing.value = "folio_table";
  existing.dispatchEvent({ type: "change" });
  control(harness, "Tag · รหัสช่อง").value = "renamed_items";
  await click(harness);
  expect((await harness.window.FormBridge.runAction("save-template")).ok).toBe(
    true
  );
  expect(JSON.parse(object.data).tag).toBe("renamed_items.a");
});

test("title-only edit leaves OLE payload unchanged", async () => {
  const { harness, object, projections } = await setup();
  const previous = object.data;
  control(harness, "Title · ชื่อช่อง").value = "New title";
  await click(harness);
  expect((await harness.window.FormBridge.runAction("save-template")).ok).toBe(
    true
  );
  expect(object.data).toBe(previous);
  expect(projections()).toBe(0);
});

test.each(["data", "position", "anchor", "marker"])(
  "rename fails closed before projection when captured native evidence changes: %s",
  async (change) => {
    const { harness, object, projections } = await setup();
    control(harness, "Tag · รหัสช่อง").value = "renamed";
    await click(harness);
    if (change === "data") {
      object.data = object.data.replace('"tag":"a"', '"tag":"foreign"');
    }
    if (change === "position") {
      object.Drawing.drawingBase.from.row = 4;
    }
    if (change === "anchor") {
      harness.spreadsheetNames.set("folio_a", "'Sheet1'!$C$3");
    }
    if (change === "marker") {
      harness.spreadsheetNames.set(
        "_folio_upload_poc_folio_a",
        "'Sheet1'!$C$3"
      );
    }
    expect(
      (await harness.window.FormBridge.runAction("save-template")).ok
    ).toBe(false);
    expect(projections()).toBe(0);
    expect(object.Drawing.removed).not.toBe(true);
    expect(
      harness.requests.filter((request) => request.method === "POST")
    ).toHaveLength(0);
  }
);
