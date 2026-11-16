import { expect, test } from "bun:test";

import { attachCategoryPopup } from "./attachment-category-popup-harness.js";
import { acknowledgeBridge, createHarness, flushPlugin } from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const action = (harness) =>
  descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === "เพิ่มช่องแนบไฟล์"
  );
const input = (harness, title) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === title
  )?.children[1];
const empty = () => ({ fields: [], table: null, version: 1 });

const setup = async ({
  bindings = empty(),
  selected = { address: "B3" },
  reject = false,
  saveFailures = 0,
  saveResult = { documentKey: "document-key", editorSessionPreserved: true },
  gate,
  categories = ["หลักฐาน"],
  conversionGate,
  liveBindings = bindings,
  categoryPopup = true,
  categoryChannel = "category-channel",
} = {}) => {
  let state = structuredClone(liveBindings);
  let revision = 0;
  let firstRead = true;
  let remainingSaveFailures = saveFailures;
  let proofSaved = false;
  let conversionPaused = false;
  const response = async (url, init) => {
    if (String(url).endsWith("/attachment-categories")) {
      return typeof categories === "function" ? categories() : { categories };
    }
    if (String(url).includes("/operations/")) {
      return { operation: { result: saveResult, status: "completed" } };
    }
    if (init.method === "POST" && String(url).endsWith("/save")) {
      if (remainingSaveFailures > 0) {
        remainingSaveFailures -= 1;
        return { body: { error: "save unavailable" }, httpStatus: 503 };
      }
      proofSaved = true;
      return {
        operationCapability: "operation-capability",
        operationId: "poc-save-operation",
      };
    }
    if (!init.method || init.method === "GET") {
      if (conversionGate && proofSaved && !conversionPaused) {
        conversionPaused = true;
        await conversionGate.promise;
      }
      if (firstRead && gate) {
        await gate.promise;
      }
      firstRead = false;
    } else if (reject) {
      return { body: { error: "binding denied" }, httpStatus: 409 };
    } else {
      const { change } = JSON.parse(init.body);
      state =
        change.kind === "column"
          ? {
              ...state,
              table: {
                ...state.table,
                columns: state.table.columns.map((column) =>
                  column.id === change.value.id ? change.value : column
                ),
              },
            }
          : {
              ...state,
              fields: [
                ...state.fields.filter((field) => field.id !== change.value.id),
                change.value,
              ],
            };
      revision += 1;
    }
    return { bindings: state, documentKey: "document-key", revision };
  };
  const harness = createHarness({
    action: "template-edit",
    attachmentCategoryPopupChannelId: categoryChannel,
    capabilityResponses: Array.from(
      { length: 30 },
      () => "configure-fields-capability"
    ),
    documentKind: "xlsx",
    responses: Array.from({ length: 30 }, () => response),
    serializeCommands: true,
    spreadsheetBindings: bindings,
    spreadsheetSelection: selected,
  });
  if (categoryPopup) {
    attachCategoryPopup(harness);
  }
  const projections = [];
  const projectionLocks = [];
  const original = harness.window.Asc.plugin.callCommand;
  harness.window.Asc.plugin.callCommand = (...args) => {
    if (args[0]?.name !== "spreadsheetUploadPocCommand") {
      return original(...args);
    }
    const targets = structuredClone(
      harness.window.Asc.scope.folioSpreadsheetUploadPoc.targets
    );
    projections.push(targets);
    projectionLocks.push(
      harness.methodInvocations.findLast(
        (call) => call.method === "SetEditingRestrictions"
      )?.args?.[0]
    );
    for (const target of targets) {
      harness.spreadsheetNames.set(
        `_folio_upload_poc_${target.bindingId}`,
        harness.spreadsheetNames.get(target.anchor)
      );
    }
    args.at(-1)(JSON.stringify({ count: targets.length, ok: true }));
  };
  acknowledgeBridge(harness);
  await flushPlugin();
  return { harness, projectionLocks, projections, state: () => state };
};
const confirmCategory = async (harness, category = "หลักฐาน") => {
  const dialog = harness.categoryPopup.body.children.find(
    (node) => node.tagName === "MAIN" && !node.hidden
  );
  if (!dialog) {
    return;
  }
  const select = descendants(dialog).find((node) => node.tagName === "SELECT");
  select.value = category;
  select.dispatchEvent({ type: "change" });
  descendants(dialog)
    .find(
      (node) => node.tagName === "BUTTON" && node.textContent === "ยืนยันและบันทึก"
    )
    .click();
  await flushPlugin();
  await flushPlugin();
};
const click = async (harness, category = "หลักฐาน") => {
  action(harness).dispatchEvent({ type: "click" });
  await flushPlugin();
  await confirmCategory(harness, category);
  await flushPlugin();
};

