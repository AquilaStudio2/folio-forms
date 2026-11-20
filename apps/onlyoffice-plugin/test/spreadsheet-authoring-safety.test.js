import { expect, test } from "bun:test";

import {
  spreadsheetBindingAttempt,
  spreadsheetBindingOutcome,
} from "../src/spreadsheet-binding-recovery.js";
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
const templateHarness = ({
  pendingFiles = { allowed: true },
  ...extra
} = {}) => {
  const harness = createHarness({
    action: "template-edit",
    documentKind: "xlsx",
    scopeIdentity: "template-safety",
    spreadsheetBindings: bindings,
    spreadsheetSelection: {
      address: "A1",
      names: { saved_choice: "'Sheet1'!$A$1" },
    },
    xlsxDraftProtocol: 1,
    xlsxDraftRevision: 0,
    ...extra,
  });
  const post = harness.parentWindow.postMessage;
  harness.parentWindow.postMessage = (message, origin) => {
    post(message, origin);
    if (message.type === "pending-file-check") {
      queueMicrotask(() => {
        harness.dispatch({
          data: {
            ...message,
            ...pendingFiles,
            source: "folio-upload-poc-host",
            type: "pending-file-result",
          },
          origin: harness.parentOrigin,
          source: harness.parentWindow,
        });
      });
    }
  };
  return harness;
};
const working = (harness) =>
  harness.window.FormBridge.getSpreadsheetBindings(false);
const save = (harness) => harness.window.FormBridge.runAction("save-template");
const saveRequests = (harness) =>
  harness.requests.filter(
    ({ method, url }) => method === "POST" && url.endsWith("/save")
  );
const saveBody = (harness) => {
  expect(saveRequests(harness)).toHaveLength(1);
  return JSON.parse(saveRequests(harness)[0].body);
};
const operation = { operationCapability: "poll", operationId: "save" };
const preserved = (next) =>
  completedOperation({
    bindingRevision: 1,
    bindings: next,
    documentKey: "document-key",
    editorSessionPreserved: true,
  });
const lostAck = { body: { error: "Lost acknowledgement" }, httpStatus: 502 };
const offline = { body: { error: "Offline" }, httpStatus: 503 };
const failCommand = (harness, name, execute = true) => {
  const original = harness.window.Asc.plugin.callCommand;
  harness.window.Asc.plugin.callCommand = (...args) => {
    if (!args[0].name.includes(name)) {
      return original(...args);
    }
    harness.window.Asc.plugin.callCommand = original;
    const callback = args.at(3);
    if (execute) {
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Override one native callback result, not the native command.
      args[3] = () => callback(false);
      return original(...args);
    }
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Simulate a rejected native command.
    return callback(false);
  };
};
const dropRestrictionAcks = (harness, ...restrictions) => {
  const original = harness.window.Asc.plugin.executeMethod;
  harness.window.Asc.plugin.executeMethod = (method, args, done) => {
    if (method === "SetEditingRestrictions" && args[0] === restrictions[0]) {
      restrictions.shift();
      return original(method, args, () => {});
    }
    return original(method, args, done);
  };
  const timers = [];
  const { setTimeout } = harness.window;
  harness.window.setTimeout = (callback, delay) => {
    const timer = setTimeout(callback, delay);
    if (delay === 15_000) {
      timers.push(timer);
    }
    return timer;
  };
  return async () => {
    const timer = timers.find((item) => !item.cancelled);
    expect(timer).toBeDefined();
    timer.cancelled = true;
    timer.callback();
    await flushPlugin();
  };
};
const observeCommands = (harness) => {
  const calls = [];
  const original = harness.window.Asc.plugin.callCommand;
  harness.window.Asc.plugin.callCommand = (...args) => {
    calls.push(args[0].name);
    return original(...args);
  };
  return calls;
};

