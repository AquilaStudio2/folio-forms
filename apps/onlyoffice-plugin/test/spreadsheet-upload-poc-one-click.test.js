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
const saves = (harness) =>
  harness.requests.filter(({ url }) => url.endsWith("/save"));
const working = async (harness) => {
  const { bindings } =
    await harness.window.FormBridge.getSpreadsheetBindings(false);
  return bindings;
};
const button = (harness, text) =>
  descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === text
  );
const choice = (name) => ({
  category: null,
  document_category_id: 1,
  mode: "template",
  storage_template_id: `template-${name}`,
  template_name: name,
});
const catalog = (names) => ({
  categories: [{ id: 1, type: "หลักฐาน" }],
  templates: names.map((name) => ({
    document_category_id: 1,
    id: `template-${name}`,
    template_name: name,
  })),
});

const setup = async ({
  bindings = empty(),
  selected = { address: "B3" },
  saveError,
  checkpointRejected = false,
  bindingRejected = false,
  saveResult = { documentKey: "document-key", editorSessionPreserved: true },
  gate,
  categories = ["หลักฐาน"],
  pendingFiles = { allowed: true },
  completionGate,
  categoryPopup = true,
  categoryChannel = "category-channel",
} = {}) => {
  let state = structuredClone(bindings);
  let revision = 0;
  let candidate;
  const response = async (url, init) => {
    if (String(url).endsWith("/attachment-categories")) {
      await gate?.promise;
      return typeof categories === "function"
        ? categories()
        : catalog(categories);
    }
    if (String(url).includes("/operations/")) {
      await completionGate?.promise;
      state = candidate;
      revision += 1;
      return {
        operation: {
          result: { bindingRevision: revision, bindings: state, ...saveResult },
          status: "completed",
        },
      };
    }
    if (String(url).endsWith("/save") && init.method === "POST") {
      if (saveError) {
        return saveError;
      }
      candidate = JSON.parse(init.body).xlsxDraft.bindings;
      return {
        operationCapability: "operation-capability",
        operationId: `poc-save-operation-${revision + 1}`,
      };
    }
    if (String(url).endsWith("/xlsx-draft/recover") && init.method === "POST") {
      return { status: "not-admitted" };
    }
    throw new Error(`Unexpected request: ${init.method} ${url}`);
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
    scopeIdentity: "one-click-authoring",
    serializeCommands: true,
    spreadsheetBindings: bindings,
    spreadsheetSelection: selected,
  });
  const post = harness.parentWindow.postMessage;
  harness.parentWindow.postMessage = (message, origin) => {
    post(message, origin);
    if (message.type === "pending-file-check") {
      queueMicrotask(() =>
        harness.dispatch({
          data: {
            ...message,
            ...pendingFiles,
            source: "folio-upload-poc-host",
            type: "pending-file-result",
          },
          origin: harness.parentOrigin,
          source: harness.parentWindow,
        })
      );
    }
  };
  if (categoryPopup) {
    attachCategoryPopup(harness);
  }
  const projections = [];
  const projectionLocks = [];
  const original = harness.window.Asc.plugin.callCommand;
  harness.window.Asc.plugin.callCommand = (...args) => {
    if (bindingRejected && args[0]?.name === "spreadsheetValidationCommand") {
      args.at(-1)(false);
      return;
    }
    if (
      checkpointRejected &&
      args[0]?.name === "spreadsheetEditorSaveCheckpointCommand"
    ) {
      args.at(-1)(false);
      return;
    }
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
    return original(...args);
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
  select.value = "1";
  select.dispatchEvent({ type: "change" });
  const [, template] = descendants(dialog).filter(
    (node) => node.tagName === "SELECT"
  );
  template.value = `template-${category}`;
  template.dispatchEvent({ type: "change" });
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
    attachment: choice("หลักฐาน"),
    key: "attachment_1",
    label: "ไฟล์แนบ 1",
    required: false,
    type: "text",
  });
  expect(saves(harness)).toHaveLength(1);
  const [firstSave] = saves(harness);
  expect(JSON.parse(firstSave.body)).toMatchObject({
    spreadsheetUploadPocSnapshot: [
      { bindingId: field.id, rowIndex: null, tag: "attachment_1" },
    ],
    xlsxDraft: { bindings: { fields: [field] }, revision: 0, version: 1 },
  });
  expect(harness.spreadsheetNames.get(field.anchor)).toContain("B3");
  expect(input(harness, "Title · ชื่อช่อง").value).toBe(field.label);
  expect(input(harness, "Tag · รหัสช่อง").value).toBe(field.key);
  await click(harness);
  expect(state().fields).toHaveLength(1);
  expect(harness.requests.some(({ method }) => method === "PATCH")).toBe(false);
  expect(saves(harness)).toHaveLength(2);
  expect(harness.spreadsheetNames.get(field.anchor)).toContain("B3");
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
  const { harness, projections, state } = await setup({
    bindingRejected: true,
  });
  await click(harness);
  expect(state().fields).toHaveLength(0);
  expect(projections).toHaveLength(0);
  expect([...harness.spreadsheetNames.keys()]).toHaveLength(0);
  expect(saves(harness)).toHaveLength(0);
  expect(harness.statusElement.textContent).toContain("ตั้งค่าช่องแนบไฟล์ไม่ได้");
});

