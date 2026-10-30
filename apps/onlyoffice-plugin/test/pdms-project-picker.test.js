// oxlint-disable sort-keys -- Fixture scopes follow their user-visible catalog fields.
import { expect, test } from "bun:test";

import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const labelled = (harness, caption) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === caption
  )?.children[1];
const project = {
  anchor: "folio_project",
  id: "folio_project",
  key: "project_name",
  label: "ชื่อโครงการ",
  options: [],
  source: "pdms-project-name",
  type: "dropdown",
};

test("a table project picker targets the selected physical row in its saved document revision", async () => {
  const harness = createHarness({
    capabilityResponses: ["save-capability"],
    documentKind: "xlsx",
    holdEditorSave: true,
    pdmsProjectCatalog: {
      names: ["Project B"],
      sessionId: "catalog-session",
      status: "ready",
    },
    spreadsheetBindings: {
      version: 1,
      fields: [],
      table: {
        id: "folio_table",
        anchor: "folio_body",
        key: "projects",
        label: "Projects",
        columns: [
          { ...project, id: "folio_project_column", key: "project", offset: 0 },
        ],
      },
      locations: {
        folio_body: {
          sheet: "Form",
          firstRow: 3,
          lastRow: 5,
          firstColumn: 0,
          lastColumn: 1,
        },
      },
    },
    responses: [
      { operationId: "picker-save", operationCapability: "poll-capability" },
      completedOperation({ documentKey: "next-document" }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const row = labelled(harness, "แถวโครงการ");
  expect(row).toBeDefined();
  expect(row.children.map((option) => option.textContent)).toEqual([
    "รายการ 1 · แถว 4",
    "รายการ 2 · แถว 5",
    "รายการ 3 · แถว 6",
  ]);
  row.value = "1";
  row.dispatchEvent({ type: "change" });
  labelled(harness, "ค้นหาชื่อโครงการ").dispatchEvent({
    key: "Enter",
    type: "keydown",
  });
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  harness.finishEditorSave();
  await flushPlugin();
  await flushPlugin();
  expect(JSON.parse(harness.requests[0].body)).toMatchObject({
    documentKey: "document-key",
    pdmsSelection: {
      bindingId: "folio_project_column",
      name: "Project B",
      sessionId: "catalog-session",
      row: { index: 1, documentKey: "document-key" },
    },
  });
});

test("search selects a name through native freeze and flush before saving and keeps editing frozen until reload", async () => {
  const harness = createHarness({
    capabilityResponses: ["save-capability"],
    documentKind: "xlsx",
    holdEditorSave: true,
    pdmsProjectCatalog: {
      names: ["โครงการ ก", "Project B"],
      sessionId: "catalog-session",
      status: "ready",
    },
    responses: [
      { operationId: "picker-save", operationCapability: "poll-capability" },
      completedOperation({ documentKey: "reloaded-document-key" }),
    ],
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const search = labelled(harness, "ค้นหาชื่อโครงการ");
  expect(search).toBeDefined();
  search.value = "โครงการ";
  search.dispatchEvent({ type: "input" });
  expect(harness.requests).toHaveLength(0);
  const choice = descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === "โครงการ ก"
  );
  expect(choice).toBeDefined();
  choice.dispatchEvent({ type: "click" });
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  expect(harness.methodInvocations).toContainEqual({
    args: ["readOnly"],
    method: "SetEditingRestrictions",
  });
  harness.finishEditorSave();
  await flushPlugin();
  await flushPlugin();
  expect(JSON.parse(harness.requests[0].body)).toMatchObject({
    documentKey: "document-key",
    pdmsCatalogSessionId: "catalog-session",
    pdmsSelection: {
      bindingId: "folio_project",
      name: "โครงการ ก",
      sessionId: "catalog-session",
    },
  });
  expect(
    harness.messages.some(
      ({ message }) =>
        message.type === "operation" && message.status === "completed"
    )
  ).toBe(true);
  expect(
    harness.methodInvocations.some(
      ({ method, args }) =>
        method === "SetEditingRestrictions" && args?.[0] === "none"
    )
  ).toBe(false);
});

test("Thai composition, cancellation and paging leave answers untouched and keep the final result reachable", async () => {
  const names = Array.from(
    { length: 2500 },
    (_, index) => `โครงการทดสอบ ${String(index).padStart(4, "0")}`
  );
  const harness = createHarness({
    documentKind: "xlsx",
    pdmsProjectCatalog: {
      names,
      sessionId: "catalog-session",
      status: "ready",
    },
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const query = labelled(harness, "ค้นหาชื่อโครงการ");
  query.dispatchEvent({ type: "compositionstart" });
  query.value = "โครงการทดสอบ 2499";
  query.dispatchEvent({ type: "input" });
  query.dispatchEvent({ isComposing: true, key: "Enter", type: "keydown" });
  expect(
    descendants(harness.body).filter((node) => node.role === "option")
  ).toHaveLength(100);
  query.dispatchEvent({ type: "compositionend" });
  expect(
    descendants(harness.body)
      .filter((node) => node.role === "option")
      .map((node) => node.textContent)
  ).toEqual(["โครงการทดสอบ 2499"]);
  query.dispatchEvent({ key: "Escape", type: "keydown" });
  expect(query.value).toBe("");
  for (let page = 0; page < 24; page += 1) {
    descendants(harness.body)
      .find(
        (node) =>
          node.tagName === "BUTTON" &&
          node.textContent === "แสดงเพิ่ม 100 โครงการ"
      )
      .click();
  }
  const choices = descendants(harness.body).filter(
    (node) => node.role === "option"
  );
  expect(choices.at(-1).textContent).toBe("โครงการทดสอบ 2499");
  query.dispatchEvent({ key: "ArrowDown", type: "keydown" });
  expect(query["aria-activedescendant"]).toBe("pdms-project-1");
  expect(harness.requests).toHaveLength(0);
});

test("failed picker saving keeps the current editor and permits retry", async () => {
  const harness = createHarness({
    capabilityResponses: ["save-capability"],
    documentKind: "xlsx",
    pdmsProjectCatalog: {
      names: ["โครงการ ก"],
      sessionId: "catalog-session",
      status: "ready",
    },
    responses: [
      { operationId: "picker-save", operationCapability: "poll-capability" },
      { operation: { status: "failed", error: "document_save_failed" } },
    ],
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const choice = descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === "โครงการ ก"
  );
  choice.click();
  await flushPlugin();
  await flushPlugin();
  expect(harness.methodInvocations).toContainEqual({
    args: ["none"],
    method: "SetEditingRestrictions",
  });
  expect(choice.disabled).toBe(false);
  expect(
    harness.messages.some(
      ({ message }) =>
        message.type === "operation" && message.status === "completed"
    )
  ).toBe(false);
});

test("Retry recovers a failed catalog without saving or replacing the current editor", async () => {
  const harness = createHarness({
    capabilityResponses: ["retry-capability"],
    documentKind: "xlsx",
    pdmsProjectCatalog: {
      names: [],
      sessionId: "catalog-session",
      status: "error",
    },
    responses: [
      {
        pdmsProjectCatalog: {
          names: ["โครงการหลังคืนบริการ"],
          sessionId: "catalog-session",
          status: "ready",
        },
      },
    ],
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const query = labelled(harness, "ค้นหาชื่อโครงการ");
  expect(query.disabled).toBe(true);
  const retry = descendants(harness.body).find(
    (node) =>
      node.tagName === "BUTTON" && node.textContent === "ลองโหลดรายการอีกครั้ง"
  );
  expect(retry).toBeDefined();
  retry.click();
  await flushPlugin();
  expect(harness.requests).toHaveLength(1);
  expect(harness.requests[0].url).toEndWith(
    "/api/editor/pdms-project-catalog/retry"
  );
  expect(JSON.parse(harness.requests[0].body)).toEqual({
    documentKey: "document-key",
    sessionId: "catalog-session",
  });
  expect(query.disabled).toBe(false);
  expect(
    descendants(harness.body).some(
      (node) =>
        node.role === "option" && node.textContent === "โครงการหลังคืนบริการ"
    )
  ).toBe(true);
  expect(harness.saveCalls).toHaveLength(0);
  expect(
    harness.methodInvocations.some(
      ({ method }) => method === "SetEditingRestrictions"
    )
  ).toBe(false);
  expect(
    harness.messages.some(({ message }) => message.type === "operation")
  ).toBe(false);
});

test("a replacement lease's ready catalog reaches the live picker during Retry without another provider request or native reload", async () => {
  const replacement = {
    sessionId: "replacement-catalog",
    status: "ready",
    names: ["ชื่อจากตัวแก้ไขใหม่"],
  };
  const harness = createHarness({
    documentKind: "xlsx",
    pdmsProjectCatalog: {
      sessionId: "expired-catalog",
      status: "error",
      names: [],
    },
    capabilityResponses: [
      { capability: "replacement-capability", pdmsProjectCatalog: replacement },
    ],
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  descendants(harness.body)
    .find(
      (node) =>
        node.tagName === "BUTTON" && node.textContent === "ลองโหลดรายการอีกครั้ง"
    )
    .click();
  await flushPlugin();
  expect(
    descendants(harness.body)
      .filter((node) => node.role === "option")
      .map((node) => node.textContent)
  ).toEqual(["ชื่อจากตัวแก้ไขใหม่"]);
  expect(
    harness.window.FormBridge.getRuntimeOptions().pdmsProjectCatalog.sessionId
  ).toBe("replacement-catalog");
  expect(harness.requests).toHaveLength(0);
  expect(harness.saveCalls).toHaveLength(0);
  expect(
    harness.methodInvocations.some(
      ({ method }) => method === "SetEditingRestrictions"
    )
  ).toBe(false);
});

test("a choice started before lease replacement is rejected while the new catalog becomes usable in the same editor", async () => {
  const harness = createHarness({
    documentKind: "xlsx",
    responses: [
      {
        httpStatus: 409,
        body: { error: "pdms_session_stale", message: "เลือกใหม่จากรายการปัจจุบัน" },
      },
    ],
    pdmsProjectCatalog: {
      sessionId: "previous-catalog",
      status: "ready",
      names: ["ชื่อเดิม"],
    },
    capabilityResponses: [
      {
        capability: "replacement-capability",
        pdmsProjectCatalog: {
          sessionId: "replacement-catalog",
          status: "ready",
          names: ["ชื่อปัจจุบัน"],
        },
      },
    ],
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  descendants(harness.body)
    .find((node) => node.role === "option" && node.textContent === "ชื่อเดิม")
    .click();
  await flushPlugin();
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  const current = descendants(harness.body).find(
    (node) => node.role === "option" && node.textContent === "ชื่อปัจจุบัน"
  );
  expect(current).toBeDefined();
  expect(current.disabled).toBe(false);
  expect(harness.methodInvocations).toContainEqual({
    args: ["none"],
    method: "SetEditingRestrictions",
  });
  expect(
    harness.messages.some(
      ({ message }) =>
        message.type === "operation" && message.status === "completed"
    )
  ).toBe(false);
});

test("Correction picker saves only its workspace without inventing a reason, using the native save barrier", async () => {
  const harness = createHarness({
    action: "correction",
    capabilityResponses: ["workspace-capability"],
    documentKind: "xlsx",
    holdEditorSave: true,
    scopeIdentity: "actor/correction/response-id",
    pdmsProjectCatalog: {
      names: ["Current project"],
      sessionId: "catalog-session",
      status: "ready",
    },
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
    responses: [
      {
        operationId: "workspace-preview",
        operationCapability: "poll-capability",
      },
      completedOperation({
        documentKey: "next-workspace",
        workspaceSaved: true,
      }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  labelled(harness, "ค้นหาชื่อโครงการ").dispatchEvent({
    type: "keydown",
    key: "Enter",
  });
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  const pendingCheck = harness.messages.find(
    ({ message }) => message.type === "pending-file-check"
  )?.message;
  expect(pendingCheck).toMatchObject({
    action: "save-correction-workspace",
    bridgeId: harness.bridgeId,
    documentKey: "document-key",
    scopeIdentity: "actor/correction/response-id",
    source: "folio-upload-poc",
  });
  expect(
    harness.methodInvocations.some(
      ({ method }) => method === "SetEditingRestrictions"
    )
  ).toBe(false);
  harness.dispatch({
    data: {
      ...pendingCheck,
      source: "folio-upload-poc-host",
      type: "pending-file-result",
      allowed: true,
      hasPending: false,
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  expect(harness.methodInvocations).toContainEqual({
    method: "SetEditingRestrictions",
    args: ["readOnly"],
  });
  harness.finishEditorSave();
  await flushPlugin();
  await flushPlugin();
  expect(harness.requests[0]?.url).toEndWith("/correction/workspace");
  expect(JSON.parse(harness.requests[0].body)).toEqual({
    documentKey: "document-key",
    data: {},
    pdmsCatalogSessionId: "catalog-session",
    pdmsSelection: {
      bindingId: "folio_project",
      name: "Current project",
      sessionId: "catalog-session",
    },
  });
  expect(
    harness.messages.findLast(({ message }) => message.type === "operation")
      .message
  ).toMatchObject({ action: "save-correction-workspace", status: "completed" });
  expect(
    harness.methodInvocations.some(
      ({ method, args }) =>
        method === "SetEditingRestrictions" && args?.[0] === "none"
    )
  ).toBe(false);
});
