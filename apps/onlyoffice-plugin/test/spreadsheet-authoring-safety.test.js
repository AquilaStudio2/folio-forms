import { expect, test } from "bun:test";

import {
  spreadsheetBindingAnchors,
  spreadsheetColumnAnchor,
  spreadsheetTableColumnsAnchor,
} from "../src/spreadsheet-columns.js";
import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const control = (harness, caption) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === caption
  )?.children[1];
const click = async (harness, caption) => {
  const target = descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === caption
  );
  expect(target).toBeDefined();
  target.dispatchEvent({ type: "click" });
  await flushPlugin();
  await flushPlugin();
};
const field = {
  anchor: "saved_choice",
  computed: false,
  id: "choice",
  key: "choice",
  label: "Choice",
  options: ["one", "two"],
  placeholder: null,
  prefillPointer: null,
  prefillPolicy: "editable",
  required: false,
  type: "dropdown",
};
const bindings = { fields: [field], table: null, version: 1 };
const templateHarness = (extra = {}) =>
  createHarness({
    action: "template-edit",
    documentKind: "xlsx",
    spreadsheetBindings: bindings,
    spreadsheetSelection: {
      address: "A1",
      names: { saved_choice: "'Sheet1'!$A$1" },
    },
    ...extra,
    responses: extra.responses?.map((response) =>
      response?.bindings
        ? { documentKey: "document-key", ...response }
        : response
    ),
  });
const observeCommands = (harness) => {
  const calls = [];
  const original = harness.window.Asc.plugin.callCommand;
  harness.window.Asc.plugin.callCommand = (...args) => {
    calls.push(args[0].name);
    return original(...args);
  };
  return calls;
};

test.each(["save-template", "publish"])(
  "%s blocks pending field settings before any native save or API request",
  async (action) => {
    const harness = templateHarness();
    acknowledgeBridge(harness);
    await flushPlugin();
    control(harness, "Title · ชื่อช่อง").value = "Changed title";
    const result = await harness.window.FormBridge.runAction(action);
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("บันทึกการแก้ไข");
    expect(harness.requests).toHaveLength(0);
    expect(
      harness.messages.some(
        ({ message }) => message.type === "editor-save-request"
      )
    ).toBe(false);
    expect(
      harness.messages.some(
        ({ message }) => message.type === "dirty-state" && message.dirty
      )
    ).toBe(true);
  }
);

test("field error notices can be dismissed and the next failure is visible again", async () => {
  const harness = templateHarness();
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await harness.window.FormBridge.runAction("save-template");
  const dismiss = descendants(harness.statusElement).find(
    (node) => node["aria-label"] === "ปิดข้อความแจ้งเตือน"
  );
  expect(dismiss?.tagName).toBe("BUTTON");
  expect(dismiss.type).toBe("button");
  dismiss.dispatchEvent({ type: "click" });
  expect(harness.statusElement.hidden).toBe(true);
  await expect(
    harness.window.FormBridge.runAction("publish")
  ).resolves.toMatchObject({ ok: false });
  expect(harness.statusElement.hidden).toBe(false);
  expect(
    descendants(harness.statusElement).filter(
      (node) => node["aria-label"] === "ปิดข้อความแจ้งเตือน"
    )
  ).toHaveLength(1);
  expect(harness.requests).toHaveLength(0);
});

test("pending options survive changing selection and block the outer draft save", async () => {
  const native = { address: "A1", names: { saved_choice: "'Sheet1'!$A$1" } };
  const harness = templateHarness({ spreadsheetSelection: native });
  acknowledgeBridge(harness);
  await flushPlugin();
  const entry = descendants(harness.body).find(
    (node) => node.tagName === "TEXTAREA"
  );
  entry.value = "three";
  await click(harness, "Add");
  native.address = "D4";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  await expect(
    harness.window.FormBridge.runAction("save-template")
  ).resolves.toMatchObject({ ok: false });
  native.address = "A1";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(
    descendants(harness.body)
      .filter((node) => node.tagName === "LI")
      .map((node) => node.textContent)
  ).toEqual(["one", "two", "three"]);
});