test("creating a table around an existing attachment makes it a table-column button", async () => {
  const selected = {
    address: "C2",
    oleObjects: [],
    values: { "A1:C1": [["1", "2", "btn"]] },
  };
  const { harness, projections, state } = await setup({ selected });
  await click(harness);
  expect(harness.statusElement.textContent).toContain(
    "เพิ่มช่องแนบไฟล์และบันทึกต้นแบบแล้ว"
  );
  const [attachment] = state().fields;
  expect(attachment?.attachment).toEqual(choice("หลักฐาน"));

  selected.address = "A1:C6";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  const kind = input(harness, "กำหนดช่วงที่เลือกเป็น");
  kind.value = "table";
  kind.dispatchEvent({ type: "change" });
  const headers = input(harness, "ใช้แถวแรกเป็นชื่อคอลัมน์");
  headers.checked = true;
  headers.dispatchEvent({ type: "change" });
  button(harness, "เพิ่มช่องจากช่วงที่เลือก").click();
  await flushPlugin();

  expect(harness.statusElement.textContent).not.toContain("ไม่พบตำแหน่งตาราง");
  expect(state().fields).toEqual([]);
  expect(state().table?.columns[2]).toMatchObject({
    attachment: attachment.attachment,
    id: attachment.id,
    key: attachment.key,
  });
  expect(projections.at(-1)?.[0]).toMatchObject({
    bindingId: attachment.id,
    bodyAnchor: state().table.anchor,
    columnOffset: 2,
    kind: "column",
  });
  expect(harness.spreadsheetNames.get(state().table.anchor)).toBe(
    "'Sheet1'!A2:C6"
  );
  expect(harness.spreadsheetNames.has(attachment.anchor)).toBe(false);
  expect(
    harness.spreadsheetNames.get(`_folio_upload_poc_${attachment.id}`)
  ).toBe("'Sheet1'!$C$2:$C$6");
  expect(
    selected.oleObjects.map((object) => object.Drawing.drawingBase.from)
  ).toEqual([
    { col: 2, row: 1 },
    { col: 2, row: 2 },
    { col: 2, row: 3 },
    { col: 2, row: 4 },
    { col: 2, row: 5 },
  ]);
  expect(
    selected.oleObjects.map((object) => JSON.parse(object.GetData()).rowIndex)
  ).toEqual([0, 1, 2, 3, 4]);
  expect(harness.statusElement.textContent).toContain(
    "บันทึกตารางและปุ่มแนบไฟล์ทุกแถวแล้ว"
  );
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
      attachment: choice("หลักฐาน"),
      placeholder: null,
    },
  ]);
  expect(saves(harness)).toHaveLength(2);
  for (const [revision, request] of saves(harness).entries()) {
    expect(JSON.parse(request.body)).toMatchObject({
      preserveEditorSession: true,
      preserveEditorSessionPurpose: "manual",
      spreadsheetSaveCheckpoint: expect.any(String),
      spreadsheetUploadPocSnapshot: [0, 1, 2].map((rowIndex) => ({
        bindingId: "folio_proof",
        rowIndex,
        tag: "items.proof",
      })),
      xlsxDraft: {
        bindings: {
          ...bindings,
          table: {
            ...bindings.table,
            columns: [
              {
                ...bindings.table.columns[0],
                ...(revision ? { attachment: choice("หลักฐาน") } : {}),
              },
            ],
          },
        },
        revision,
        version: 1,
      },
    });
  }
  expect(projections[0][0]).toMatchObject({
    bindingId: "folio_proof",
    bodyAnchor: "items",
    columnOffset: 1,
    tag: "items.proof",
  });
});