test("repairing a missing table anchor requires explicit column choices and stays local until Save", async () => {
  const first = {
    computed: false,
    id: "folio_left",
    key: "left",
    label: "Left",
    offset: 0,
    options: [],
    required: false,
    type: "text",
  };
  const table = {
    anchor: "folio_table_anchor",
    columns: [
      first,
      { ...first, id: "folio_right", key: "right", label: "Right", offset: 1 },
    ],
    id: "folio_table",
    key: "rows",
    label: "Rows",
  };
  const harness = templateHarness({
    spreadsheetBindings: { fields: [], table, version: 1 },
    spreadsheetSelection: { address: "A1:B2", names: {} },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const existing = control(harness, "ช่องที่บันทึกแล้ว");
  existing.value = table.id;
  existing.dispatchEvent({ type: "change" });
  control(harness, "Left (left)").value = "2";
  await click(harness, "ผูกตำแหน่งใหม่กับช่วงที่เลือก");
  expect(harness.spreadsheetNames.size).toBe(0);
  expect(harness.statusElement.textContent).toContain("ระบุลำดับคอลัมน์ให้ครบ");

  // Leaving the panel choice cancels it without touching the native workbook.
  existing.value = "";
  existing.dispatchEvent({ type: "change" });
  expect(harness.spreadsheetNames.size).toBe(0);
  existing.value = table.id;
  existing.dispatchEvent({ type: "change" });
  expect(control(harness, "Left (left)").value).toBe("");
  control(harness, "Left (left)").value = "2";
  control(harness, "Right (right)").value = "1";
  await click(harness, "ผูกตำแหน่งใหม่กับช่วงที่เลือก");
  expect(harness.spreadsheetNames.get(table.anchor)).toBe("'Sheet1'!A1:B2");
  expect(harness.spreadsheetNames.get(spreadsheetColumnAnchor(first.id))).toBe(
    "'Sheet1'!$B$1:$B$2"
  );
  expect(
    harness.spreadsheetNames.get(spreadsheetColumnAnchor("folio_right"))
  ).toBe("'Sheet1'!$A$1:$A$2");
  expect(harness.requests).toHaveLength(0);
});

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
  const harness = templateHarness();
  acknowledgeBridge(harness);
  await flushPlugin();
  const entry = descendants(harness.body).find(
    (node) => node.tagName === "TEXTAREA"
  );
  entry.value = "not added yet";
  await click(harness, "บันทึกการแก้ไข");
  expect(harness.requests).toHaveLength(0);
  expect(entry.value).toBe("not added yet");
  expect(harness.statusElement.textContent).toContain("Add หรือ Update");
});