test("typing an option without Add remains pending and survives changing selection", async () => {
  const native = { address: "A1", names: { saved_choice: "'Sheet1'!$A$1" } };
  const harness = templateHarness({ spreadsheetSelection: native });
  acknowledgeBridge(harness);
  await flushPlugin();
  const entry = descendants(harness.body).find(
    (node) => node.tagName === "TEXTAREA"
  );
  entry.value = "not added yet";
  entry.dispatchEvent({ type: "input" });
  native.address = "D4";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  native.address = "A1";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(entry.value).toBe("not added yet");
  await expect(
    harness.window.FormBridge.runAction("publish")
  ).resolves.toMatchObject({ ok: false });
  expect(harness.requests).toHaveLength(0);
});

test("editing an option preserves Update mode across selection changes", async () => {
  const native = { address: "A1", names: { saved_choice: "'Sheet1'!$A$1" } };
  const harness = templateHarness({ spreadsheetSelection: native });
  acknowledgeBridge(harness);
  await flushPlugin();
  descendants(harness.body)
    .find((node) => node.tagName === "LI" && node.textContent === "two")
    .dispatchEvent({ type: "click" });
  await click(harness, "Edit");
  const entry = descendants(harness.body).find(
    (node) => node.tagName === "TEXTAREA"
  );
  entry.value = "replacement";
  entry.dispatchEvent({ type: "input" });
  native.address = "D4";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  native.address = "A1";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(entry.value).toBe("replacement");
  await click(harness, "Update");
  expect(
    descendants(harness.body)
      .filter((node) => node.tagName === "LI")
      .map((node) => node.textContent)
  ).toEqual(["one", "replacement"]);
  expect(entry.value).toBe("");
});