test("placement waits for category confirmation and cancellation leaves the workbook and fields unchanged", async () => {
  const { harness, state, projections } = await setup();
  action(harness).dispatchEvent({ type: "click" });
  await flushPlugin();
  expect(state().fields).toEqual([]);
  expect(projections).toEqual([]);
  const dialog = harness.categoryPopup.body.children.find(
    (node) => node.tagName === "MAIN"
  );
  expect(dialog.hidden).toBe(false);
  const cancel = descendants(dialog).find(
    (node) => node.tagName === "BUTTON" && node.textContent === "ยกเลิก"
  );
  cancel.click();
  await flushPlugin();
  expect(state()).toEqual(empty());
  expect([...harness.spreadsheetNames]).toEqual([]);
  expect(
    harness.requests.filter((request) => request.method !== "GET")
  ).toEqual([]);
});

test("confirmation creates a configured attachment and repeat placement reuses the same field and tag", async () => {
  const { harness, projections, state } = await setup();
  await click(harness);
  expect(state().fields).toHaveLength(1);
  const [field] = state().fields;
  expect(field).toMatchObject({
    attachment: { category: "หลักฐาน" },
    key: "attachment_1",
    label: "ไฟล์แนบ 1",
    required: false,
    type: "text",
  });
  expect(harness.spreadsheetNames.get(field.anchor)).toContain("B3");
  expect(input(harness, "Title · ชื่อช่อง").value).toBe(field.label);
  expect(input(harness, "Tag · รหัสช่อง").value).toBe(field.key);
  await click(harness);
  expect(state().fields).toHaveLength(1);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  expect(projections).toHaveLength(2);
  expect(projections[1][0].bindingId).toBe(field.id);
});

test("automatic title and tag skip existing collisions", async () => {
  const bindings = empty();
  bindings.fields = [
    {
      anchor: "old",
      computed: false,
      id: "old",
      key: "attachment_1",
      label: "ไฟล์แนบ 2",
      options: [],
      required: false,
      type: "text",
    },
  ];
  const { harness, state } = await setup({
    bindings,
    selected: { address: "D3", names: { old: "'Sheet1'!$B$3" } },
  });
  await click(harness);
  expect(state().fields[1]).toMatchObject({
    key: "attachment_3",
    label: "ไฟล์แนบ 3",
  });
  expect(state().fields[0]).toEqual(bindings.fields[0]);
});

test("binding rejection rolls back its anchor and never projects a button or marker", async () => {
  const { harness, projections, state } = await setup({ reject: true });
  await click(harness);
  expect(state().fields).toHaveLength(0);
  expect(projections).toHaveLength(0);
  expect([...harness.spreadsheetNames.keys()]).toHaveLength(0);
});

test("existing table column is reused with its metadata and body projection", async () => {
  const bindings = {
    ...empty(),
    table: {
      anchor: "items",
      columns: [
        {
          computed: false,
          id: "folio_proof",
          key: "proof",
          label: "Original",
          offset: 1,
          options: [],
          required: true,
          type: "text",
        },
      ],
      id: "items",
      key: "items",
    },
  };
  const { harness, projections, state } = await setup({
    bindings,
    selected: {
      address: "B7",
      names: {
        folio_column_folio_proof: "'Sheet1'!$B$7:$B$9",
        folio_columns_items: "'Sheet1'!$A$7:$B$9",
        items: "'Sheet1'!$A$7:$B$9",
      },
    },
  });
  await click(harness);
  expect(state().fields).toEqual([]);
  expect(state().table.columns).toEqual([
    {
      ...bindings.table.columns[0],
      attachment: { category: "หลักฐาน" },
      placeholder: null,
    },
  ]);
  const save = harness.requests.find((request) => request.method === "POST");
  expect(JSON.parse(save.body)).toMatchObject({
    preserveEditorSession: true,
    uploadPocBindingId: "folio_proof",
  });
  expect(projections[0][0]).toMatchObject({
    bindingId: "folio_proof",
    bodyAnchor: "items",
    columnOffset: 1,
    tag: "items.proof",
  });
});

