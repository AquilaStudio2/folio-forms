// oxlint-disable sort-keys -- Fixture scopes follow their user-visible catalog fields.
import { expect, test } from "bun:test";

import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const pickerHarness = (options) =>
  createHarness({
    pdmsPopupChannelId: "popup-channel",
    spreadsheetSelection: {
      address: "A1",
      names: { folio_project: "'Form'!$A$1" },
      sheet: "Form",
    },
    ...options,
  });
const popup = (harness, type, extra = {}) =>
  harness.dispatch({
    data: {
      bridgeId: harness.bridgeId,
      channelId: "popup-channel",
      documentKey: "document-key",
      instanceId: "popup",
      sequence: 1,
      source: "folio-pdms-popup-host",
      type,
      ...extra,
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
const state = (harness) =>
  harness.messages.findLast(
    ({ message }) => message.type === "pdms-popup-state"
  )?.message.state;
const locate = async (harness) => {
  popup(harness, "locate");
  await flushPlugin();
};
const choose = (harness, name) =>
  popup(harness, "choose", { name, token: state(harness).target.token });
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
  const harness = pickerHarness({
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
          lastColumn: 0,
        },
      },
    },
    spreadsheetSelection: {
      address: "A5",
      names: { folio_body: "'Form'!$A$4:$A$6" },
      sheet: "Form",
    },
    responses: [
      { operationId: "picker-save", operationCapability: "poll-capability" },
      completedOperation({ documentKey: "next-document" }),
    ],
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  await locate(harness);
  expect(state(harness).target.row).toEqual({
    index: 1,
    documentKey: "document-key",
  });
  choose(harness, "Project B");
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

test("an adjacent choice uses native freeze and flush before saving and keeps editing frozen until reload", async () => {
  const harness = pickerHarness({
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
  await locate(harness);
  const methodCount = harness.methodInvocations.length;
  expect(harness.requests).toHaveLength(0);
  choose(harness, "โครงการ ก");
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
    harness.methodInvocations
      .slice(methodCount)
      .some(
        ({ method, args }) =>
          method === "SetEditingRestrictions" && args?.[0] === "none"
      )
  ).toBe(false);
});

test("failed picker saving keeps the current editor and permits retry", async () => {
  const harness = pickerHarness({
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
  await locate(harness);
  choose(harness, "โครงการ ก");
  await flushPlugin();
  await flushPlugin();
  expect(harness.methodInvocations).toContainEqual({
    args: ["none"],
    method: "SetEditingRestrictions",
  });
  expect(state(harness)).toMatchObject({
    busy: false,
    target: { bindingId: "folio_project" },
  });
  expect(
    harness.messages.some(
      ({ message }) =>
        message.type === "operation" && message.status === "completed"
    )
  ).toBe(false);
});

test("Retry recovers a failed catalog without saving or replacing the current editor", async () => {
  const harness = pickerHarness({
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
  await locate(harness);
  expect(state(harness).catalog.status).toBe("error");
  const methodCount = harness.methodInvocations.length;
  popup(harness, "retry", { token: state(harness).target.token });
  await flushPlugin();
  expect(harness.requests).toHaveLength(1);
  expect(harness.requests[0].url).toEndWith(
    "/api/editor/pdms-project-catalog/retry"
  );
  expect(JSON.parse(harness.requests[0].body)).toEqual({
    documentKey: "document-key",
    sessionId: "catalog-session",
  });
  expect(state(harness).catalog).toMatchObject({
    status: "ready",
    names: ["โครงการหลังคืนบริการ"],
  });
  expect(harness.saveCalls).toHaveLength(0);
  expect(
    harness.methodInvocations
      .slice(methodCount)
      .some(({ method }) => method === "SetEditingRestrictions")
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
  const harness = pickerHarness({
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
  await locate(harness);
  const methodCount = harness.methodInvocations.length;
  popup(harness, "retry", { token: state(harness).target.token });
  await flushPlugin();
  expect(state(harness).catalog.names).toEqual(["ชื่อจากตัวแก้ไขใหม่"]);
  expect(
    harness.window.FormBridge.getRuntimeOptions().pdmsProjectCatalog.sessionId
  ).toBe("replacement-catalog");
  expect(harness.requests).toHaveLength(0);
  expect(harness.saveCalls).toHaveLength(0);
  expect(
    harness.methodInvocations
      .slice(methodCount)
      .some(({ method }) => method === "SetEditingRestrictions")
  ).toBe(false);
});

test("a choice started before lease replacement is rejected while the new catalog becomes usable in the same editor", async () => {
  const harness = pickerHarness({
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
  await locate(harness);
  choose(harness, "ชื่อเดิม");
  await flushPlugin();
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  expect(state(harness)).toMatchObject({
    busy: false,
    catalog: { status: "ready", names: ["ชื่อปัจจุบัน"] },
    target: { bindingId: "folio_project" },
  });
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
  const harness = pickerHarness({
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
  await locate(harness);
  const methodCount = harness.methodInvocations.length;
  choose(harness, "Current project");
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
    harness.methodInvocations
      .slice(methodCount)
      .some(({ method }) => method === "SetEditingRestrictions")
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
    harness.methodInvocations
      .slice(methodCount)
      .some(
        ({ method, args }) =>
          method === "SetEditingRestrictions" && args?.[0] === "none"
      )
  ).toBe(false);
});