test("selection changing while the category catalog loads keeps the originally clicked cell", async () => {
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

test("existing scalar conversion commits ordinary Rules and native proof before attachment Rules", async () => {
  const original = configuredAttachment(1);
  const { harness } = await setup({
    bindings: { ...empty(), fields: [original] },
    selected: {
      address: "B3",
      names: { [original.anchor]: "'Sheet1'!$B$3" },
      oleObjects: [],
    },
  });
  await click(harness);
  expect(saves(harness)).toHaveLength(2);
  const [proof, conversion] = saves(harness).map(({ body }) =>
    JSON.parse(body)
  );
  for (const [revision, body] of [proof, conversion].entries()) {
    expect(body).toMatchObject({
      preserveEditorSession: true,
      preserveEditorSessionPurpose: "manual",
      spreadsheetSaveCheckpoint: expect.any(String),
      spreadsheetUploadPocSnapshot: [
        { bindingId: original.id, rowIndex: null, tag: original.key },
      ],
      xlsxDraft: { checkpoint: expect.any(String), revision, version: 1 },
    });
    expect(body.spreadsheetAnchors).toContainEqual([
      original.anchor,
      "'Sheet1'!$B$3",
    ]);
  }
  expect(proof.xlsxDraft.bindings).toEqual({ ...empty(), fields: [original] });
  expect(conversion.xlsxDraft.bindings).toMatchObject({
    ...empty(),
    fields: [{ ...original, attachment: choice("หลักฐาน") }],
  });
  expect(conversion.xlsxDraft.checkpoint).not.toBe(proof.xlsxDraft.checkpoint);
  expect(conversion.spreadsheetSaveCheckpoint).not.toBe(
    proof.spreadsheetSaveCheckpoint
  );
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
  expect(harness.requests).toEqual([]);
  expect([...harness.spreadsheetNames.keys()]).toHaveLength(0);
  expect(state()).toEqual(bindings);
  // Explicit native repair restores trustworthy locations; unrelated placement can proceed.
  harness.spreadsheetNames.set("folio_attachment_6", "'Sheet1'!$D$15");
  harness.spreadsheetNames.set("folio_attachment_7", "'Sheet1'!$F$15");
  await click(harness);
  expect(projections).toHaveLength(1);
  expect(state().fields).toHaveLength(3);
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

test("a failed native checkpoint sends no Save and preserves the original Rules", async () => {
  const original = configuredAttachment(1);
  const { harness, state } = await setup({
    bindings: { ...empty(), fields: [original] },
    checkpointRejected: true,
    selected: { address: "B3", names: { [original.anchor]: "'Sheet1'!$B$3" } },
  });
  await click(harness);
  expect(saves(harness)).toEqual([]);
  expect(harness.requests.map(({ method }) => method)).toEqual(["GET"]);
  expect(state().fields).toEqual([original]);
  expect(harness.statusElement.textContent).toContain(
    "สร้างรหัสยืนยันการบันทึกต้นแบบไม่ได้"
  );
  expect(harness.statusElement.dataset.state).not.toBe("success");
});

test("an unknown placement outcome locks the editor and verifies the original checkpoint without replay", async () => {
  const { harness, state, projectionLocks } = await setup({
    saveError: { body: { error: "save unavailable" }, httpStatus: 503 },
  });
  await click(harness);
  expect(state()).toEqual(empty());
  expect(projectionLocks).toEqual(["none"]);
  const [save] = saves(harness);
  const body = JSON.parse(save.body);
  const [field] = body.xlsxDraft.bindings.fields;
  expect(body.spreadsheetAnchors).toContainEqual([
    field.anchor,
    harness.spreadsheetNames.get(field.anchor),
  ]);
  expect(body.spreadsheetUploadPocSnapshot).toEqual([
    { bindingId: field.id, rowIndex: null, tag: "attachment_1" },
  ]);
  expect(harness.editorRestriction).toBe("readOnly");
  expect(harness.statusElement.textContent).toContain("ห้ามส่งซ้ำ");
  const result = await harness.window.FormBridge.runAction("save-template");
  expect(result).toMatchObject({
    error: expect.stringContaining("เปิดต้นแบบใหม่"),
    ok: false,
  });
  expect(saves(harness)).toHaveLength(1);
  const recover = harness.requests.find(({ url }) =>
    url.endsWith("/xlsx-draft/recover")
  );
  expect(JSON.parse(recover.body)).toEqual({
    checkpoint: body.xlsxDraft.checkpoint,
    leaseId: "test-editor-lease",
  });
  expect(harness.editorRestriction).toBe("readOnly");
  expect(state()).toEqual(empty());
});

test("pending File denial happens before binding or native placement mutation", async () => {
  const { harness, state, projections } = await setup({
    pendingFiles: { allowed: false, error: "pending file prevents save" },
  });
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
    selected,
  });
  selected.address = "D4";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  selected.address = "A1";
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  button(harness, "ลบช่องนี้").click();
  await flushPlugin();
  const { fields } = await working(harness);
  expect(fields).toEqual([]);
  expect(saves(harness)).toHaveLength(1);
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
  expect(saves(harness)).toHaveLength(2);
  for (const [index, request] of saves(harness).entries()) {
    expect(JSON.parse(request.body)).toMatchObject({
      documentKey: "document-key",
      preserveEditorSession: true,
      preserveEditorSessionPurpose: "manual",
      spreadsheetUploadPocSnapshot: state()
        .fields.slice(0, index + 1)
        .map(({ id, key }) => ({ bindingId: id, rowIndex: null, tag: key })),
      xlsxDraft: { revision: index, version: 1 },
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
  {
    bindingRevision: undefined,
    documentKey: "document-key",
    editorSessionPreserved: true,
  },
  {
    bindings: undefined,
    documentKey: "document-key",
    editorSessionPreserved: true,
  },
  { documentKey: "document-key" },
  { editorSessionPreserved: true },
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
    expect(harness.window.FormBridge.getRuntimeOptions().documentKey).toBe(
      "document-key"
    );
    expect(saves(harness)).toHaveLength(1);
    const [save] = saves(harness);
    expect(harness.editorRestriction).toBe("readOnly");
    const stored = harness.window.sessionStorage.getItem(
      "folio-xlsx-draft:one-click-authoring"
    );
    expect(JSON.parse(stored)).toEqual({
      action: "save-template",
      checkpoint: JSON.parse(save.body).xlsxDraft.checkpoint,
      leaseId: "test-editor-lease",
      preservedDocumentKey: "document-key",
      revision: JSON.parse(save.body).xlsxDraft.revision,
    });
    expect(
      harness.messages.findLast(({ message }) => message.type === "operation")
        .message
    ).toMatchObject({
      attachmentCommitUnresolved: true,
      status: "failed",
    });
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

test("preserved placement restores editable controls after successful Save", async () => {
  const selected = { address: "B3" };
  const { harness } = await setup({ selected });
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
});

test("cancelling during category loading ignores the late result and reopening fetches fresh choices", async () => {
  const pending = Promise.withResolvers();
  let loads = 0;
  const { harness, state, projections } = await setup({
    categories: () => {
      loads += 1;
      return loads === 1 ? pending.promise : catalog(["หมวดใหม่"]);
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
  pending.resolve(catalog(["ผลเก่าที่มาช้า"]));
  await flushPlugin();
  expect(state()).toEqual(empty());
  expect(projections).toEqual([]);
  expect(dialog.hidden).toBe(true);
  await click(harness, "หมวดใหม่");
  expect(loads).toBe(2);
  expect(state().fields[0].attachment).toEqual(choice("หมวดใหม่"));
});

test.each([
  catalog([]),
  { body: { error: "ecm_unavailable" }, httpStatus: 503 },
])(
  "empty or failed category loading blocks creation until a successful explicit retry: %j",
  async (first) => {
    let available = false;
    const { harness, state, projections } = await setup({
      categories: () => (available ? catalog(["หลักฐาน"]) : first),
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
    expect(state().fields[0].attachment).toEqual(choice("หลักฐาน"));
  }
);

test("Escape cancels after retry moves focus outside the popup content", async () => {
  let available = false;
  const { harness, state, projections } = await setup({
    categories: () =>
      available
        ? catalog(["หลักฐาน"])
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
    categories: () => catalog([category]),
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
    { ...original, attachment: choice("หมวดใหม่") },
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
  expect(saves(harness)).toHaveLength(2);
  expect(state().fields).toEqual([
    { ...original, attachment: choice("หมวดใหม่") },
  ]);
  const { fields } = await working(harness);
  expect(fields).toEqual([
    {
      ...original,
      attachment: choice("หมวดใหม่"),
      key: "confirmation",
      label: "เอกสารยืนยัน",
    },
  ]);
});

test.each(["invalid_template", "attachment_template_stale"])(
  "a rejected first proof Save never applies attachment Rules: %s",
  async (code) => {
    const original = { ...configuredAttachment(1), required: true };
    const { harness, state } = await setup({
      bindings: { ...empty(), fields: [original] },
      saveError: {
        body: { error: code, message: "conversion denied" },
        httpStatus: 422,
      },
      selected: {
        address: "B3",
        names: { [original.anchor]: "'Sheet1'!$B$3" },
      },
    });
    await click(harness);
    expect(state().fields).toEqual([original]);
    expect(saves(harness)).toHaveLength(1);
    const [proof] = saves(harness);
    const body = JSON.parse(proof.body);
    expect(body).toMatchObject({
      spreadsheetSaveCheckpoint: expect.any(String),
      spreadsheetUploadPocSnapshot: [
        { bindingId: original.id, rowIndex: null, tag: original.key },
      ],
      xlsxDraft: { revision: 0, version: 1 },
    });
    expect(body.xlsxDraft.bindings).toEqual({
      ...empty(),
      fields: [original],
    });
    const { fields } = await working(harness);
    expect(fields).toEqual([original]);
    expect(harness.statusElement.textContent).toContain("conversion denied");
    expect(harness.statusElement.dataset.state).not.toBe("success");
  }
);

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

test("automatic conversion waits for the ordinary proof operation to complete", async () => {
  const original = configuredAttachment(1);
  const completionGate = Promise.withResolvers();
  const { harness, state, projections } = await setup({
    bindings: { ...empty(), fields: [original] },
    completionGate,
    selected: { address: "B3", names: { [original.anchor]: "'Sheet1'!$B$3" } },
  });
  await click(harness);
  expect(state().fields).toEqual([original]);
  expect(saves(harness)).toHaveLength(1);
  const { fields } = await working(harness);
  expect(fields).toEqual([original]);
  const stayedLocked =
    action(harness).disabled && input(harness, "Title · ชื่อช่อง").disabled;
  const pendingChoiceRetained = harness.messages.findLast(
    ({ message }) => message.type === "dirty-state"
  )?.message.dirty;
  completionGate.resolve();
  await flushPlugin();
  await flushPlugin();
  expect(stayedLocked).toBe(true);
  expect(pendingChoiceRetained).toBe(true);
  expect(state().fields[0].attachment).toEqual(choice("หลักฐาน"));
  expect(projections).toHaveLength(1);
  expect(action(harness).disabled).toBe(false);
  expect(saves(harness)).toHaveLength(2);
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
    choice: choice("หลักฐาน"),
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
      { choice: choice("not-in-current-list") },
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
  expect(state().fields[0].attachment).toEqual(choice("หลักฐาน"));
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
      return loads === 1 ? pending.promise : catalog(["รายการล่าสุด"]);
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
  pending.resolve(catalog(["รายการเก่า"]));
  await flushPlugin();
  const select = descendants(harness.categoryPopup.body).find(
    (node) => node.tagName === "SELECT"
  );
  expect(select.children.map((option) => option.value)).toEqual(["", "1"]);
  harness.expireCapabilityRequests();
  await flushPlugin();
  expect(action(harness).disabled).toBe(true);
  await confirmCategory(harness, "รายการล่าสุด");
  expect(state().fields[0].attachment.template_name).toBe("รายการล่าสุด");
});

test("unloading the primary cancels its category request and ignores late results", async () => {
  const pending = Promise.withResolvers();
  const { harness, state, projections } = await setup({
    categories: () => pending.promise,
  });
  action(harness).click();
  await flushPlugin();
  harness.emitWindowEvent("beforeunload");
  pending.resolve(catalog(["หลักฐาน"]));
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
  expect(select.children.map((option) => option.value)).toEqual(["", "1"]);
  expect(
    popup.body.children.find((node) => node.tagName === "MAIN").hidden
  ).toBe(false);
  expect(state()).toEqual(empty());
  await confirmCategory(harness);
  expect(state().fields[0].attachment.template_name).toBe("หลักฐาน");
});