test("selection changing while bindings GET waits keeps the originally clicked cell", async () => {
  const gate = Promise.withResolvers();
  const selected = { address: "B3" };
  const { harness, state, projections } = await setup({ gate, selected });
  action(harness).dispatchEvent({ type: "click" });
  await flushPlugin();
  selected.address = "D3";
  gate.resolve();
  await flushPlugin();
  await confirmCategory(harness);
  await flushPlugin();
  expect(state().fields).toHaveLength(1);
  expect(harness.spreadsheetNames.get(state().fields[0].anchor)).toContain(
    "B3"
  );
  expect(projections).toHaveLength(1);
  expect(selected.address).toBe("B3");
});

const configuredAttachment = (number) => ({
  anchor: `folio_attachment_${number}`,
  computed: false,
  id: `folio_attachment_${number}`,
  key: `attachment_${number}`,
  label: `ไฟล์แนบ ${number}`,
  options: [],
  required: false,
  type: "text",
});

test("real orphan mappings name every missing tag and block new placement until explicitly repaired", async () => {
  const bindings = {
    ...empty(),
    fields: [configuredAttachment(6), configuredAttachment(7)],
  };
  const { harness, state, projections } = await setup({
    bindings,
    selected: { address: "D13" },
  });
  await click(harness);
  expect(harness.statusElement.textContent).toContain(
    "ไฟล์แนบ 6 (attachment_6)"
  );
  expect(harness.statusElement.textContent).toContain(
    "ไฟล์แนบ 7 (attachment_7)"
  );
  expect(harness.statusElement.textContent).toContain("ผูกตำแหน่งใหม่กับช่วงที่เลือก");
  expect(
    descendants(harness.body).some(
      (node) =>
        node.textContent.includes("attachment_6") &&
        node.textContent.includes("attachment_7")
    )
  ).toBe(true);
  expect(projections).toHaveLength(0);
  expect(harness.requests.map((request) => request.method)).toEqual(["GET"]);
  expect([...harness.spreadsheetNames.keys()]).toHaveLength(0);
  expect(state()).toEqual(bindings);
  // Explicit native repair restores trustworthy locations; unrelated placement can proceed.
  harness.spreadsheetNames.set("folio_attachment_6", "'Sheet1'!$D$15");
  harness.spreadsheetNames.set("folio_attachment_7", "'Sheet1'!$F$15");
  await click(harness);
  expect(projections).toHaveLength(1);
  expect(state().fields).toHaveLength(3);
});

test("fresh metadata removes a stale orphan before authorizing original blank-cell placement", async () => {
  const bindings = { ...empty(), fields: [configuredAttachment(6)] };
  const { harness, state, projections } = await setup({
    bindings,
    liveBindings: empty(),
    selected: { address: "D13" },
  });
  await click(harness);
  expect(projections).toHaveLength(1);
  expect(state().fields).toHaveLength(1);
  expect(harness.spreadsheetNames.get(state().fields[0].anchor)).toContain(
    "D13"
  );
});

test("selection reads complete current anchors even if shared command scope was stale", async () => {
  const bindings = { ...empty(), fields: [configuredAttachment(1)] };
  const { harness, state, projections } = await setup({
    bindings,
    selected: {
      address: "D13",
      names: { folio_attachment_1: "'Sheet1'!$B$3" },
    },
  });
  harness.window.Asc.scope.folioSpreadsheetAnchors = [];
  await click(harness);
  expect(projections).toHaveLength(1);
  expect(state().fields).toHaveLength(2);
  expect(harness.spreadsheetNames.get("folio_attachment_1")).toBe(
    "'Sheet1'!$B$3"
  );
});

test("placement saves only after the binding commit and native unlock, and failed save retries reuse the button", async () => {
  const { harness, state, projectionLocks } = await setup({
    saveFailures: 1,
  });
  await click(harness);
  const [field] = state().fields;
  expect(projectionLocks).toEqual(["none"]);
  expect(harness.requests.at(-1).url).toEndWith("/save");
  expect(
    JSON.parse(harness.requests.at(-1).body).spreadsheetAnchors
  ).toContainEqual([field.anchor, harness.spreadsheetNames.get(field.anchor)]);
  expect(harness.statusElement.dataset.state).not.toBe("success");
  await click(harness);
  expect(state().fields).toHaveLength(1);
  expect(state().fields[0].id).toBe(field.id);
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(1);
  expect(
    harness.requests.filter((request) => request.method === "POST")
  ).toHaveLength(2);
});

