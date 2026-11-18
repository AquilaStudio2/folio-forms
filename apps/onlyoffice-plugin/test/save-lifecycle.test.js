// oxlint-disable prefer-await-to-callbacks node/callback-return unicorn/prefer-dom-node-remove prefer-destructuring unicorn/prefer-response-static-json no-await-in-loop unicorn/consistent-function-scoping no-plusplus unicorn/prefer-array-find -- VM harness intentionally mirrors browser callbacks and DOM shims.
import { expect, test } from "bun:test";

import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

test.each(["scalar", "table-only"])(
  "%s uncertain Save keeps ordinary editing frozen while recovery remains usable and waits for the canonical remount after completion",
  async (kind) => {
    const harness = createHarness({
      action: "draft",
      capabilityResponses: ["first-capability", "retry-capability"],
      documentKind: "xlsx",
      nativeWorkbookCaptureUrl: "http://office.test/old-ordinary-snapshot.xlsx",
      responses: [
        completedOperation({
          documentKey: "saved-document-key",
          submissionId: "original-submission",
        }),
      ],
      scopeIdentity: "actor/response",
      serializeCommands: true,
      spreadsheetBindings: {
        fields:
          kind === "scalar"
            ? [
                {
                  anchor: "folio_file",
                  attachment: { category: "หลักฐาน" },
                  id: "folio_file",
                  key: "file",
                  label: "File",
                  type: "text",
                },
              ]
            : [],
        table:
          kind === "scalar"
            ? null
            : {
                anchor: "folio_table",
                columns: [
                  {
                    attachment: { category: "หลักฐาน" },
                    id: "folio_file",
                    key: "file",
                    label: "File",
                    offset: 0,
                    type: "text",
                  },
                ],
                id: "folio_table",
                key: "items",
                label: "Items",
              },
        version: 1,
      },
      spreadsheetSelection: {
        names: {
          folio_file: "'Form'!$B$10",
          folio_table: "'Form'!$B$10:$B$12",
        },
      },
    });
    const post = harness.parentWindow.postMessage.bind(harness.parentWindow);
    let attempts = 0;
    harness.parentWindow.postMessage = (message, origin) => {
      post(message, origin);
      if (!["pending-file-check", "pending-file-save"].includes(message.type)) {
        return;
      }
      let result = {
        allowed: true,
        attachmentCommitUnresolved: false,
        hasPending: false,
      };
      if (message.type === "pending-file-save") {
        attempts += 1;
        result = {
          attachmentCommitUnresolved: true,
          error: "ผลรอบเดิมยังไม่ยืนยัน",
        };
      } else if (attempts > 0) {
        result = {
          ...result,
          attachmentCommitUnresolved: true,
          checkpointOperation: {
            action: "submit",
            operationCapability: "original-operation-capability",
            operationId: "original-operation",
            status: "completed",
          },
        };
      }
      queueMicrotask(() =>
        harness.dispatch({
          data: {
            ...message,
            ...result,
            source: "folio-upload-poc-host",
            type: "pending-file-result",
          },
          origin: harness.parentOrigin,
          source: harness.parentWindow,
        })
      );
    };
    acknowledgeBridge(harness);
    await flushPlugin();
    const first = await harness.window.FormBridge.runAction("submit");
    expect(attempts, JSON.stringify(first)).toBe(1);
    expect(first).toMatchObject({ ok: false });
    expect(harness.editorRestriction).toBe("readOnly");
    expect(
      harness.messages
        .filter(({ message }) => message.type === "operation")
        .at(-1).message.status
    ).toBe("failed");
    expect(
      harness.messages
        .filter(({ message }) => message.type === "operation")
        .at(-1).message.attachmentCommitUnresolved
    ).toBe(true);
    const recovered = await harness.window.FormBridge.runAction("save-draft");
    expect(recovered).toMatchObject({
      ok: true,
      operationId: "original-operation",
    });
    expect(attempts).toBe(1);
    expect(
      harness.messages.filter(
        ({ message }) => message.type === "capability-request"
      )
    ).toHaveLength(1);
    expect(harness.requests.map(({ method }) => method)).toEqual(["GET"]);
    expect(harness.editorRestriction).toBe("readOnly");
    expect(
      harness.messages
        .filter(({ message }) => message.type === "operation")
        .at(-1).message
    ).toMatchObject({
      action: "submit",
      operationId: "original-operation",
      requestedAction: "save-draft",
      status: "completed",
    });
  }
);