test("panel Save does not discard a typed option that has not been added to the list", async () => {
  const harness = templateHarness({
    capabilityResponses: ["read"],
    responses: [{ bindings, revision: 0 }],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const entry = descendants(harness.body).find(
    (node) => node.tagName === "TEXTAREA"
  );
  entry.value = "not added yet";
  await click(harness, "บันทึกการแก้ไข");
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(0);
  expect(entry.value).toBe("not added yet");
  expect(harness.statusElement.textContent).toContain("Add หรือ Update");
});

test("rejected new binding restores the original cells and removes its newly created anchor", async () => {
  const empty = { fields: [], table: null, version: 1 };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify"],
    responses: [
      { bindings: empty, revision: 0 },
      { body: { error: "Conflicting change" }, httpStatus: 409 },
      { bindings: empty, revision: 0 },
    ],
    spreadsheetBindings: empty,
    spreadsheetSelection: {
      address: "B2",
      formats: { B2: "dd/mm/yyyy" },
      validations: {
        B2: {
          formula1: "0",
          formula2: "100",
          ignoreBlank: false,
          operator: "between",
          type: "decimal",
        },
      },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const calls = observeCommands(harness);
  control(harness, "Tag · รหัสช่อง").value = "new_choice";
  await click(harness, "เพิ่มช่องจากช่วงที่เลือก");
  expect(harness.requests.map((request) => request.method)).toEqual([
    "GET",
    "PATCH",
    "GET",
  ]);
  expect(harness.spreadsheetNames.size).toBe(0);
  expect(harness.spreadsheetNumberFormats.get("B2")).toBe("dd/mm/yyyy");
  expect(harness.spreadsheetValidations.get("B2")).toMatchObject({
    formula1: "0",
    formula2: "100",
    ignoreBlank: false,
    operator: "between",
    type: "decimal",
  });
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(true);
  expect(control(harness, "Tag · รหัสช่อง").value).toBe("new_choice");
  expect(harness.statusElement.textContent).toContain("Conflicting change");
});

test("a committed PATCH with a lost acknowledgement is verified instead of rolling back", async () => {
  const updated = { ...field, label: "Verified change" };
  const saved = { ...bindings, fields: [updated] };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify", "save"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { bindings: saved, revision: 1 },
      { operationCapability: "poll", operationId: "saved" },
      completedOperation({
        documentKey: "document-key",
        editorSessionPreserved: true,
      }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const calls = observeCommands(harness);
  control(harness, "Title · ชื่อช่อง").value = updated.label;
  await click(harness, "บันทึกการแก้ไข");
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  await expect(
    harness.window.FormBridge.runAction("save-template")
  ).resolves.toMatchObject({ ok: true });
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(1);
});

test("an unverified PATCH outcome retains the native change and blocks publishing", async () => {
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Cannot verify" }, httpStatus: 503 },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const calls = observeCommands(harness);
  control(harness, "Title · ชื่อช่อง").value = "Pending change";
  await click(harness, "บันทึกการแก้ไข");
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  control(harness, "Title · ชื่อช่อง").value = field.label;
  const result = await harness.window.FormBridge.runAction("publish");
  expect(result.ok).toBe(false);
  expect(result.error).toContain("ลองยืนยันอีกครั้ง");
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(0);
});

test("deleting a field clears only its native anchor and preserves unrelated names", async () => {
  const other = { ...field, anchor: "other_choice", id: "other", key: "other" };
  const initial = { ...bindings, fields: [field, other] };
  const saved = { ...bindings, fields: [other] };
  const harness = templateHarness({
    capabilityResponses: ["read", "write"],
    responses: [
      { bindings: initial, revision: 0 },
      { bindings: saved, revision: 1 },
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "A1",
      names: {
        other_choice: "'Sheet1'!$C$3",
        saved_choice: "'Sheet1'!$A$1",
        unrelated: "'Sheet1'!$D$4",
      },
      validations: {
        A1: { formula1: '"one,two"', type: "list" },
        C3: { formula1: "0", type: "decimal" },
      },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const calls = observeCommands(harness);
  await click(harness, "ลบช่องนี้");
  expect(harness.spreadsheetNames.has(field.anchor)).toBe(false);
  expect(harness.spreadsheetNames.get(other.anchor)).toBe("'Sheet1'!$C$3");
  expect(harness.spreadsheetNames.get("unrelated")).toBe("'Sheet1'!$D$4");
  expect(harness.spreadsheetValidations.has("A1")).toBe(false);
  expect(harness.spreadsheetValidations.get("C3")).toMatchObject({
    formula1: "0",
    type: "decimal",
  });
  expect(calls.some((name) => name.includes("ClearValidation"))).toBe(true);
});

test("rejected deletion restores its native anchor and keeps the editable binding", async () => {
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Conflicting deletion" }, httpStatus: 409 },
      { bindings, revision: 0 },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  await click(harness, "ลบช่องนี้");
  expect(harness.spreadsheetNames.get(field.anchor)).toBe("'Sheet1'!$A$1");
  expect(control(harness, "Title · ชื่อช่อง").value).toBe(field.label);
  expect(harness.statusElement.textContent).toContain("Conflicting deletion");
});

const table = {
  anchor: "rows",
  columns: [
    {
      computed: false,
      id: "first",
      key: "first",
      label: "First",
      offset: 0,
      options: [],
      required: false,
      type: "text",
    },
    {
      computed: false,
      id: "second",
      key: "second",
      label: "Second",
      offset: 1,
      options: [],
      required: false,
      type: "text",
    },
  ],
  id: "table",
  key: "items",
  label: "Items",
};

test("deleting a table removes all tracking names while preserving outside cells and names", async () => {
  const initial = { fields: [field], table, version: 1 };
  const saved = { ...initial, table: null };
  const harness = templateHarness({
    capabilityResponses: ["read", "write"],
    responses: [
      { bindings: initial, revision: 0 },
      { bindings: saved, revision: 1 },
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "B3:C4",
      names: {
        rows: "'Sheet1'!$B$3:$C$4",
        saved_choice: "'Sheet1'!$A$1",
        unrelated: "'Sheet1'!$F$6",
      },
      validations: {
        A1: { formula1: '"one,two"', type: "list" },
        "B3:C4": { formula1: "0", type: "decimal" },
      },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  expect(control(harness, "กำหนดช่วงที่เลือกเป็น").value).toBe("table");
  expect(
    harness.spreadsheetNames.has(spreadsheetTableColumnsAnchor(table.id))
  ).toBe(true);
  await click(harness, "ลบช่องนี้");
  for (const name of spreadsheetBindingAnchors({ fields: [], table })) {
    expect(harness.spreadsheetNames.has(name)).toBe(false);
  }
  expect(harness.spreadsheetNames.get(field.anchor)).toBe("'Sheet1'!$A$1");
  expect(harness.spreadsheetNames.get("unrelated")).toBe("'Sheet1'!$F$6");
  expect(harness.spreadsheetValidations.has("B3:C4")).toBe(false);
  expect(harness.spreadsheetValidations.get("A1")).toMatchObject({
    formula1: '"one,two"',
    type: "list",
  });
});

test("deleting one column clears only its validation and tracking name", async () => {
  const initial = { fields: [], table, version: 1 };
  const saved = {
    ...initial,
    table: { ...table, columns: [table.columns[1]] },
  };
  const harness = templateHarness({
    capabilityResponses: ["read", "write"],
    responses: [
      { bindings: initial, revision: 0 },
      { bindings: saved, revision: 1 },
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "B3",
      names: { rows: "'Sheet1'!$B$3:$C$4" },
      validations: {
        "B3:B4": { formula1: "0", type: "decimal" },
        "C3:C4": { formula1: '"one,two"', type: "list" },
      },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  expect(control(harness, "กำหนดช่วงที่เลือกเป็น").value).toBe("column");
  await click(harness, "ลบช่องนี้");
  expect(harness.spreadsheetNames.has(spreadsheetColumnAnchor("first"))).toBe(
    false
  );
  expect(harness.spreadsheetNames.has(spreadsheetColumnAnchor("second"))).toBe(
    true
  );
  expect(
    harness.spreadsheetNames.has(spreadsheetTableColumnsAnchor(table.id))
  ).toBe(true);
  expect(harness.spreadsheetNames.get(table.anchor)).toBe("'Sheet1'!$B$3:$C$4");
  expect(harness.spreadsheetValidations.has("B3:B4")).toBe(false);
  expect(harness.spreadsheetValidations.get("C3:C4")).toMatchObject({
    formula1: '"one,two"',
    type: "list",
  });
});

test("a broken column can be removed explicitly and no longer prevents saving", async () => {
  const initial = { fields: [], table, version: 1 };
  const saved = {
    ...initial,
    table: { ...table, columns: [table.columns[1]] },
  };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "save"],
    responses: [
      { bindings: initial, revision: 0 },
      { bindings: saved, revision: 1 },
      { operationCapability: "poll", operationId: "save" },
      completedOperation({
        documentKey: "document-key",
        editorSessionPreserved: true,
      }),
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "A1",
      names: {
        [spreadsheetColumnAnchor("second")]: "'Sheet1'!$C$3:$C$4",
        [spreadsheetTableColumnsAnchor(table.id)]: "'Sheet1'!$B$3:$C$4",
        rows: "'Sheet1'!$B$3:$C$4",
      },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const existing = control(harness, "ช่องที่บันทึกแล้ว");
  existing.value = "first";
  existing.dispatchEvent({ type: "change" });
  await click(harness, "ลบช่องนี้");
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  expect(harness.statusElement.textContent).toContain(
    "ลบช่องและบันทึกต้นแบบในตัวแก้ไขเดิมแล้ว"
  );
  const save = harness.requests.find((request) => request.method === "POST");
  expect(JSON.parse(save.body)).toMatchObject({
    preserveEditorSession: true,
    preserveEditorSessionPurpose: "manual",
  });
  expect(JSON.parse(save.body)).not.toHaveProperty(
    "deletedUploadPocBindingIds"
  );
});

test("editing a moved column submits all live offsets atomically before saving the draft", async () => {
  const initial = { fields: [], table, version: 1 };
  const saved = {
    ...initial,
    table: {
      ...table,
      columns: [
        table.columns[0],
        {
          ...table.columns[1],
          label: "Moved second",
          offset: 2,
          type: "number",
        },
      ],
    },
  };
  const harness = templateHarness({
    capabilityResponses: ["read", "write"],
    responses: [
      { bindings: initial, revision: 0 },
      { bindings: saved, revision: 1 },
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "D3",
      names: {
        [spreadsheetColumnAnchor("first")]: "'Sheet1'!$B$3:$B$4",
        [spreadsheetColumnAnchor("second")]: "'Sheet1'!$D$3:$D$4",
        [spreadsheetTableColumnsAnchor(table.id)]: "'Sheet1'!$B$3:$D$4",
        rows: "'Sheet1'!$B$3:$D$4",
      },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Second");
  control(harness, "Title · ชื่อช่อง").value = "Moved second";
  control(harness, "ชนิดข้อมูล").value = "number";
  await click(harness, "บันทึกการแก้ไข");
  const patch = harness.requests.find((request) => request.method === "PATCH");
  expect(JSON.parse(patch.body)).toMatchObject({
    change: {
      kind: "column",
      value: { id: "second", label: "Moved second", offset: 2 },
    },
    spreadsheetColumnOffsets: [
      ["first", 0],
      ["second", 2],
    ],
  });
  expect(harness.spreadsheetValidations.has("D3:D4")).toBe(true);
  expect(harness.spreadsheetValidations.has("C3:C4")).toBe(false);
});

test("lost acknowledgement does not count as committed when another raw column offset differs", async () => {
  const initial = { fields: [], table, version: 1 };
  const external = {
    ...initial,
    table: {
      ...table,
      columns: [
        { ...table.columns[0], offset: 1 },
        { ...table.columns[1], label: "Moved second", offset: 2 },
      ],
    },
  };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify"],
    responses: [
      { bindings: initial, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { bindings: external, revision: 1 },
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "D3",
      names: {
        [spreadsheetColumnAnchor("first")]: "'Sheet1'!$B$3:$B$4",
        [spreadsheetColumnAnchor("second")]: "'Sheet1'!$D$3:$D$4",
        [spreadsheetTableColumnsAnchor(table.id)]: "'Sheet1'!$B$3:$D$4",
        rows: "'Sheet1'!$B$3:$D$4",
      },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const calls = observeCommands(harness);
  control(harness, "Title · ชื่อช่อง").value = "Moved second";
  await click(harness, "บันทึกการแก้ไข");
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  control(harness, "Title · ชื่อช่อง").value = "Second";
  const result = await harness.window.FormBridge.runAction("publish");
  expect(result.ok).toBe(false);
  expect(result.error).toContain("ลองยืนยันอีกครั้ง");
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(0);
});

test("recovery retries only verification, preserves a dismissed error block, and resumes after a verified commit", async () => {
  const saved = {
    ...bindings,
    fields: [{ ...field, label: "Recovered title" }],
  };
  const harness = templateHarness({
    capabilityResponses: [
      "read",
      "write",
      "verify",
      "retry1",
      "retry2",
      "save",
    ],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { body: { error: "Still offline" }, httpStatus: 503 },
      { bindings: saved, revision: 1 },
      { operationCapability: "poll", operationId: "saved" },
      completedOperation({
        documentKey: "document-key",
        editorSessionPreserved: true,
      }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Recovered title";
  await click(harness, "บันทึกการแก้ไข");
  const retry = descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === "ลองยืนยันอีกครั้ง"
  );
  expect(retry.hidden).toBe(false);
  expect(retry.disabled).toBe(false);
  expect(retry["aria-describedby"]).toBe("spreadsheet-recovery-status");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  expect(control(harness, "ช่องที่บันทึกแล้ว").disabled).toBe(false);
  descendants(harness.statusElement)
    .find((node) => node["aria-label"] === "ปิดข้อความแจ้งเตือน")
    .dispatchEvent({ type: "click" });
  expect(harness.statusElement.hidden).toBe(true);
  const blocked = await harness.window.FormBridge.runAction("publish");
  expect(blocked.ok).toBe(false);
  expect(blocked.error).toContain("ลองยืนยันอีกครั้ง");
  expect(harness.statusElement.hidden).toBe(false);
  expect(retry.hidden).toBe(false);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(retry.hidden).toBe(false);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Recovered title");
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(retry.hidden).toBe(true);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  await expect(
    harness.window.FormBridge.runAction("save-template")
  ).resolves.toMatchObject({ ok: true });
  expect(
    harness.methodInvocations.findLast(
      ({ method }) => method === "SetEditingRestrictions"
    ).args
  ).toEqual(["none"]);
});

test("entering recovery reveals its controls without resetting later selection scrolling", async () => {
  const native = { address: "A1", names: { saved_choice: "'Sheet1'!$A$1" } };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
    ],
    spreadsheetSelection: native,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const panel = descendants(harness.body).find((node) =>
    node.className?.includes("spreadsheet-panel")
  );
  panel.scrollTop = 1200;
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  expect(panel.scrollTop).toBe(0);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Pending title");
  panel.scrollTop = 400;
  native.address = "B2";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(panel.scrollTop).toBe(400);
});

test("recovery proves an uncommitted new field, restores its native state, and retains panel edits", async () => {
  const empty = { fields: [], table: null, version: 1 };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify", "retry", "fence"],
    responses: [
      { bindings: empty, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings: empty, revision: 0 },
      {
        bindings: empty,
        recovery: { baseRevision: 0, settled: true },
        revision: 1,
      },
    ],
    spreadsheetBindings: empty,
    spreadsheetSelection: {
      address: "B2",
      formats: { B2: "0.00" },
      validations: { B2: { formula1: "0", type: "decimal" } },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Tag · รหัสช่อง").value = "new_field";
  control(harness, "ชนิดข้อมูล").value = "date";
  await click(harness, "เพิ่มช่องจากช่วงที่เลือก");
  expect(harness.spreadsheetNames.size).toBe(1);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(harness.spreadsheetNames.size).toBe(0);
  expect(harness.spreadsheetNumberFormats.get("B2")).toBe("0.00");
  expect(harness.spreadsheetValidations.get("B2")).toMatchObject({
    formula1: "0",
    type: "decimal",
  });
  expect(control(harness, "Tag · รหัสช่อง").value).toBe("new_field");
  expect(control(harness, "ชนิดข้อมูล").value).toBe("date");
  expect(control(harness, "Tag · รหัสช่อง").disabled).toBe(false);
  const result = await harness.window.FormBridge.runAction("publish");
  expect(result.error).toContain("เพิ่มช่องจากช่วงที่เลือก");
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
});

test("recovery finishes a committed deletion without replaying it", async () => {
  const saved = { ...bindings, fields: [] };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify", "retry", "save"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings: saved, revision: 1 },
      { operationCapability: "poll", operationId: "save-recovered-delete" },
      completedOperation({
        documentKey: "document-key",
        editorSessionPreserved: true,
      }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  await click(harness, "ลบช่องนี้");
  expect(harness.spreadsheetNames.has(field.anchor)).toBe(false);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "ช่องที่บันทึกแล้ว").value).toBe("");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  const result = await harness.window.FormBridge.runAction("save-template");
  expect(result.ok).toBe(true);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
  expect(harness.spreadsheetNames.has(field.anchor)).toBe(false);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
});

test("recovering one field preserves a draft at another selection", async () => {
  const native = { address: "B2", names: { saved_choice: "'Sheet1'!$A$1" } };
  const saved = { ...bindings, fields: [{ ...field, label: "Recovered A1" }] };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify", "retry"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings: saved, revision: 1 },
    ],
    spreadsheetSelection: native,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Unsaved B2";
  native.address = "A1";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Recovered A1";
  await click(harness, "บันทึกการแก้ไข");
  native.address = "B2";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Unsaved B2");
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Unsaved B2");
  const blocked = await harness.window.FormBridge.runAction("save-template");
  expect(blocked.error).toContain("เพิ่มช่องจากช่วงที่เลือก");
});

test.each([
  ["stale document", { documentKey: "another-document", revision: 1 }],
  ["advanced revision", { revision: 2 }],
  ["missing document proof", { documentKey: null, revision: 1 }],
  [
    "malformed bindings",
    { bindings: { fields: [null], table: null, version: 1 }, revision: 1 },
  ],
])("recovery preserves the block for %s", async (_name, proof) => {
  const saved = { ...bindings, fields: [{ ...field, label: "Pending title" }] };
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify", "retry"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings: saved, ...proof },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  const calls = observeCommands(harness);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Pending title");
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
});

test("stale editor capability errors keep recovery blocked with document guidance", async () => {
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify", "retry"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      {
        body: {
          error: "editor_capability_scope_mismatch",
          message: "Editor capability does not match this document",
        },
        httpStatus: 403,
      },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(harness.statusElement.textContent).toContain("เอกสารอีกฉบับ");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
});

test("recovery never overwrites a changed native target", async () => {
  const harness = templateHarness({
    capabilityResponses: ["read", "write", "verify", "retry", "fence"],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings, revision: 0 },
      { bindings, recovery: { baseRevision: 0, settled: true }, revision: 1 },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  harness.spreadsheetNumberFormats.set("A1", "0.00");
  const calls = observeCommands(harness);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(harness.spreadsheetNumberFormats.get("A1")).toBe("0.00");
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
});

test("a failed native restore can be retried after verifying the same state", async () => {
  const harness = templateHarness({
    capabilityResponses: [
      "read",
      "write",
      "verify",
      "retry1",
      "fence1",
      "retry2",
      "fence2",
    ],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings, revision: 0 },
      { bindings, recovery: { baseRevision: 0, settled: true }, revision: 1 },
      { bindings, revision: 1 },
      { bindings, recovery: { baseRevision: 0, settled: true }, revision: 1 },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  const original = harness.window.Asc.plugin.callCommand;
  let fail = true;
  harness.window.Asc.plugin.callCommand = (...args) => {
    if (fail && args[0].name.includes("RestoreValidation")) {
      fail = false;
      args[3](false);
      return;
    }
    return original(...args);
  };
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Pending title");
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
});

test("a lost freeze acknowledgement releases a possibly held lock without mutating cells", async () => {
  const harness = templateHarness({
    capabilityResponses: ["read"],
    responses: [{ bindings, revision: 0 }],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const original = harness.window.Asc.plugin.executeMethod;
  harness.window.Asc.plugin.executeMethod = (method, args, done) =>
    original(
      method,
      args,
      method === "SetEditingRestrictions" && args[0] === "readOnly"
        ? () => {}
        : done
    );
  const timeouts = [];
  const originalTimeout = harness.window.setTimeout;
  harness.window.setTimeout = (callback, delay) => {
    const timer = originalTimeout(callback, delay);
    if (delay === 15_000) {
      timeouts.push(timer);
    }
    return timer;
  };
  const calls = observeCommands(harness);
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  timeouts.find((timer) => !timer.cancelled).callback();
  await flushPlugin();
  expect(
    harness.methodInvocations.findLast(
      ({ method }) => method === "SetEditingRestrictions"
    ).args
  ).toEqual(["none"]);
  expect(calls.some((name) => name.includes("Validation"))).toBe(false);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(0);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
});

test("a lost recovery fence acknowledgement can be retried without replaying the binding write", async () => {
  const harness = templateHarness({
    capabilityResponses: [
      "read",
      "write",
      "verify",
      "retry1",
      "fence1",
      "retry2",
      "fence2",
    ],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings, revision: 0 },
      { body: { error: "Lost fence acknowledgement" }, httpStatus: 502 },
      { bindings, revision: 1 },
      { bindings, recovery: { baseRevision: 0, settled: true }, revision: 1 },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Pending title");
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  const fences = harness.requests.filter((request) =>
    request.url.endsWith("/spreadsheet-bindings/recover")
  );
  expect(fences).toHaveLength(2);
  for (const request of fences) {
    expect(JSON.parse(request.body)).toEqual({
      documentKey: "document-key",
      revision: 0,
    });
  }
});

test("native edits made during a lost unlock acknowledgement are preserved on retry", async () => {
  const harness = templateHarness({
    capabilityResponses: [
      "read",
      "write",
      "verify",
      "retry1",
      "fence1",
      "retry2",
      "fence2",
    ],
    responses: [
      { bindings, revision: 0 },
      { body: { error: "Lost acknowledgement" }, httpStatus: 502 },
      { body: { error: "Offline" }, httpStatus: 503 },
      { bindings, revision: 0 },
      { bindings, recovery: { baseRevision: 0, settled: true }, revision: 1 },
      { bindings, revision: 1 },
      { bindings, recovery: { baseRevision: 0, settled: true }, revision: 1 },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  const original = harness.window.Asc.plugin.executeMethod;
  let drop = true;
  harness.window.Asc.plugin.executeMethod = (method, args, done) => {
    if (drop && method === "SetEditingRestrictions" && args[0] === "none") {
      drop = false;
      return original(method, args, () => {});
    }
    return original(method, args, done);
  };
  const timeouts = [];
  const originalTimeout = harness.window.setTimeout;
  harness.window.setTimeout = (callback, delay) => {
    const timer = originalTimeout(callback, delay);
    if (delay === 15_000) {
      timeouts.push(timer);
    }
    return timer;
  };
  const calls = observeCommands(harness);
  await click(harness, "ลองยืนยันอีกครั้ง");
  harness.spreadsheetNumberFormats.set("A1", "0.00");
  timeouts.find((timer) => !timer.cancelled).callback();
  await flushPlugin();
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(harness.spreadsheetNumberFormats.get("A1")).toBe("0.00");
  expect(
    calls.filter((name) => name.includes("RestoreValidation"))
  ).toHaveLength(1);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  expect(harness.statusElement.textContent).toContain("เอกสารเปลี่ยน");
});

test("an unacknowledged freeze and unlock leave a retryable lock-only state", async () => {
  const harness = templateHarness({
    capabilityResponses: ["read", "retry"],
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 0 },
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const original = harness.window.Asc.plugin.executeMethod;
  let drops = 2;
  harness.window.Asc.plugin.executeMethod = (method, args, done) => {
    if (drops > 0 && method === "SetEditingRestrictions") {
      drops -= 1;
      return original(method, args, () => {});
    }
    return original(method, args, done);
  };
  const timeouts = [];
  const originalTimeout = harness.window.setTimeout;
  harness.window.setTimeout = (callback, delay) => {
    const timer = originalTimeout(callback, delay);
    if (delay === 15_000) {
      timeouts.push(timer);
    }
    return timer;
  };
  const calls = observeCommands(harness);
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  const freezeTimeout = timeouts.find((timer) => !timer.cancelled);
  freezeTimeout.cancelled = true;
  freezeTimeout.callback();
  await flushPlugin();
  const unlockTimeout = timeouts.find((timer) => !timer.cancelled);
  unlockTimeout.cancelled = true;
  unlockTimeout.callback();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  await click(harness, "ลองยืนยันอีกครั้ง");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Pending title");
  expect(calls.some((name) => name.includes("Validation"))).toBe(false);
  expect(
    harness.requests.filter((request) => request.method !== "GET")
  ).toHaveLength(0);
});

test("moving a column before the freeze acknowledgement still edits its stable identity", async () => {
  const initial = { fields: [], table, version: 1 };
  const saved = {
    ...initial,
    table: {
      ...table,
      columns: [
        table.columns[0],
        { ...table.columns[1], offset: 2, type: "number" },
      ],
    },
  };
  const harness = templateHarness({
    capabilityResponses: ["read", "write"],
    responses: [
      { bindings: initial, revision: 0 },
      { bindings: saved, revision: 1 },
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "C3",
      names: { rows: "'Sheet1'!$B$3:$C$4" },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const original = harness.window.Asc.plugin.executeMethod;
  harness.window.Asc.plugin.executeMethod = (method, args, done) => {
    if (method === "SetEditingRestrictions" && args[0] === "readOnly") {
      harness.spreadsheetNames.set(table.anchor, "'Sheet1'!$B$3:$D$4");
      harness.spreadsheetNames.set(
        spreadsheetColumnAnchor("second"),
        "'Sheet1'!$D$3:$D$4"
      );
      harness.spreadsheetNames.set(
        spreadsheetTableColumnsAnchor(table.id),
        "'Sheet1'!$B$3:$D$4"
      );
    }
    return original(method, args, done);
  };
  control(harness, "ชนิดข้อมูล").value = "number";
  await click(harness, "บันทึกการแก้ไข");
  const patch = harness.requests.find((request) => request.method === "PATCH");
  expect(JSON.parse(patch.body)).toMatchObject({
    change: { kind: "column", value: { id: "second", offset: 2 } },
    spreadsheetColumnOffsets: [
      ["first", 0],
      ["second", 2],
    ],
  });
  expect(harness.spreadsheetValidations.has("D3:D4")).toBe(true);
  expect(harness.spreadsheetValidations.has("C3:C4")).toBe(false);
});