test("pending File denial happens before binding or native placement mutation", async () => {
  const { harness, state, projections } = await setup();
  harness.window.FormBridge.getRuntimeOptions().scopeIdentity = "admin:test";
  const original = harness.parentWindow.postMessage;
  harness.parentWindow.postMessage = (message, origin) => {
    if (message.type !== "pending-file-check") {
      return original(message, origin);
    }
    queueMicrotask(() =>
      harness.dispatch({
        data: {
          ...message,
          allowed: false,
          error: "pending file prevents save",
          source: "folio-upload-poc-host",
          type: "pending-file-result",
        },
        origin: harness.parentOrigin,
        source: harness.parentWindow,
      })
    );
  };
  await click(harness);
  expect(harness.requests).toHaveLength(0);
  expect(state().fields).toHaveLength(0);
  expect(projections).toHaveLength(0);
  expect([...harness.spreadsheetNames.keys()]).toHaveLength(0);
  expect(harness.statusElement.textContent).toContain(
    "pending file prevents save"
  );
});

test("visiting untouched blank cells does not restore stale generated defaults as dirty drafts after metadata changes", async () => {
  const old = { ...configuredAttachment(1), key: "field_1" };
  const selected = { address: "B3", names: { [old.anchor]: "'Sheet1'!$A$1" } };
  const { harness, projections } = await setup({
    bindings: { ...empty(), fields: [old] },
    liveBindings: empty(),
    selected,
  });
  selected.address = "D4";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  await harness.window.FormBridge.getSpreadsheetBindings();
  selected.address = "B3";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  selected.address = "F5";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  selected.address = "B3";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  expect(input(harness, "Tag · รหัสช่อง").value).toBe("field_1");
  await click(harness);
  expect(projections).toHaveLength(1);
});

test("sequential placements keep the document key and save each new native button in the existing editor session", async () => {
  const selected = { address: "B3" };
  const { harness, state, projections } = await setup({ selected });
  await click(harness);
  selected.address = "D3";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  await click(harness);
  expect(state().fields.map((item) => item.key)).toEqual([
    "attachment_1",
    "attachment_2",
  ]);
  expect(projections).toHaveLength(2);
  const saves = harness.requests.filter((request) => request.method === "POST");
  expect(saves).toHaveLength(2);
  for (const [index, request] of saves.entries()) {
    expect(JSON.parse(request.body)).toMatchObject({
      documentKey: "document-key",
      preserveEditorSession: true,
      uploadPocBindingId: state().fields[index].id,
    });
  }
  expect(harness.window.FormBridge.getRuntimeOptions().documentKey).toBe(
    "document-key"
  );
  const completions = harness.messages.filter(
    ({ message }) =>
      message.type === "operation" && message.status === "completed"
  );
  expect(completions).toHaveLength(2);
  expect(completions[1].message.operation.result).toMatchObject({
    documentKey: "document-key",
    editorSessionPreserved: true,
  });
  expect(
    harness.messages.findLast(({ message }) => message.type === "dirty-state")
      .message.dirty
  ).toBe(false);
});

test.each([
  { documentKey: "other-document", editorSessionPreserved: true },
  { documentKey: "document-key", editorSessionPreserved: false },
  {},
])(
  "placement fails closed without a terminal preserved-session acknowledgement for the current document",
  async (saveResult) => {
    const { harness, state } = await setup({ saveResult });
    await click(harness);
    expect(state().fields).toHaveLength(1);
    expect(harness.statusElement.textContent).toContain(
      "ยังยืนยันการบันทึกต้นแบบในตัวแก้ไขเดิมไม่ได้"
    );
    expect(
      harness.messages.filter(
        ({ message }) =>
          message.type === "operation" && message.status === "completed"
      )
    ).toHaveLength(0);
    expect(
      harness.messages.findLast(({ message }) => message.type === "dirty-state")
        .message.dirty
    ).toBe(true);
    await click(harness);
    expect(state().fields).toHaveLength(1);
    expect(
      harness.requests.filter((request) => request.method === "PATCH")
    ).toHaveLength(1);
  }
);

