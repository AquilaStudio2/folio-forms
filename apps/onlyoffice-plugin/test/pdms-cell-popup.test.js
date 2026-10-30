import { expect, test } from "bun:test";

import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
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

test("Admin creates a merged-cell project dropdown with one button and saves all native work before activation", async () => {
  const initial = { fields: [], table: null, version: 1 };
  let created;
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write", "save"],
    documentKind: "xlsx",
    holdEditorSave: true,
    pdmsProjectEnabled: true,
    responses: [
      { bindings: initial, documentKey: "document-key", revision: 0 },
      (_url, request) => {
        created = JSON.parse(request.body).change.value;
        return {
          bindings: { ...initial, fields: [created] },
          documentKey: "document-key",
          revision: 1,
        };
      },
      { operationCapability: "poll", operationId: "source-created" },
      completedOperation({ documentKey: "next-template" }),
    ],
    spreadsheetBindings: initial,
    spreadsheetSelection: { address: "A2:B2", sheet: "Form" },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const create = descendants(harness.body).find(
    (node) =>
      node.tagName === "BUTTON" &&
      node.textContent === "สร้าง dropdown ชื่อโครงการ"
  );
  expect(create).toBeDefined();
  create.click();
  await flushPlugin();
  await flushPlugin();
  expect(created).toMatchObject({
    key: "field_1",
    label: "ช่อง A2:B2",
    options: [],
    source: "pdms-project-name",
    type: "dropdown",
  });
  expect(
    harness.requests.some((request) => request.url.endsWith("/save"))
  ).toBe(false);
  harness.finishEditorSave();
  await flushPlugin();
  await flushPlugin();
  const saved = harness.requests.find((request) =>
    request.url.endsWith("/save")
  );
  expect(saved).toBeDefined();
  expect(JSON.parse(saved.body)).toMatchObject({
    documentKey: "document-key",
    spreadsheetAnchors: [[created.anchor, "'Form'!A2:B2"]],
  });
  expect(JSON.parse(saved.body).preserveEditorSession).toBeUndefined();
});

