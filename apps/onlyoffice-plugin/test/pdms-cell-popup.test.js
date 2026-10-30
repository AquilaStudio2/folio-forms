import { expect, test } from "bun:test";

import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const project = {
  anchor: "folio_project",
  id: "folio_project",
  key: "project_name",
  label: "ชื่อโครงการ",
  options: [],
  source: "pdms-project-name",
  type: "dropdown",
};
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

test("clicking a merged project cell captures its mapped target and saves only a committed adjacent-popup choice", async () => {
  const harness = createHarness({
    capabilityResponses: ["save-capability"],
    documentKind: "xlsx",
    holdEditorSave: true,
    pdmsPopupChannelId: "popup-channel",
    pdmsProjectCatalog: {
      names: ["โครงการ ก"],
      sessionId: "catalog",
      status: "ready",
    },
    responses: [
      { operationCapability: "poll-capability", operationId: "popup-save" },
      completedOperation({ documentKey: "next-document" }),
    ],
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
    spreadsheetSelection: {
      address: "A2:B2",
      names: { folio_project: "'Form'!$A$2:$B$2" },
      sheet: "Form",
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  popup(harness, "locate");
  await flushPlugin();
  expect(state(harness)?.target).toMatchObject({
    key: "project_name",
    label: "ชื่อโครงการ",
  });
  expect(harness.requests).toHaveLength(0);
  popup(harness, "choose", {
    name: "โครงการ ก",
    token: state(harness).target.token,
  });
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  harness.finishEditorSave();
  await flushPlugin();
  await flushPlugin();
  expect(JSON.parse(harness.requests[0].body)).toMatchObject({
    pdmsSelection: {
      bindingId: "folio_project",
      name: "โครงการ ก",
      sessionId: "catalog",
    },
  });
});

test("a popup choice captures the clicked physical table row and stale selections cannot write a neighboring row", async () => {
  const selected = {
    address: "B5",
    names: {
      folio_body: "'Form'!$A$4:$C$6",
      folio_column_folio_column: "'Form'!$B$4:$B$6",
      folio_columns_folio_table: "'Form'!$A$4:$C$6",
    },
    sheet: "Form",
  };
  const harness = createHarness({
    capabilityResponses: ["save-capability"],
    documentKind: "xlsx",
    holdEditorSave: true,
    pdmsPopupChannelId: "popup-channel",
    pdmsProjectCatalog: {
      names: ["00123"],
      sessionId: "catalog",
      status: "ready",
    },
    responses: [
      { operationCapability: "poll-capability", operationId: "popup-save" },
      completedOperation({ documentKey: "next-document" }),
    ],
    spreadsheetBindings: {
      fields: [],
      table: {
        anchor: "folio_body",
        columns: [
          { ...project, id: "folio_column", key: "project", offset: 1 },
        ],
        id: "folio_table",
        key: "projects",
        label: "Projects",
      },
      version: 1,
    },
    spreadsheetSelection: selected,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  popup(harness, "locate");
  await flushPlugin();
  const old = state(harness).target;
  expect(old).toMatchObject({
    key: "projects.project",
    row: { documentKey: "document-key", index: 1 },
  });
  selected.address = "B6";
  popup(harness, "choose", { name: "00123", token: old.token });
  await flushPlugin();
  expect(harness.saveCalls).toHaveLength(0);
  expect(harness.requests).toHaveLength(0);
  popup(harness, "locate", { sequence: 2 });
  await flushPlugin();
  popup(harness, "choose", {
    name: "00123",
    sequence: 2,
    token: state(harness).target.token,
  });
  await flushPlugin();
  harness.finishEditorSave();
  await flushPlugin();
  await flushPlugin();
  expect(JSON.parse(harness.requests[0].body)).toMatchObject({
    pdmsSelection: {
      bindingId: "folio_column",
      name: "00123",
      row: { documentKey: "document-key", index: 2 },
    },
  });
});

test("ordinary and static cells have no project popup and a cancelled same-cell target must be resolved again", async () => {
  const selected = {
    address: "D1",
    names: { folio_project: "'Form'!$A$2:$B$2" },
    sheet: "Form",
  };
  const harness = createHarness({
    documentKind: "xlsx",
    pdmsPopupChannelId: "popup-channel",
    pdmsProjectCatalog: {
      names: ["โครงการ ก"],
      sessionId: "catalog",
      status: "ready",
    },
    spreadsheetBindings: { fields: [project], table: null, version: 1 },
    spreadsheetSelection: selected,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  popup(harness, "locate");
  await flushPlugin();
  expect(state(harness).target).toBeNull();
  selected.address = "A2:B2";
  popup(harness, "locate", { sequence: 2 });
  await flushPlugin();
  const previous = state(harness).target;
  popup(harness, "cancel", { sequence: 2 });
  expect(state(harness).target).toBeNull();
  popup(harness, "choose", {
    name: "โครงการ ก",
    sequence: 2,
    token: previous.token,
  });
  await flushPlugin();
  expect(harness.saveCalls).toHaveLength(0);
  popup(harness, "locate", { sequence: 3 });
  await flushPlugin();
  expect(state(harness).target).toMatchObject({ bindingId: "folio_project" });
  expect(state(harness).target.token).not.toBe(previous.token);
});

test("a one-cell table body still opens its source column rather than requiring a table/row selector", async () => {
  const harness = createHarness({
    documentKind: "xlsx",
    pdmsPopupChannelId: "popup-channel",
    pdmsProjectCatalog: {
      names: ["โครงการ ก"],
      sessionId: "catalog",
      status: "ready",
    },
    spreadsheetBindings: {
      fields: [],
      table: {
        anchor: "folio_body",
        columns: [
          { ...project, id: "folio_column", key: "project", offset: 0 },
        ],
        id: "folio_table",
        key: "projects",
        label: "Projects",
      },
      version: 1,
    },
    spreadsheetSelection: {
      address: "A4",
      names: {
        folio_body: "'Form'!$A$4",
        folio_column_folio_column: "'Form'!$A$4",
        folio_columns_folio_table: "'Form'!$A$4",
      },
      sheet: "Form",
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  popup(harness, "locate");
  await flushPlugin();
  expect(state(harness).target).toMatchObject({
    bindingId: "folio_column",
    row: { documentKey: "document-key", index: 0 },
  });
});