test("manual template save preserves the editor with a fresh checkpoint instead of placement target proof", async () => {
  const { harness } = await setup();
  const result = await harness.window.FormBridge.runAction("save-template");
  expect(result.ok).toBe(true);
  expect(result.result).toMatchObject({
    documentKey: "document-key",
    editorSessionPreserved: true,
  });
  expect(result.completion.operation.status).toBe("completed");
  const save = harness.requests.find((request) => request.method === "POST");
  expect(JSON.parse(save.body)).toMatchObject({
    preserveEditorSession: true,
    preserveEditorSessionPurpose: "manual",
    spreadsheetSaveCheckpoint: expect.any(String),
    spreadsheetUploadPocSnapshot: [],
  });
  expect(JSON.parse(save.body)).not.toHaveProperty("uploadPocBindingId");
});

test("preserving request context cannot be reused for publication", async () => {
  const { harness } = await setup();
  const result = await harness.window.FormBridge.runAction(
    "publish",
    "",
    null,
    { preserveEditorSession: true }
  );
  expect(result.ok).toBe(false);
  expect(harness.requests).toHaveLength(0);
});

test.each([
  undefined,
  null,
  17,
  "",
  "attachment_1",
  "folio_bad-name",
  "folio_",
  { id: "folio_valid" },
])(
  "preserved save rejects missing or malformed target binding identity before native save or request",
  async (uploadPocBindingId) => {
    const { harness } = await setup();
    const methodCount = harness.methodInvocations.length;
    const result = await harness.window.FormBridge.runAction(
      "save-template",
      "",
      null,
      { preserveEditorSession: true, uploadPocBindingId }
    );
    expect(result.ok).toBe(false);
    expect(harness.requests).toHaveLength(0);
    expect(
      harness.methodInvocations
        .slice(methodCount)
        .some((call) => call.method === "SetEditingRestrictions")
    ).toBe(false);
  }
);

test.each([0, 1])(
  "preserved placement restores editable panel controls after success or failure and retry: failures %s",
  async (saveFailures) => {
    const selected = { address: "B3" };
    const { harness } = await setup({ saveFailures, selected });
    for (const label of [
      "Title · ชื่อช่อง",
      "Tag · รหัสช่อง",
      "ชนิดข้อมูล",
      "ช่องที่บันทึกแล้ว",
    ]) {
      expect(input(harness, label).disabled).toBe(false);
    }
    await click(harness);
    for (const label of ["Title · ชื่อช่อง", "Tag · รหัสช่อง", "ช่องที่บันทึกแล้ว"]) {
      expect(input(harness, label).disabled).toBe(false);
    }
    // Existing binding kind cannot change; restoring controls must preserve that rule.
    expect(input(harness, "กำหนดช่วงที่เลือกเป็น").disabled).toBe(true);
    await click(harness);
    for (const label of ["Title · ชื่อช่อง", "Tag · รหัสช่อง", "ช่องที่บันทึกแล้ว"]) {
      expect(input(harness, label).disabled).toBe(false);
    }
    expect(input(harness, "กำหนดช่วงที่เลือกเป็น").disabled).toBe(true);
    selected.address = "D3";
    harness.emitEditorEvent("onTargetPositionChanged");
    await flushPlugin();
    expect(input(harness, "กำหนดช่วงที่เลือกเป็น").disabled).toBe(false);
    expect(input(harness, "Title · ชื่อช่อง").disabled).toBe(false);
    const caption = input(harness, "Title · ชื่อช่อง");
    caption.value = "Actual pending panel edit";
    caption.dispatchEvent({ type: "input" });
    const before = harness.requests.length;
    await click(harness);
    expect(harness.requests).toHaveLength(before);
    expect(caption.value).toBe("Actual pending panel edit");
    expect(harness.statusElement.textContent).toContain("ยังไม่ได้บันทึก");
  }
);