test("Save freezes native edits and announces busy before waiting for the pending-file guard", async () => {
  const harness = createHarness({
    action: "draft",
    documentKind: "xlsx",
    scopeIdentity: "actor/response",
    spreadsheetBindings: {
      version: 1,
      fields: [{
        anchor: "folio_file",
        attachment: { category: "หลักฐาน" },
        id: "folio_file",
        key: "file",
        label: "File",
        type: "text",
      }],
      table: null,
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  void harness.window.FormBridge.runAction("save-draft");
  await flushPlugin();
  expect(harness.editorRestriction).toBe("readOnly");
  expect(harness.messages.some(({ message }) =>
    message.type === "pending-file-check"
  )).toBe(true);
  expect(harness.messages.some(({ message }) =>
    message.type === "operation" && message.status === "pending" &&
    message.action === "save-draft"
  )).toBe(true);
  expect(await harness.window.FormBridge.runAction("submit")).toMatchObject({
    ignored: true,
    ok: false,
  });
  expect(harness.requests).toHaveLength(0);
});

test("only authenticated current Draft completion resumes the same native editor with fresh canonical admission", async () => {
  const harness = createHarness({
    action: "draft",
    documentKind: "xlsx",
    capabilityResponses: ["first-capability", "second-capability"],
    scopeIdentity: "actor/response",
    responses: [
      completedOperation({ documentKey: "committed-first" }),
      completedOperation({ documentKey: "committed-second" }),
    ],
    spreadsheetBindings: {
      version: 1,
      fields: [{
        anchor: "folio_file", attachment: { category: "หลักฐาน" },
        id: "folio_file", key: "file", label: "File", type: "text",
      }],
      table: null,
    },
  });
  const post = harness.parentWindow.postMessage.bind(harness.parentWindow);
  const saves = [];
  harness.parentWindow.postMessage = (message, origin) => {
    post(message, origin);
    if (!["pending-file-check", "pending-file-save"].includes(message.type)) {
      return;
    }
    const result = { allowed: true, hasPending: false, attachmentCommitUnresolved: false };
    if (message.type === "pending-file-save") {
      saves.push(message.body.documentKey);
      Object.assign(result, {
        operationId: `saved-${saves.length}`,
        operationCapability: "poll-capability",
        status: "pending",
      });
    }
    queueMicrotask(() => harness.dispatch({
      data: { ...message, ...result, source: "folio-upload-poc-host", type: "pending-file-result" },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    }));
  };
  acknowledgeBridge(harness);
  await flushPlugin();
  expect(await harness.window.FormBridge.runAction("save-draft")).toMatchObject({ ok: true });
  expect(harness.editorRestriction).toBe("readOnly");
  const acknowledge = (operationId, documentKey, origin = harness.parentOrigin) => harness.dispatch({
    data: {
      bridgeId: harness.bridgeId, source: "folio-parent",
      type: "retain-completed-editor", operationId, documentKey,
    },
    origin,
    source: harness.parentWindow,
  });
  acknowledge("saved-1", "committed-first", "https://foreign.test");
  acknowledge("not-this-operation", "committed-first");
  await flushPlugin();
  expect(harness.editorRestriction).toBe("readOnly");
  acknowledge("saved-1", "committed-first");
  await flushPlugin();
  expect(harness.editorRestriction).toBe("none");
  expect(await harness.window.FormBridge.runAction("save-draft")).toMatchObject({ ok: true });
  expect(saves).toEqual(["document-key", "committed-first"]);
  acknowledge("saved-1", "committed-first");
  await flushPlugin();
  expect(harness.editorRestriction).toBe("readOnly");
});

for (const action of ["save-template", "publish"]) {
  test(`DOCX ${action} ignores new parent commands and preserves the existing toolbar contract`, async () => {
    const harness = createHarness({
      action: "template-edit",
      capabilityResponses: ["docx-action-capability"],
      documentKind: "docx",
      holdEditorSave: true,
      responses: [
        { operationCapability: "docx-poll", operationId: "docx-operation" },
        completedOperation(),
      ],
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    const dispatch = () =>
      harness.dispatch({
        data: {
          action,
          bridgeId: harness.bridgeId,
          source: "folio-parent",
          type: "run-action",
        },
        origin: harness.parentOrigin,
        source: harness.parentWindow,
      });
    dispatch();
    await flushPlugin();
    expect(harness.requests).toHaveLength(0);
    expect(
      harness.messages.some(
        ({ message }) => message.type === "editor-save-request"
      )
    ).toBe(false);
    const firstAttempt = harness.window.FormBridge.runAction(action);
    await flushPlugin();
    expect(harness.methodInvocations).toContainEqual({
      args: ["readOnly"],
      method: "SetEditingRestrictions",
    });
    harness.finishEditorSave("Native save failed");
    await expect(firstAttempt).resolves.toMatchObject({ ok: false });
    await flushPlugin();
    expect(harness.requests).toHaveLength(0);
    expect(
      harness.messages
        .filter(({ message }) => message.type === "operation")
        .at(-1).message
    ).toMatchObject({
      action,
      error: "Native save failed",
      status: "failed",
    });
    expect(harness.methodInvocations.at(-1)).toMatchObject({
      args: ["none"],
      method: "SetEditingRestrictions",
    });
    const retry = harness.window.FormBridge.runAction(action);
    await flushPlugin();
    harness.finishEditorSave();
    await expect(retry).resolves.toMatchObject({ ok: true });
    await flushPlugin();
    expect(harness.requests.map(({ method }) => method)).toEqual([
      "POST",
      "GET",
    ]);
    expect(harness.requests[0].url).toEndWith(
      action === "publish" ? "/publish" : "/save"
    );
    expect(JSON.parse(harness.requests[0].body)).toEqual({
      documentKey: "document-key",
    });
    expect(harness.requests[0].headers.get("x-editor-capability")).toBe(
      "docx-action-capability"
    );
    expect(harness.requests[1].headers.get("x-editor-capability")).toBe(
      "docx-poll"
    );
    expect(
      harness.messages
        .filter(({ message }) => message.type === "operation")
        .at(-1).message
    ).toMatchObject({
      action,
      status: "completed",
    });
  });
}

for (const action of ["save-template", "publish"]) {
  test(`parent ${action} waits for native Excel save and captures live anchors`, async () => {
    const harness = createHarness({
      action: "template-edit",
      capabilityResponses: ["action-capability"],
      documentKind: "xlsx",
      holdEditorSave: true,
      responses: [
        { operationCapability: "poll", operationId: "template-save" },
        completedOperation({
          documentKey: "document-key",
          editorSessionPreserved: true,
        }),
      ],
      serializeCommands: true,
      spreadsheetBindings: {
        fields: [
          {
            anchor: "folio_month",
            id: "folio_month",
            key: "month",
            label: "Month",
            options: [],
            type: "text",
          },
          {
            anchor: "folio_unfinished",
            id: "folio_unfinished",
            key: "unfinished",
            label: "Unfinished",
            options: [],
            type: "text",
          },
        ],
        table: null,
        version: 1,
      },
      spreadsheetSelection: {
        address: "E5",
        names: { folio_month: "'Form'!$E$5" },
        sheet: "Form",
      },
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    harness.dispatch({
      data: {
        action,
        bridgeId: harness.bridgeId,
        source: "folio-parent",
        type: "run-action",
      },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    });
    await flushPlugin();
    expect(harness.requests).toHaveLength(0);
    expect(
      harness.messages.some(
        ({ message }) => message.type === "editor-save-request"
      )
    ).toBe(true);
    harness.finishEditorSave();
    await flushPlugin();
    expect(JSON.parse(harness.requests[0].body)).toEqual({
      documentKey: "document-key",
      ...(action === "save-template"
        ? {
            preserveEditorSession: true,
            preserveEditorSessionPurpose: "manual",
            spreadsheetSaveCheckpoint: expect.any(String),
            spreadsheetUploadPocSnapshot: [],
          }
        : {}),
      spreadsheetAnchors: [
        ["folio_month", "'Form'!$E$5"],
        ["folio_unfinished", null],
      ],
    });
    expect(harness.requests[0].url).toEndWith(
      action === "publish" ? "/publish" : "/save"
    );
    expect(
      harness.messages
        .filter(({ message }) => message.type === "operation")
        .map(({ message }) => message.status)
    ).toEqual(["pending", "completed"]);
  });
}

test("a failed native template save preserves the workbook and permits retry", async () => {
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["save-capability"],
    documentKind: "xlsx",
    holdEditorSave: true,
    responses: [
      { operationCapability: "poll", operationId: "retry" },
      completedOperation({
        documentKey: "document-key",
        editorSessionPreserved: true,
      }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const save = harness.window.FormBridge.runAction("save-template");
  await flushPlugin();
  harness.finishEditorSave("Native save failed");
  await expect(save).resolves.toMatchObject({ ok: false });
  expect(harness.requests).toHaveLength(0);
  expect(harness.methodInvocations.at(-1)).toMatchObject({
    args: ["none"],
    method: "SetEditingRestrictions",
  });
  const retry = harness.window.FormBridge.runAction("save-template");
  await flushPlugin();
  harness.finishEditorSave();
  await expect(retry).resolves.toMatchObject({ ok: true });
});

test("reports dirty state after a document content change", () => {
  const harness = createHarness();
  acknowledgeBridge(harness);

  harness.emitEditorEvent("onChangeContentControl");

  expect(harness.messages.at(-1)).toEqual({
    message: {
      bridgeId: harness.bridgeId,
      dirty: true,
      source: "form-bridge",
      type: "dirty-state",
    },
    targetOrigin: harness.parentOrigin,
  });
});

test("clears dirty state after successful save and submit actions", async () => {
  const harness = createHarness({
    action: "draft",
    capabilityResponses: ["save-draft-capability", "submit-capability"],
    controls: [
      {
        GetClassType: () => "inlineLvlSdt",
        GetDate: () => new Date(2026, 8, 15),
        GetTag: () => "start_date",
        IsDatePicker: () => true,
      },
    ],
    responses: [{ ok: true }, { ok: true }],
  });
  acknowledgeBridge(harness);

  harness.emitEditorEvent("onChangeContentControl");
  await expect(
    harness.window.FormBridge.runAction("save-draft")
  ).resolves.toMatchObject({ ok: true });
  harness.emitEditorEvent("onChangeContentControl");
  await expect(
    harness.window.FormBridge.runAction("submit")
  ).resolves.toMatchObject({ ok: true });

  expect(
    harness.messages
      .filter(({ message }) => message.type === "dirty-state")
      .map(({ message }) => message.dirty)
  ).toEqual([true, false, true, false]);
  for (const request of harness.requests) {
    const requestBody = JSON.parse(request.body);
    expect(requestBody.data).toEqual({ start_date: "2026-09-15" });
    expect(requestBody.canonicalDateFields).toEqual(["start_date"]);
  }
});

test("waits for native collection before saving a dirty draft and reporting completion", async () => {
  const harness = createHarness({
    action: "draft",
    capabilityResponses: ["save-draft-capability"],
    controls: [
      {
        GetClassType: () => "inlineLvlSdt",
        GetRange: () => ({ GetText: () => "PDMS saved draft" }),
        GetTag: () => "full_name",
      },
    ],
    holdEditorSave: true,
    responses: [
      { operationCapability: "poll-capability", operationId: "draft-save" },
      completedOperation({ responseId: "owned-draft" }),
    ],
  });
  acknowledgeBridge(harness);
  harness.emitEditorEvent("onChangeContentControl");
  const save = harness.window.FormBridge.runAction("save-draft");
  await flushPlugin();
  const nativeSaveRequest = harness.messages.find(
    ({ message }) => message.type === "editor-save-request"
  ).message;
  const savedResponse = {
    ...nativeSaveRequest,
    saved: true,
    source: "folio-parent",
    type: "editor-save-response",
  };
  for (const forged of [
    { data: savedResponse, origin: harness.parentOrigin, source: {} },
    {
      data: savedResponse,
      origin: "https://wrong.example.test",
      source: harness.parentWindow,
    },
    {
      data: { ...savedResponse, bridgeId: "another-document" },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    },
    {
      data: { ...savedResponse, requestId: "earlier-save" },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    },
  ]) {
    harness.dispatch(forged);
  }
  await flushPlugin();
  // Api.Save has returned true, but typing has not reached the editing service.
  expect(harness.requests).toHaveLength(0);
  expect(
    harness.messages.filter(({ message }) => message.type === "operation")
  ).toEqual([]);
  expect(
    harness.messages
      .filter(({ message }) => message.type === "dirty-state")
      .at(-1).message.dirty
  ).toBe(true);

  harness.finishEditorSave();
  await expect(save).resolves.toMatchObject({
    ok: true,
    operationId: "draft-save",
  });
  expect(JSON.parse(harness.requests[0].body).data).toEqual({
    full_name: "PDMS saved draft",
  });
  expect(harness.requests.map(({ method }) => method)).toEqual(["POST", "GET"]);
  expect(
    harness.messages
      .filter(({ message }) => message.type === "operation")
      .map(({ message }) => message.status)
  ).toEqual(["pending", "completed"]);
  expect(
    harness.messages
      .filter(({ message }) => message.type === "dirty-state")
      .at(-1).message.dirty
  ).toBe(false);
});

test("failed or unavailable native collection preserves dirty work and blocks save completion", async () => {
  for (const editorSaveSupported of [true, false]) {
    const harness = createHarness({
      action: "draft",
      editorSaveSupported,
      holdEditorSave: true,
    });
    acknowledgeBridge(harness);
    harness.emitEditorEvent("onChangeContentControl");
    const save = harness.window.FormBridge.runAction("save-draft");
    await flushPlugin();
    if (editorSaveSupported) {
      harness.finishEditorSave(
        "The native editor could not save document changes"
      );
    }
    await expect(save).resolves.toMatchObject({ ok: false, operationId: null });
    expect(harness.requests).toHaveLength(0);
    expect(
      harness.messages
        .filter(({ message }) => message.type === "dirty-state")
        .at(-1).message.dirty
    ).toBe(true);
    expect(
      harness.messages
        .filter(({ message }) => message.type === "operation")
        .map(({ message }) => message.status)
    ).toEqual(["failed"]);
  }
});

test("accepts only authenticated parent dirty commands", async () => {
  const harness = createHarness({
    action: "draft",
    capabilityResponses: ["save-draft-capability"],
    responses: [{ ok: true }],
  });
  acknowledgeBridge(harness);
  harness.emitEditorEvent("onChangeContentControl");

  const validRunAction = {
    action: "save-draft",
    bridgeId: harness.bridgeId,
    source: "folio-parent",
    type: "run-action",
  };
  const invalidEvents = [
    {
      data: validRunAction,
      origin: "https://wrong.example.test",
      source: harness.parentWindow,
    },
    {
      data: validRunAction,
      origin: harness.parentOrigin,
      source: {},
    },
    {
      data: { ...validRunAction, bridgeId: "wrong-bridge" },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    },
    {
      data: { ...validRunAction, action: "submit" },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    },
    {
      data: {
        bridgeId: harness.bridgeId,
        source: "attacker",
        type: "clear-dirty",
      },
      origin: harness.parentOrigin,
      source: harness.parentWindow,
    },
  ];

  for (const event of invalidEvents) {
    harness.dispatch(event);
  }
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  expect(
    harness.messages
      .filter(({ message }) => message.type === "dirty-state")
      .map(({ message }) => message.dirty)
  ).toEqual([true]);

  harness.dispatch({
    data: {
      bridgeId: harness.bridgeId,
      source: "folio-parent",
      type: "clear-dirty",
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  harness.emitEditorEvent("onChangeContentControl");
  harness.dispatch({
    data: validRunAction,
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  await flushPlugin();

  expect(harness.requests).toHaveLength(1);
  expect(
    harness.messages
      .filter(({ message }) => message.type === "dirty-state")
      .map(({ message }) => message.dirty)
  ).toEqual([true, false, true, false]);
});

test("runs correction saves with a reason and correction endpoint", async () => {
  const harness = createHarness({
    action: "correction",
    capabilityResponses: ["save-correction-capability", "poll-capability"],
    responses: [
      {
        operationCapability: "poll-capability",
        operationId: "correction-operation",
      },
      completedOperation({ correctionId: "correction-1", revision: 1 }),
    ],
  });
  expect(harness.methodCalls).toContain("SetEditingRestrictions");
  const restrictionsBeforeReady = harness.methodCalls.filter(
    (method) => method === "SetEditingRestrictions"
  ).length;
  harness.emitEditorEvent("onDocumentContentReady");
  await flushPlugin();
  expect(
    harness.methodCalls.filter((method) => method === "SetEditingRestrictions")
      .length
  ).toBeGreaterThan(restrictionsBeforeReady);
  acknowledgeBridge(harness);

  await expect(
    harness.window.FormBridge.runAction("save-correction", "แก้ไขตามเอกสารต้นฉบับ")
  ).resolves.toMatchObject({ ok: true });

  expect(harness.requests.map(({ method, url }) => [method, url])).toEqual([
    [
      "POST",
      "https://api.example.test/api/admin/results/response-id/correction",
    ],
    ["GET", "https://api.example.test/api/operations/correction-operation"],
  ]);
  expect(JSON.parse(harness.requests[0].body)).toEqual({
    data: {},
    documentKey: "document-key",
    reason: "แก้ไขตามเอกสารต้นฉบับ",
  });
  expect(harness.requests[0].headers.get("x-editor-capability")).toBe(
    "save-correction-capability"
  );
});