test.each([false, true])(
  "the create button preserves an existing column's Title/Tag/id and is idempotent when source=%s",
  async (alreadySource) => {
    const column = {
      id: "folio_column",
      key: "stable_project",
      label: "Stable project title",
      offset: 0,
      type: alreadySource ? "dropdown" : "text",
      ...(alreadySource ? { source: "pdms-project-name" } : {}),
      options: [],
      required: true,
    };
    const table = {
      anchor: "folio_body",
      columns: [column],
      id: "folio_table",
      key: "projects",
      label: "Projects",
    };
    const initial = { fields: [], table, version: 1 };
    let persisted;
    const harness = createHarness({
      action: "template-edit",
      capabilityResponses: alreadySource
        ? ["read", "save"]
        : ["read", "write", "save"],
      documentKind: "xlsx",
      pdmsProjectEnabled: true,
      responses: [
        { bindings: initial, documentKey: "document-key", revision: 0 },
        ...(alreadySource
          ? []
          : [
              (_url, request) => {
                persisted = JSON.parse(request.body).change;
                return {
                  bindings: {
                    ...initial,
                    table: { ...table, columns: [persisted.value] },
                  },
                  documentKey: "document-key",
                  revision: 1,
                };
              },
            ]),
        { operationCapability: "poll", operationId: "source-created" },
        completedOperation({ documentKey: "next-template" }),
      ],
      spreadsheetBindings: initial,
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
    descendants(harness.body)
      .find((node) => node.textContent === "สร้าง dropdown ชื่อโครงการ")
      .click();
    await flushPlugin();
    await flushPlugin();
    const patches = harness.requests.filter(
      (request) => request.method === "PATCH"
    );
    expect(patches).toHaveLength(alreadySource ? 0 : 1);
    if (!alreadySource) {
      expect(persisted).toMatchObject({
        kind: "column",
        value: {
          id: "folio_column",
          key: "stable_project",
          label: "Stable project title",
          offset: 0,
          required: true,
          source: "pdms-project-name",
          type: "dropdown",
        },
      });
    }
    expect(
      harness.requests.some((request) => request.url.endsWith("/save"))
    ).toBe(true);
  }
);

test("a server-validated legacy source column without tracking names opens at its saved physical row", async () => {
  const harness = createHarness({
    documentKind: "xlsx",
    pdmsPopupChannelId: "popup-channel",
    pdmsProjectCatalog: {
      names: ["00123"],
      sessionId: "catalog",
      status: "ready",
    },
    spreadsheetBindings: {
      fields: [],
      locations: {
        folio_body: {
          firstColumn: 0,
          firstRow: 3,
          lastColumn: 2,
          lastRow: 6,
          sheet: "Form",
        },
      },
      table: {
        anchor: "folio_body",
        columns: [
          { ...project, id: "folio_project", key: "project", offset: 0 },
          { ...project, id: "folio_second", key: "second_project", offset: 1 },
          {
            id: "folio_row_note",
            key: "note",
            label: "Note",
            offset: 2,
            type: "text",
          },
        ],
        id: "folio_table",
        key: "projects",
        label: "Projects",
      },
      version: 1,
    },
    spreadsheetSelection: {
      address: "A5",
      names: { folio_body: "'Form'!$A$4:$C$7" },
      sheet: "Form",
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  popup(harness, "locate");
  await flushPlugin();
  expect(state(harness).target).toMatchObject({
    bindingId: "folio_project",
    key: "projects.project",
    row: { documentKey: "document-key", index: 1 },
  });
  expect(harness.requests).toHaveLength(0);
});

const tableTarget = async ({
  names,
  address = "A5",
  lastRow = 6,
  trusted = true,
}) => {
  const harness = createHarness({
    documentKind: "xlsx",
    pdmsPopupChannelId: "popup-channel",
    pdmsProjectCatalog: {
      names: ["00123"],
      sessionId: "catalog",
      status: "ready",
    },
    spreadsheetBindings: {
      fields: [],
      locations: trusted
        ? {
            folio_body: {
              firstColumn: 0,
              firstRow: 3,
              lastColumn: 2,
              lastRow,
              sheet: "Form",
            },
          }
        : {},
      table: {
        anchor: "folio_body",
        columns: [
          { ...project, id: "folio_project", key: "project", offset: 0 },
          { ...project, id: "folio_second", key: "second_project", offset: 1 },
          {
            id: "folio_row_note",
            key: "note",
            label: "Note",
            offset: 2,
            type: "text",
          },
        ],
        id: "folio_table",
        key: "projects",
        label: "Projects",
      },
      version: 1,
    },
    spreadsheetSelection: { address, names, sheet: "Form" },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  popup(harness, "locate");
  await flushPlugin();
  return { harness, target: state(harness).target };
};
const trackedNames = {
  folio_body: "'Form'!$A$4:$C$7",
  folio_column_folio_project: "'Form'!$A$4:$A$7",
  folio_column_folio_row_note: "'Form'!$C$4:$C$7",
  folio_column_folio_second: "'Form'!$B$4:$B$7",
  folio_columns_folio_table: "'Form'!$A$4:$C$7",
};

test.each([
  {
    label: "an untracked body moves to different rows",
    names: { folio_body: "'Form'!$A$5:$C$8" },
  },
  {
    label: "an untracked body changes width",
    names: { folio_body: "'Form'!$A$4:$D$7" },
  },
  {
    label: "an untracked table has no server-resolved body",
    names: { folio_body: "'Form'!$A$4:$C$7" },
    trusted: false,
  },
  {
    label: "tracked column B disappears",
    names: { ...trackedNames, folio_column_folio_second: null },
  },
  {
    label: "the tracking marker disappears",
    names: { ...trackedNames, folio_columns_folio_table: null },
  },
  {
    label: "an ordinary tracked column conflicts with source A",
    names: { ...trackedNames, folio_column_folio_row_note: "'Form'!$A$4:$A$7" },
  },
])("a table popup stays closed when $label", async (scenario) => {
  const { harness, target } = await tableTarget(scenario);
  expect(target).toBeNull();
  expect(harness.requests).toHaveLength(0);
});

test.each([
  {
    address: "A8",
    index: 4,
    label: "a valid legacy table grows",
    lastRow: 7,
    names: { folio_body: "'Form'!$A$4:$C$8" },
  },
  {
    address: "A8",
    index: 4,
    label: "a tracked table grows beyond its column anchors",
    lastRow: 7,
    names: { ...trackedNames, folio_body: "'Form'!$A$4:$C$8" },
  },
  {
    address: "A5",
    index: 1,
    label: "a tracked column anchor spans only its first body row",
    names: { ...trackedNames, folio_column_folio_project: "'Form'!$A$4" },
  },
])(
  "a source popup covers the complete physical body when $label",
  async (scenario) => {
    const { harness, target } = await tableTarget(scenario);
    expect(target).toMatchObject({
      bindingId: "folio_project",
      row: { documentKey: "document-key", index: scenario.index },
    });
    expect(harness.requests).toHaveLength(0);
  }
);