test("cancelling during category loading ignores the late result and reopening fetches fresh choices", async () => {
  const pending = Promise.withResolvers();
  let loads = 0;
  const { harness, state, projections } = await setup({
    categories: () => {
      loads += 1;
      return loads === 1 ? pending.promise : { categories: ["หมวดใหม่"] };
    },
  });
  action(harness).click();
  await flushPlugin();
  expect(input(harness.categoryPopup, "หมวดหมู่จัดเก็บเอกสาร").disabled).toBe(true);
  const dialog = harness.categoryPopup.body.children.find(
    (node) => node.tagName === "MAIN"
  );
  harness.categoryPopup.emitWindowEvent("keydown", {
    key: "Escape",
    preventDefault() {},
  });
  await flushPlugin();
  pending.resolve({ categories: ["ผลเก่าที่มาช้า"] });
  await flushPlugin();
  expect(state()).toEqual(empty());
  expect(projections).toEqual([]);
  expect(dialog.hidden).toBe(true);
  await click(harness, "หมวดใหม่");
  expect(loads).toBe(2);
  expect(state().fields[0].attachment).toEqual({ category: "หมวดใหม่" });
});

test.each([
  { categories: [] },
  { body: { error: "ecm_unavailable" }, httpStatus: 503 },
])(
  "empty or failed category loading blocks creation until a successful explicit retry: %j",
  async (first) => {
    let available = false;
    const { harness, state, projections } = await setup({
      categories: () => (available ? { categories: ["หลักฐาน"] } : first),
    });
    action(harness).click();
    await flushPlugin();
    const confirm = descendants(harness.categoryPopup.body).find(
      (node) => node.tagName === "BUTTON" && node.textContent === "ยืนยันและบันทึก"
    );
    confirm.click();
    await flushPlugin();
    expect(state()).toEqual(empty());
    expect(projections).toEqual([]);
    expect(confirm.disabled).toBe(true);
    available = true;
    descendants(harness.categoryPopup.body)
      .find(
        (node) => node.tagName === "BUTTON" && node.textContent === "ลองใหม่"
      )
      .click();
    await flushPlugin();
    await confirmCategory(harness);
    expect(state().fields[0].attachment).toEqual({ category: "หลักฐาน" });
  }
);

test("Escape cancels after retry moves focus outside the popup content", async () => {
  let available = false;
  const { harness, state, projections } = await setup({
    categories: () =>
      available
        ? { categories: ["หลักฐาน"] }
        : { body: { error: "ecm_unavailable" }, httpStatus: 503 },
  });
  action(harness).click();
  await flushPlugin();
  const popup = harness.categoryPopup;
  const dialog = popup.body.children.find((node) => node.tagName === "MAIN");
  available = true;
  descendants(dialog)
    .find((node) => node.textContent === "ลองใหม่")
    .click();
  await flushPlugin();
  // The browser focuses BODY when the focused Retry button disappears.
  popup.body.focus();
  popup.emitWindowEvent("keydown", {
    key: "Escape",
    preventDefault() {},
    target: popup.body,
  });
  await flushPlugin();
  expect(dialog.hidden).toBe(true);
  expect(state()).toEqual(empty());
  expect(projections).toEqual([]);
  expect(action(harness).disabled).toBe(false);
});

test("changing a saved category and later editing Title and Tag keep one attachment without creating another native button", async () => {
  let category = "หมวดเดิม";
  const { harness, state, projections } = await setup({
    categories: () => ({ categories: [category] }),
  });
  await click(harness, category);
  const original = structuredClone(state().fields[0]);
  category = "หมวดใหม่";
  descendants(harness.body)
    .find(
      (node) => node.tagName === "BUTTON" && node.textContent === "เปลี่ยนหมวด"
    )
    .click();
  await flushPlugin();
  await confirmCategory(harness, category);
  expect(state().fields).toEqual([
    { ...original, attachment: { category: "หมวดใหม่" } },
  ]);
  expect(projections).toHaveLength(1);
  input(harness, "Title · ชื่อช่อง").value = "เอกสารยืนยัน";
  input(harness, "Tag · รหัสช่อง").value = "confirmation";
  descendants(harness.body)
    .find(
      (node) => node.tagName === "BUTTON" && node.textContent === "บันทึกการแก้ไข"
    )
    .click();
  await flushPlugin();
  expect(state().fields).toEqual([
    {
      ...original,
      attachment: { category: "หมวดใหม่" },
      key: "confirmation",
      label: "เอกสารยืนยัน",
    },
  ]);
});

