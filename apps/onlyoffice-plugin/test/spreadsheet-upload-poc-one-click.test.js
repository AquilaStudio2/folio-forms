import { expect, test } from "bun:test";

import { acknowledgeBridge, createHarness, flushPlugin } from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const action = (harness) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "BUTTON" &&
      node.textContent === "วางปุ่มและบันทึกต้นแบบ (POC)"
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
  liveBindings = bindings,
} = {}) => {
  let state = structuredClone(liveBindings);
  let revision = 0;
  let firstRead = true;
  let remainingSaveFailures = saveFailures;
  const response = async (url, init) => {
    if (String(url).includes("/operations/")) {
      return { operation: { result: saveResult, status: "completed" } };
    }
    if (init.method === "POST" && String(url).endsWith("/save")) {
      if (remainingSaveFailures > 0) {
        remainingSaveFailures -= 1;
        return { body: { error: "save unavailable" }, httpStatus: 503 };
      }
      return {
        operationCapability: "operation-capability",
        operationId: "poc-save-operation",
      };
    }
    if (!init.method || init.method === "GET") {
      if (firstRead && gate) {
        await gate.promise;
      }
      firstRead = false;
    } else if (reject) {
      return { body: { error: "binding denied" }, httpStatus: 409 };
    } else {
      const { change } = JSON.parse(init.body);
      state = {
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
const click = async (harness) => {
  action(harness).dispatchEvent({ type: "click" });
  await flushPlugin();
  await flushPlugin();
};

test("one click creates a normal text mapping and repeat reuses it without another write", async () => {
  const { harness, projections, state } = await setup();
  await click(harness);
  expect(state().fields).toHaveLength(1);
  const [field] = state().fields;
  expect(field).toMatchObject({
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
  expect(harness.requests.some((request) => request.method === "PATCH")).toBe(
    false
  );
  expect(state()).toEqual(bindings);
  const save = harness.requests.find((request) => request.method === "POST");
  expect(JSON.parse(save.body)).toMatchObject({
    preserveEditorSession: true,
    uploadPocBindingId: "folio_proof",
  });
  expect(harness.statusElement.textContent).toContain("บันทึกต้นแบบ POC สำเร็จ");
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
  const { harness, state, projections, projectionLocks } = await setup({
    saveFailures: 1,
  });
  await click(harness);
  const [field] = state().fields;
  expect(projectionLocks).toEqual(["none"]);
  expect(harness.requests.map((request) => request.method)).toEqual([
    "GET",
    "PATCH",
    "POST",
  ]);
  expect(harness.requests.at(-1).url).toEndWith("/save");
  expect(
    JSON.parse(harness.requests.at(-1).body).spreadsheetAnchors
  ).toContainEqual([field.anchor, harness.spreadsheetNames.get(field.anchor)]);
  expect(harness.statusElement.textContent).toContain(
    "วางปุ่มแล้ว แต่บันทึกต้นแบบยังไม่สำเร็จ"
  );
  expect(harness.statusElement.textContent).toContain("เซลล์เดิม");
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
  expect(projections).toHaveLength(2);
  expect(harness.statusElement.textContent).toContain("บันทึกต้นแบบ POC สำเร็จ");
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
  expect(harness.statusElement.textContent).toContain("บันทึกต้นแบบ POC สำเร็จ");
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
    const result = await harness.window.FormBridge.runAction(
      "save-template",
      "",
      null,
      { preserveEditorSession: true, uploadPocBindingId }
    );
    expect(result.ok).toBe(false);
    expect(harness.requests).toHaveLength(0);
    expect(
      harness.methodInvocations.some(
        (call) => call.method === "SetEditingRestrictions"
      )
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
    for (const label of [
      "Title · ชื่อช่อง",
      "Tag · รหัสช่อง",
      "ชนิดข้อมูล",
      "ช่องที่บันทึกแล้ว",
    ]) {
      expect(input(harness, label).disabled).toBe(false);
    }
    // Existing binding kind cannot change; restoring controls must preserve that rule.
    expect(input(harness, "กำหนดช่วงที่เลือกเป็น").disabled).toBe(true);
    await click(harness);
    for (const label of [
      "Title · ชื่อช่อง",
      "Tag · รหัสช่อง",
      "ชนิดข้อมูล",
      "ช่องที่บันทึกแล้ว",
    ]) {
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