test("failed native Apply restores cells and removes its newly created anchor", async () => {
  const empty = { fields: [], table: null, version: 1 };
  const harness = templateHarness({
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
  failCommand(harness, "spreadsheetValidationCommand");
  control(harness, "Tag · รหัสช่อง").value = "new_choice";
  control(harness, "ชนิดข้อมูล").value = "date";
  await click(harness, "เพิ่มช่องจากช่วงที่เลือก");
  expect(harness.requests).toHaveLength(0);
  expect(await working(harness)).toMatchObject({
    bindings: empty,
    revision: 0,
  });
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
  expect(harness.statusElement.textContent).toContain("กรุณา");
});

test("Apply is local; versioned Save recovers the admitted operation without replay", async () => {
  const saved = {
    ...bindings,
    fields: [{ ...field, label: "Verified change" }],
  };
  const harness = templateHarness({
    capabilityResponses: ["save", "verify", "retry"],
    responses: [
      lostAck,
      offline,
      { ...operation, action: "save-template" },
      preserved(saved),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const calls = observeCommands(harness);
  control(harness, "Title · ชื่อช่อง").value = "Verified change";
  await click(harness, "บันทึกการแก้ไข");
  expect(await working(harness)).toMatchObject({
    bindings: saved,
    revision: 0,
  });
  expect(harness.requests).toHaveLength(0);
  expect(harness.statusElement.textContent).toContain("รอบันทึกต้นแบบ");
  await expect(save(harness)).resolves.toMatchObject({
    error: expect.stringContaining("Lost acknowledgement"),
    ok: false,
  });
  const body = saveBody(harness);
  expect(body.xlsxDraft).toMatchObject({
    bindings: saved,
    revision: 0,
    version: 1,
  });
  expect(harness.editorRestriction).toBe("readOnly");
  await expect(save(harness)).resolves.toMatchObject({
    error: expect.stringContaining("Offline"),
    ok: false,
  });
  await expect(save(harness)).resolves.toMatchObject({
    ok: true,
    result: { bindingRevision: 1 },
  });
  const recoveries = harness.requests.filter(({ url }) =>
    url.endsWith("/xlsx-draft/recover")
  );
  expect(recoveries).toHaveLength(2);
  for (const request of recoveries) {
    expect(JSON.parse(request.body)).toEqual({
      checkpoint: body.xlsxDraft.checkpoint,
      leaseId: "test-editor-lease",
    });
  }
  expect(saveRequests(harness)).toHaveLength(1);
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  expect(harness.editorRestriction).toBe("readOnly");
});

test.each([
  { category: "Legacy destination" },
  {
    category: null,
    document_category_id: 7,
    mode: "template",
    storage_template_id: "selected-template",
    template_name: "Selected destination",
  },
])(
  "preserved Save keeps attachment settings and advances the base: %j",
  async (attachment) => {
    const initial = {
      ...bindings,
      fields: [{ ...field, attachment, options: [], type: "text" }],
    };
    const saved = {
      ...initial,
      fields: [{ ...initial.fields[0], label: "Saved attachment" }],
    };
    const harness = templateHarness({
      capabilityResponses: ["save"],
      responses: [operation, preserved(saved)],
      spreadsheetBindings: initial,
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    control(harness, "Title · ชื่อช่อง").value = "Saved attachment";
    await click(harness, "บันทึกการแก้ไข");
    expect(harness.requests).toHaveLength(0);
    await expect(save(harness)).resolves.toMatchObject({ ok: true });
    expect(
      saveBody(harness).xlsxDraft.bindings.fields[0].attachment
    ).toMatchObject(attachment);
    control(harness, "Title · ชื่อช่อง").value = "Further authoring";
    await click(harness, "บันทึกการแก้ไข");
    expect(await working(harness)).toMatchObject({
      bindings: { fields: [{ attachment, label: "Further authoring" }] },
      revision: 1,
    });
    expect(saveRequests(harness)).toHaveLength(1);
  }
);

test.each([
  { category: "Different category" },
  { document_category_id: 8 },
  { mode: "legacy" },
  { storage_template_id: "another-template" },
  { template_name: "Another destination" },
])("recovery rejects a truly changed attachment tuple: %j", (changed) => {
  const value = {
    ...field,
    attachment: {
      category: null,
      document_category_id: 7,
      mode: "template",
      storage_template_id: "selected-template",
      template_name: "Selected destination",
    },
  };
  const attempt = spreadsheetBindingAttempt({
    bindings,
    change: { action: "upsert", kind: "field", value },
    documentKey: "document-key",
    revision: 0,
  });
  expect(
    spreadsheetBindingOutcome(attempt, {
      bindings,
      documentKey: "document-key",
      revision: 0,
    })
  ).toBe("unchanged");
  expect(
    spreadsheetBindingOutcome(attempt, {
      bindings: {
        ...bindings,
        fields: [{ ...value, attachment: { ...value.attachment, ...changed } }],
      },
      documentKey: "document-key",
      revision: 1,
    })
  ).toBe("conflict");
});

test("unresolved Save retains native changes and never admits a new Publish", async () => {
  const harness = templateHarness({
    capabilityResponses: ["save", "recover"],
    responses: [lostAck, offline],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "ชนิดข้อมูล").value = "number";
  await click(harness, "บันทึกการแก้ไข");
  const native = harness.spreadsheetValidations.get("A1");
  expect(native).toBeDefined();
  await expect(save(harness)).resolves.toMatchObject({ ok: false });
  const result = await harness.window.FormBridge.runAction("publish");
  expect(result.error).toContain("ห้ามส่งซ้ำ");
  expect(harness.requests.some(({ url }) => url.endsWith("/publish"))).toBe(
    false
  );
  expect(harness.spreadsheetValidations.get("A1")).toEqual(native);
  expect(harness.editorRestriction).toBe("readOnly");
});

test("deleting a field clears only its native anchor and preserves unrelated names", async () => {
  const other = { ...field, anchor: "other_choice", id: "other", key: "other" };
  const initial = { ...bindings, fields: [field, other] };
  const saved = { ...bindings, fields: [other] };
  const harness = templateHarness({
    capabilityResponses: ["save"],
    responses: [operation, preserved(saved)],
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

test("failed native deletion restores its anchor and keeps the editable binding", async () => {
  const harness = templateHarness({
    spreadsheetSelection: {
      address: "A1",
      names: { saved_choice: "'Sheet1'!$A$1" },
      validations: { A1: { formula1: '"one,two"', type: "list" } },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  failCommand(harness, "ClearValidation");
  await click(harness, "ลบช่องนี้");
  expect(harness.spreadsheetNames.get(field.anchor)).toBe("'Sheet1'!$A$1");
  expect(control(harness, "Title · ชื่อช่อง").value).toBe(field.label);
  expect(harness.spreadsheetValidations.get("A1")).toMatchObject({
    type: "list",
  });
  expect(harness.statusElement.textContent).toContain("ลบกฎของช่องไม่ได้");
  expect(harness.requests).toHaveLength(0);
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

const trackedTableNames = {
  rows: "'Sheet1'!$B$3:$C$4",
  [spreadsheetTableColumnsAnchor(table.id)]: "'Sheet1'!$B$3:$C$4",
  [spreadsheetColumnAnchor("first")]: "'Sheet1'!$B$3:$B$4",
  [spreadsheetColumnAnchor("second")]: "'Sheet1'!$C$3:$C$4",
};

test("deleting a table removes all tracking names while preserving outside cells and names", async () => {
  const initial = { fields: [field], table, version: 1 };
  const saved = { ...initial, table: null };
  const harness = templateHarness({
    capabilityResponses: ["save"],
    responses: [operation, preserved(saved)],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "B3:C4",
      names: {
        ...trackedTableNames,
        saved_choice: "'Sheet1'!$A$1",
        unrelated: "'Sheet1'!$F$6",
      },
      validations: {
        A1: { formula1: '"one,two"', type: "list" },
        "B3:B4": { formula1: "0", type: "decimal" },
        "C3:C4": { formula1: "0", type: "decimal" },
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
  expect(harness.spreadsheetValidations.has("B3:B4")).toBe(false);
  expect(harness.spreadsheetValidations.has("C3:C4")).toBe(false);
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
    capabilityResponses: ["save"],
    responses: [operation, preserved(saved)],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "B3",
      names: trackedTableNames,
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
    capabilityResponses: ["save"],
    responses: [operation, preserved(saved)],
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
    saveBody(harness).xlsxDraft.bindings.table.columns.map(({ id }) => id)
  ).toEqual(["second"]);
  expect(harness.statusElement.textContent).toContain(
    "ลบช่องและบันทึกต้นแบบในตัวแก้ไขเดิมแล้ว"
  );
  expect(saveBody(harness)).toMatchObject({
    preserveEditorSession: true,
    preserveEditorSessionPurpose: "manual",
  });
  expect(saveBody(harness)).not.toHaveProperty("deletedUploadPocBindingIds");
});

test("editing a moved column saves the complete live column order in one versioned candidate", async () => {
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
    capabilityResponses: ["save"],
    responses: [operation, preserved(saved)],
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
  expect(harness.requests).toHaveLength(0);
  await expect(save(harness)).resolves.toMatchObject({ ok: true });
  expect(saveBody(harness).xlsxDraft).toMatchObject({
    bindings: saved,
    revision: 0,
    version: 1,
  });
  expect(harness.spreadsheetValidations.has("D3:D4")).toBe(true);
  expect(harness.spreadsheetValidations.has("C3:C4")).toBe(false);
});

const retry = (harness) => click(harness, "ลองยืนยันอีกครั้ง");
const bindingProof = { bindings, documentKey: "document-key", revision: 0 };

test("lost native unlock shows retry controls, remains blocked offline, and resumes after proof", async () => {
  const native = { address: "A1", names: { saved_choice: "'Sheet1'!$A$1" } };
  const harness = templateHarness({
    capabilityResponses: ["verify", "retry"],
    responses: [offline, bindingProof],
    spreadsheetSelection: native,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const expire = dropRestrictionAcks(harness, "none");
  const panel = descendants(harness.body).find((node) =>
    node.className?.includes("spreadsheet-panel")
  );
  panel.scrollTop = 1200;
  control(harness, "Title · ชื่อช่อง").value = "Applied title";
  await click(harness, "บันทึกการแก้ไข");
  await expire();
  expect(panel.scrollTop).toBe(0);
  const button = descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === "ลองยืนยันอีกครั้ง"
  );
  expect(button.hidden).toBe(false);
  expect(button.disabled).toBe(false);
  expect(button["aria-describedby"]).toBe("spreadsheet-recovery-status");
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  expect(control(harness, "ช่องที่บันทึกแล้ว").disabled).toBe(false);
  descendants(harness.statusElement)
    .find((node) => node["aria-label"] === "ปิดข้อความแจ้งเตือน")
    .dispatchEvent({ type: "click" });
  expect(harness.statusElement.hidden).toBe(true);
  const blocked = await harness.window.FormBridge.runAction("publish");
  expect(blocked.error).toContain("ลองยืนยันอีกครั้ง");
  expect(harness.statusElement.hidden).toBe(false);
  panel.scrollTop = 400;
  native.address = "B2";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(panel.scrollTop).toBe(400);
  await retry(harness);
  expect(button.hidden).toBe(false);
  await retry(harness);
  expect(button.hidden).toBe(true);
  expect(harness.editorRestriction).toBe("none");
  expect(await working(harness)).toMatchObject({
    bindings: { fields: [{ label: "Applied title" }] },
  });
  expect(harness.requests.map(({ method }) => method)).toEqual(["GET", "GET"]);
});

test("recovering an applied field preserves unapplied edits at another selection", async () => {
  const native = { address: "B2", names: { saved_choice: "'Sheet1'!$A$1" } };
  const harness = templateHarness({
    capabilityResponses: ["verify"],
    responses: [bindingProof],
    spreadsheetSelection: native,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Unsaved B2";
  native.address = "A1";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  const expire = dropRestrictionAcks(harness, "none");
  control(harness, "Title · ชื่อช่อง").value = "Applied A1";
  await click(harness, "บันทึกการแก้ไข");
  await expire();
  native.address = "B2";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Unsaved B2");
  await retry(harness);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Unsaved B2");
  const blocked = await save(harness);
  expect(blocked.error).toContain("เพิ่มช่องจากช่วงที่เลือก");
  expect(saveRequests(harness)).toHaveLength(0);
});

test.each([
  ["advanced revision", { ...bindingProof, revision: 2 }],
  ["malformed revision", { ...bindingProof, revision: null }],
  [
    "same revision for another document",
    { ...bindingProof, documentKey: "other" },
  ],
  [
    "same revision with malformed rules",
    { ...bindingProof, bindings: { ...bindings, table: {} } },
  ],
  [
    "stale capability",
    {
      body: {
        error: "editor_capability_scope_mismatch",
        message: "Editor capability does not match this document",
      },
      httpStatus: 403,
    },
  ],
])("native recovery remains blocked on %s", async (_name, proof) => {
  const harness = templateHarness({
    capabilityResponses: ["verify"],
    responses: [proof],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const expire = dropRestrictionAcks(harness, "none");
  control(harness, "Title · ชื่อช่อง").value = "Pending title";
  await click(harness, "บันทึกการแก้ไข");
  await expire();
  const calls = observeCommands(harness);
  await retry(harness);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Pending title");
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  expect(harness.requests.map(({ method }) => method)).toEqual(["GET"]);
});

test("a failed native restore can be retried while retaining the unapplied field", async () => {
  const empty = { ...bindings, fields: [] };
  const proof = { ...bindingProof, bindings: empty };
  const harness = templateHarness({
    capabilityResponses: ["verify", "retry"],
    responses: [proof, proof],
    spreadsheetBindings: empty,
    spreadsheetSelection: {
      address: "B2",
      formats: { B2: "0.00" },
      validations: { B2: { formula1: "0", type: "decimal" } },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  failCommand(harness, "RestoreValidation", false);
  failCommand(harness, "spreadsheetValidationCommand");
  control(harness, "Tag · รหัสช่อง").value = "new_field";
  control(harness, "ชนิดข้อมูล").value = "date";
  await click(harness, "เพิ่มช่องจากช่วงที่เลือก");
  expect(harness.spreadsheetNames.size).toBe(1);
  failCommand(harness, "RestoreValidation", false);
  await retry(harness);
  expect(control(harness, "Tag · รหัสช่อง").disabled).toBe(true);
  await retry(harness);
  expect(harness.spreadsheetNames.size).toBe(0);
  expect(harness.spreadsheetNumberFormats.get("B2")).toBe("0.00");
  expect(harness.spreadsheetValidations.get("B2")).toMatchObject({
    formula1: "0",
    type: "decimal",
  });
  expect(control(harness, "Tag · รหัสช่อง").value).toBe("new_field");
  expect(control(harness, "ชนิดข้อมูล").value).toBe("date");
  expect(control(harness, "Tag · รหัสช่อง").disabled).toBe(false);
  await expect(save(harness)).resolves.toMatchObject({
    error: expect.stringContaining("เพิ่มช่องจากช่วงที่เลือก"),
  });
  expect(harness.requests.map(({ method }) => method)).toEqual(["GET", "GET"]);
});

test("native recovery never overwrites a target edited during a lost unlock acknowledgement", async () => {
  const harness = templateHarness({
    capabilityResponses: ["verify"],
    responses: [bindingProof],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const expire = dropRestrictionAcks(harness, "none");
  control(harness, "ชนิดข้อมูล").value = "number";
  await click(harness, "บันทึกการแก้ไข");
  harness.spreadsheetNumberFormats.set("A1", "0.00");
  await expire();
  const calls = observeCommands(harness);
  await retry(harness);
  expect(harness.spreadsheetNumberFormats.get("A1")).toBe("0.00");
  expect(calls.some((name) => name.includes("RestoreValidation"))).toBe(false);
  expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
  expect(harness.statusElement.textContent).toContain("เอกสารเปลี่ยน");
});

test.each([false, true])(
  "lost freeze ACK never mutates cells (lost unlock ACK: %s)",
  async (loseUnlock) => {
    const harness = templateHarness({
      capabilityResponses: ["verify"],
      responses: [bindingProof],
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    const expire = dropRestrictionAcks(
      harness,
      "readOnly",
      ...(loseUnlock ? ["none"] : [])
    );
    const calls = observeCommands(harness);
    control(harness, "Title · ชื่อช่อง").value = "Pending title";
    await click(harness, "บันทึกการแก้ไข");
    await expire();
    if (loseUnlock) {
      await expire();
      expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(true);
      await retry(harness);
    }
    expect(harness.editorRestriction).toBe("none");
    expect(calls.some((name) => name.includes("Validation"))).toBe(false);
    expect(control(harness, "Title · ชื่อช่อง").disabled).toBe(false);
    expect(control(harness, "Title · ชื่อช่อง").value).toBe("Pending title");
    expect(harness.requests.map(({ method }) => method)).toEqual(
      loseUnlock ? ["GET"] : []
    );
  }
);

test("a lost deletion Save ACK can be fenced as not admitted without replay or native rollback", async () => {
  const harness = templateHarness({
    capabilityResponses: ["save", "recover", "retry"],
    responses: [lostAck, lostAck, { status: "not-admitted" }],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  await click(harness, "ลบช่องนี้");
  const body = saveBody(harness);
  expect(body.xlsxDraft).toMatchObject({
    bindings: { fields: [] },
    revision: 0,
    version: 1,
  });
  expect(harness.spreadsheetNames.has(field.anchor)).toBe(false);
  await expect(save(harness)).resolves.toMatchObject({
    error: expect.stringContaining("ห้ามส่งซ้ำ"),
  });
  await expect(save(harness)).resolves.toMatchObject({
    error: expect.stringContaining("เปิดต้นแบบใหม่"),
  });
  expect(harness.editorRestriction).toBe("readOnly");
  expect(harness.spreadsheetNames.has(field.anchor)).toBe(false);
  expect(saveRequests(harness)).toHaveLength(1);
  expect(
    harness.requests
      .slice(1)
      .map(({ body: raw, url }) => [
        url.endsWith("/xlsx-draft/recover"),
        JSON.parse(raw),
      ])
  ).toEqual([
    [
      true,
      { checkpoint: body.xlsxDraft.checkpoint, leaseId: "test-editor-lease" },
    ],
    [
      true,
      { checkpoint: body.xlsxDraft.checkpoint, leaseId: "test-editor-lease" },
    ],
  ]);
});

test("an unversioned editor remains read-only and cannot Apply or Save", async () => {
  const harness = templateHarness({ xlsxDraftProtocol: 0 });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Do not apply";
  await click(harness, "บันทึกการแก้ไข");
  expect(harness.statusElement.textContent).toContain("ตัวแก้ไข Excel รุ่นล่าสุด");
  await expect(save(harness)).resolves.toMatchObject({ ok: false });
  expect(harness.editorRestriction).toBe("readOnly");
  expect(harness.requests).toHaveLength(0);
});

test("moving a column before the freeze acknowledgement still edits its stable identity", async () => {
  const initial = { fields: [], table, version: 1 };
  const harness = templateHarness({
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "C3",
      names: trackedTableNames,
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
  const { bindings: candidate } = await working(harness);
  expect(candidate.table.columns).toMatchObject([
    { id: "first", offset: 0 },
    { id: "second", offset: 2, type: "number" },
  ]);
  expect(harness.requests).toHaveLength(0);
  expect(harness.spreadsheetValidations.has("D3:D4")).toBe(true);
  expect(harness.spreadsheetValidations.has("C3:C4")).toBe(false);
});

test("Admin chooses PDMS source without losing the existing Field Title, Tag or identity", async () => {
  const harness = templateHarness({
    capabilityResponses: ["save"],
    pdmsProjectEnabled: true,
    responses: [
      operation,
      completedOperation({ documentKey: "replacement-key" }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const type = control(harness, "ชนิดข้อมูล");
  expect(
    type.children.some((option) => option.value === "pdms-project-name")
  ).toBe(true);
  type.value = "pdms-project-name";
  type.dispatchEvent({ type: "change" });
  await click(harness, "บันทึกการแก้ไข");
  expect(saveBody(harness).xlsxDraft.bindings.fields[0]).toMatchObject({
    id: field.id,
    key: field.key,
    label: field.label,
    options: [],
    source: "pdms-project-name",
    type: "dropdown",
  });
  expect(control(harness, "ชนิดข้อมูล").value).toBe("pdms-project-name");
});

test("uncertain Save retains the PDMS source candidate without allowing another Apply", async () => {
  const harness = templateHarness({
    capabilityResponses: ["save"],
    pdmsProjectEnabled: true,
    responses: [lostAck],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const type = control(harness, "ชนิดข้อมูล");
  type.value = "pdms-project-name";
  type.dispatchEvent({ type: "change" });
  await click(harness, "บันทึกการแก้ไข");
  expect(harness.statusElement.textContent).toContain("ห้ามส่งซ้ำ");
  expect(saveBody(harness).xlsxDraft.bindings.fields[0].source).toBe(
    "pdms-project-name"
  );
  type.value = "text";
  await click(harness, "บันทึกการแก้ไข");
  expect(await working(harness)).toMatchObject({
    bindings: { fields: [{ source: "pdms-project-name" }] },
  });
  expect(harness.editorRestriction).toBe("readOnly");
  expect(saveRequests(harness)).toHaveLength(1);
});

test("Admin removing the last project Field clears its preview and source state through the existing save barrier", async () => {
  const project = { ...field, options: [], source: "pdms-project-name" };
  const initial = { ...bindings, fields: [project] };
  const removed = { ...bindings, fields: [] };
  const harness = templateHarness({
    capabilityResponses: ["save"],
    pdmsProjectCatalog: {
      names: ["Project one"],
      sessionId: "catalog",
      status: "ready",
    },
    pdmsProjectEnabled: true,
    responses: [operation, preserved(removed)],
    spreadsheetBindings: initial,
    spreadsheetSelection: {
      address: "A1",
      formats: { A1: "dd/mm/yyyy" },
      names: { custom_name: "'Sheet1'!$F$6", saved_choice: "'Sheet1'!$A$1" },
      values: { A1: "Visible project" },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  expect(
    harness.window.FormBridge.getRuntimeOptions().pdmsProjectCatalog.status
  ).toBe("ready");
  await click(harness, "ลบช่องนี้");
  expect(
    harness.window.FormBridge.getRuntimeOptions().pdmsProjectCatalog
  ).toBeNull();
  expect(harness.spreadsheetNumberFormats.get("A1")).toBe("dd/mm/yyyy");
  expect(harness.spreadsheetNames.get("custom_name")).toBe("'Sheet1'!$F$6");
  expect(saveBody(harness)).toMatchObject({
    preserveEditorSession: true,
    preserveEditorSessionPurpose: "manual",
  });
});

test("rebinding a missing Field stages its repaired anchor and validation until versioned Save", async () => {
  const initial = { ...bindings, fields: [{ ...field, unbound: true }] };
  const harness = templateHarness({
    capabilityResponses: ["save"],
    responses: [operation, preserved(bindings)],
    spreadsheetBindings: initial,
    spreadsheetSelection: { address: "B2" },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const existing = control(harness, "ช่องที่บันทึกแล้ว");
  existing.value = field.id;
  existing.dispatchEvent({ type: "change" });
  await click(harness, "ผูกตำแหน่งใหม่กับช่วงที่เลือก");
  expect(harness.requests).toHaveLength(0);
  expect(harness.spreadsheetNames.get(field.anchor)).toMatch(/\$?B\$?2/u);
  expect(harness.spreadsheetValidations.get("B2")).toMatchObject({
    formula1: "one,two",
    type: "xlValidateList",
  });
  const { bindings: candidate } = await working(harness);
  expect(candidate.fields[0]).not.toHaveProperty("unbound");
  await expect(save(harness)).resolves.toMatchObject({ ok: true });
  expect(saveBody(harness)).toMatchObject({
    spreadsheetAnchors: [[field.anchor, expect.stringMatching(/\$?B\$?2/u)]],
    xlsxDraft: { bindings, revision: 0, version: 1 },
  });
});

test("pending host files block native Save and preserve the applied working Rules", async () => {
  const harness = templateHarness({
    pendingFiles: { allowed: false, error: "Pending attachment" },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Working title";
  await click(harness, "บันทึกการแก้ไข");
  await expect(save(harness)).resolves.toMatchObject({
    error: "Pending attachment",
    ok: false,
  });
  expect(await working(harness)).toMatchObject({
    bindings: { fields: [{ label: "Working title" }] },
  });
  expect(harness.saveCalls).toHaveLength(0);
  expect(harness.requests).toHaveLength(0);
});

test("a rejected native save acknowledgement never admits the versioned candidate", async () => {
  const harness = templateHarness({ holdEditorSave: true });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "Title · ชื่อช่อง").value = "Working title";
  await click(harness, "บันทึกการแก้ไข");
  const pending = save(harness);
  await flushPlugin();
  expect(
    harness.messages.some(
      ({ message }) => message.type === "editor-save-request"
    )
  ).toBe(true);
  expect(harness.editorRestriction).toBe("readOnly");
  expect(harness.requests).toHaveLength(0);
  harness.finishEditorSave("Native save rejected");
  await expect(pending).resolves.toMatchObject({
    error: "Native save rejected",
    ok: false,
  });
  expect(await working(harness)).toMatchObject({
    bindings: { fields: [{ label: "Working title" }] },
  });
  expect(harness.editorRestriction).toBe("none");
  expect(harness.requests).toHaveLength(0);
});