test("an existing scalar is converted only after its button is saved and a failed proof save preserves its original rules", async () => {
  const original = {
    ...configuredAttachment(1),
    attachment: undefined,
    required: true,
  };
  delete original.attachment;
  const { harness, state } = await setup({
    bindings: { ...empty(), fields: [original] },
    saveFailures: 1,
    selected: { address: "B3", names: { [original.anchor]: "'Sheet1'!$B$3" } },
  });
  await click(harness);
  expect(state().fields).toEqual([original]);
  expect(harness.statusElement.dataset.state).not.toBe("success");
  await click(harness);
  expect(state().fields).toMatchObject([
    {
      ...original,
      attachment: { category: "หลักฐาน" },
    },
  ]);
  const conversion = harness.requests.findIndex(
    (request) => request.method === "PATCH"
  );
  expect(conversion).toBeGreaterThan(
    harness.requests.findIndex((request) => request.method === "POST")
  );
});

test("a mapped cell moved while its category dialog is open cannot convert or create a different field", async () => {
  const original = configuredAttachment(1);
  const { harness, state, projections } = await setup({
    bindings: { ...empty(), fields: [original] },
    selected: { address: "B3", names: { [original.anchor]: "'Sheet1'!$B$3" } },
  });
  action(harness).click();
  await flushPlugin();
  harness.spreadsheetNames.set(original.anchor, "'Sheet1'!$D$3");
  await confirmCategory(harness);
  expect(state().fields).toEqual([original]);
  expect(projections).toEqual([]);
  expect(
    harness.requests.filter((request) => request.method !== "GET")
  ).toEqual([]);
  expect(harness.spreadsheetNames.get(original.anchor)).toBe("'Sheet1'!$D$3");
});

test("automatic conversion keeps authoring locked between its proof save and category commit", async () => {
  const original = { ...configuredAttachment(1) };
  delete original.attachment;
  const conversionGate = Promise.withResolvers();
  const { harness, state, projections } = await setup({
    bindings: { ...empty(), fields: [original] },
    conversionGate,
    selected: { address: "B3", names: { [original.anchor]: "'Sheet1'!$B$3" } },
  });
  await click(harness);
  expect(state().fields).toEqual([original]);
  const stayedLocked =
    action(harness).disabled && input(harness, "Title · ชื่อช่อง").disabled;
  const pendingChoiceRetained = harness.messages.findLast(
    ({ message }) => message.type === "dirty-state"
  )?.message.dirty;
  conversionGate.resolve();
  await flushPlugin();
  await flushPlugin();
  expect(stayedLocked).toBe(true);
  expect(pendingChoiceRetained).toBe(true);
  expect(state().fields[0].attachment).toEqual({ category: "หลักฐาน" });
  expect(projections).toHaveLength(1);
  expect(action(harness).disabled).toBe(false);
});

test("category chooser rejects forged, stale and unlisted choices without changing the workbook", async () => {
  const { harness, state, projections } = await setup();
  action(harness).click();
  await flushPlugin();
  const opening = harness.messages.findLast(
    ({ message }) => message.type === "attachment-category-popup-state"
  ).message;
  const choose = {
    ...opening,
    category: "หลักฐาน",
    source: "folio-attachment-category-popup-host",
    type: "choose",
  };
  for (const event of [
    {
      data: choose,
      origin: "https://forged.example",
      source: harness.parentWindow,
    },
    { data: choose, origin: harness.parentOrigin, source: {} },
    ...[
      { requestId: "stale-request" },
      { bridgeId: "wrong-bridge" },
      { channelId: "wrong-channel" },
      { documentKey: "wrong-document" },
      { category: "not-in-current-list" },
    ].map((change) => ({
      data: { ...choose, ...change },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    })),
  ]) {
    harness.dispatch(event);
  }
  await flushPlugin();
  expect(state()).toEqual(empty());
  expect(projections).toEqual([]);
  descendants(harness.categoryPopup.body)
    .find((node) => node.textContent === "ยกเลิก")
    .click();
  await flushPlugin();
  action(harness).click();
  await flushPlugin();
  harness.dispatch({
    data: choose,
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  await flushPlugin();
  expect(state()).toEqual(empty());
  await confirmCategory(harness);
  expect(state().fields[0].attachment).toEqual({ category: "หลักฐาน" });
  expect(harness.categoryPopup.requests).toEqual([]);
});

test("missing background show handshake fails cleanly and releases authoring", async () => {
  const { harness, state, projections } = await setup({ categoryPopup: false });
  action(harness).click();
  await flushPlugin();
  harness.expireCapabilityRequests();
  await flushPlugin();
  expect(state()).toEqual(empty());
  expect(projections).toEqual([]);
  expect(action(harness).disabled).toBe(false);
  expect(harness.statusElement.textContent).toContain("เปิดตัวแก้ไขใหม่");
  expect(
    harness.messages.findLast(
      ({ message }) => message.type === "attachment-category-popup-close"
    )
  ).toBeDefined();
});

test("a retry discards an older category response and a shown chooser has no human-choice deadline", async () => {
  const pending = Promise.withResolvers();
  let loads = 0;
  const { harness, state } = await setup({
    categories: () => {
      loads += 1;
      return loads === 1 ? pending.promise : { categories: ["รายการล่าสุด"] };
    },
  });
  action(harness).click();
  await flushPlugin();
  const opening = harness.messages.findLast(
    ({ message }) => message.type === "attachment-category-popup-state"
  ).message;
  harness.dispatch({
    data: {
      ...opening,
      source: "folio-attachment-category-popup-host",
      type: "retry",
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  await flushPlugin();
  pending.resolve({ categories: ["รายการเก่า"] });
  await flushPlugin();
  const select = descendants(harness.categoryPopup.body).find(
    (node) => node.tagName === "SELECT"
  );
  expect(select.children.map((option) => option.value)).toEqual([
    "",
    "รายการล่าสุด",
  ]);
  harness.expireCapabilityRequests();
  await flushPlugin();
  expect(action(harness).disabled).toBe(true);
  await confirmCategory(harness, "รายการล่าสุด");
  expect(state().fields[0].attachment.category).toBe("รายการล่าสุด");
});

test("unloading the primary cancels its category request and ignores late results", async () => {
  const pending = Promise.withResolvers();
  const { harness, state, projections } = await setup({
    categories: () => pending.promise,
  });
  action(harness).click();
  await flushPlugin();
  harness.emitWindowEvent("beforeunload");
  pending.resolve({ categories: ["หลักฐาน"] });
  await flushPlugin();
  expect(state()).toEqual(empty());
  expect(projections).toEqual([]);
  expect(
    harness.categoryPopup.body.children.find((node) => node.tagName === "MAIN")
      .hidden
  ).toBe(true);
});

test("an old editor without category scope asks to reopen instead of showing a sidebar fallback", async () => {
  const { harness, state, projections } = await setup({
    categoryChannel: null,
    categoryPopup: false,
  });
  action(harness).click();
  await flushPlugin();
  expect(state()).toEqual(empty());
  expect(projections).toEqual([]);
  expect(action(harness).disabled).toBe(false);
  expect(harness.statusElement.textContent).toContain("เปิดตัวแก้ไขใหม่");
  expect(
    descendants(harness.body).some((node) => node.tagName === "DIALOG")
  ).toBe(false);
});

test("background category UI rejects forged host state and stale close messages", async () => {
  const { harness, state } = await setup();
  action(harness).click();
  await flushPlugin();
  const popup = harness.categoryPopup;
  const opening = harness.messages.findLast(
    ({ message }) => message.type === "attachment-category-popup-state"
  ).message;
  const { instanceId } = popup.messages.find(
    ({ message }) => message.type === "ready"
  ).message;
  const forged = {
    ...opening,
    instanceId,
    source: "folio-attachment-category-popup-host",
    state: { ...opening.state, categories: ["forged-name"] },
    type: "state",
  };
  for (const event of [
    {
      data: forged,
      origin: "https://forged.example",
      source: popup.parentWindow,
    },
    { data: forged, origin: popup.parentOrigin, source: {} },
    ...[
      { bridgeId: "wrong-bridge" },
      { channelId: "wrong-channel" },
      { documentKey: "wrong-document" },
      { instanceId: "wrong-instance" },
    ].map((change) => ({
      data: { ...forged, ...change },
      origin: popup.parentOrigin,
      source: popup.parentWindow,
    })),
    {
      data: { ...forged, requestId: "stale-request", type: "close" },
      origin: popup.parentOrigin,
      source: popup.parentWindow,
    },
  ]) {
    popup.dispatch(event);
  }
  const select = descendants(popup.body).find(
    (node) => node.tagName === "SELECT"
  );
  expect(select.children.map((option) => option.value)).toEqual(["", "หลักฐาน"]);
  expect(
    popup.body.children.find((node) => node.tagName === "MAIN").hidden
  ).toBe(false);
  expect(state()).toEqual(empty());
  await confirmCategory(harness);
  expect(state().fields[0].attachment.category).toBe("หลักฐาน");
});
