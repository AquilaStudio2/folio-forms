import { expect, test } from "bun:test";

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
const change = (harness, caption, value) => {
  const input = control(harness, caption);
  input.value = value;
  input.dispatchEvent({ type: "change" });
};
const create = async (harness) => {
  descendants(harness.body)
    .find(
      (node) =>
        node.tagName === "BUTTON" &&
        ["เพิ่มช่องจากช่วงที่เลือก", "บันทึกการแก้ไข"].includes(node.textContent)
    )
    .click();
  await flushPlugin();
  await flushPlugin();
};
const initialField = {
  anchor: "folio_project",
  computed: false,
  id: "folio_project",
  key: "project_name",
  label: "ชื่อโครงการ",
  options: [],
  type: "text",
};
const draftHarness = async ({
  bindings = { fields: [], table: null, version: 1 },
  selection = { address: "E10", sheet: "Form" },
} = {}) => {
  const changes = [];
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write", "save"],
    documentKind: "xlsx",
    holdEditorSave: true,
    pdmsProjectEnabled: true,
    responses: [
      { bindings, documentKey: "document-key", revision: 0 },
      (_url, request) => {
        const mutation = JSON.parse(request.body).change;
        changes.push(mutation);
        return {
          bindings:
            mutation.kind === "column"
              ? {
                  ...bindings,
                  table: {
                    ...bindings.table,
                    columns: [mutation.value],
                  },
                }
              : { ...bindings, fields: [mutation.value] },
          documentKey: "document-key",
          revision: 1,
        };
      },
      { operationCapability: "poll", operationId: "source-created" },
      completedOperation({ documentKey: "next-template" }),
    ],
    spreadsheetBindings: bindings,
    spreadsheetSelection: selection,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  return { changes, harness };
};

test.each(["type", "metadata"])(
  "one-click project creation saves the selected empty cell's pending %s",
  async (pending) => {
    const { changes, harness } = await draftHarness();
    change(harness, "ชนิดข้อมูล", "pdms-project-name");
    if (pending === "metadata") {
      change(harness, "Title · ชื่อช่อง", "โครงการที่ดำเนินการ");
      change(harness, "Tag · รหัสช่อง", "selected_project");
      change(harness, "คำแนะนำในเซลล์ · Placeholder (ไม่บังคับ)", "เลือกโครงการ");
    }
    await create(harness);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "field",
      value: {
        key: pending === "metadata" ? "selected_project" : "field_1",
        label: pending === "metadata" ? "โครงการที่ดำเนินการ" : "ช่อง E10",
        source: "pdms-project-name",
        type: "dropdown",
        ...(pending === "metadata" ? { placeholder: "เลือกโครงการ" } : {}),
      },
    });
    expect(
      harness.requests.some((request) => request.url.endsWith("/save"))
    ).toBe(false);
    harness.finishEditorSave();
    await flushPlugin();
    await flushPlugin();
    expect(
      harness.requests.some((request) => request.url.endsWith("/save"))
    ).toBe(true);
  }
);

test.each(["field", "column"])(
  "the create button saves pending metadata of an existing project %s without replacing its identity",
  async (kind) => {
    const source = {
      ...initialField,
      source: "pdms-project-name",
      type: "dropdown",
    };
    const bindings = {
      fields: kind === "field" ? [source] : [],
      table:
        kind === "column"
          ? {
              anchor: "folio_body",
              columns: [{ ...source, offset: 0 }],
              id: "folio_table",
              key: "projects",
              label: "Projects",
            }
          : null,
      version: 1,
    };
    const { changes, harness } = await draftHarness({
      bindings,
      selection: {
        address: "E10",
        names:
          kind === "field"
            ? { folio_project: "'Form'!$E$10" }
            : {
                folio_body: "'Form'!$E$10:$E$12",
                folio_column_folio_project: "'Form'!$E$10:$E$12",
                folio_columns_folio_table: "'Form'!$E$10:$E$12",
              },
        sheet: "Form",
      },
    });
    change(harness, "Title · ชื่อช่อง", "แก้ไขชื่อช่องโครงการ");
    await create(harness);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind,
      value: {
        id: source.id,
        key: source.key,
        label: "แก้ไขชื่อช่องโครงการ",
        source: source.source,
        type: source.type,
      },
    });
    harness.finishEditorSave();
    await flushPlugin();
    await flushPlugin();
    expect(
      harness.requests.some((request) => request.url.endsWith("/save"))
    ).toBe(true);
  }
);

test("pending settings at another cell block creation and remain available", async () => {
  const selection = { address: "D10", sheet: "Form" };
  const { changes, harness } = await draftHarness({ selection });
  change(harness, "Title · ชื่อช่อง", "ยังไม่บันทึกช่องเดิม");
  selection.address = "E10";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  change(harness, "ชนิดข้อมูล", "pdms-project-name");
  await create(harness);
  expect(changes).toHaveLength(0);
  expect(
    harness.requests.some(
      (request) => request.method === "PATCH" || request.url.endsWith("/save")
    )
  ).toBe(false);
  expect(
    harness.messages.some(
      ({ message }) => message.type === "editor-save-request"
    )
  ).toBe(false);
  expect(harness.statusElement.textContent).toContain("ยังไม่ได้บันทึก");
  selection.address = "D10";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("ยังไม่บันทึกช่องเดิม");
});

test("project creation retains invalid pending metadata without a mutation or native save", async () => {
  const { changes, harness } = await draftHarness();
  change(harness, "Tag · รหัสช่อง", "invalid tag");
  await create(harness);
  expect(changes).toHaveLength(0);
  expect(
    harness.requests.some(
      (request) => request.method === "PATCH" || request.url.endsWith("/save")
    )
  ).toBe(false);
  expect(
    harness.messages.some(
      ({ message }) => message.type === "editor-save-request"
    )
  ).toBe(false);
  expect(harness.statusElement.textContent).toContain("Tag ต้องเริ่ม");
  expect(control(harness, "Tag · รหัสช่อง").value).toBe("invalid tag");
});

test("the main save button keeps ordinary Field setup without forcing a project source or template autosave", async () => {
  const { changes, harness } = await draftHarness();
  change(harness, "Title · ชื่อช่อง", "ช่องข้อความทั่วไป");
  await create(harness);
  expect(changes).toHaveLength(1);
  expect(changes[0].value).toMatchObject({
    label: "ช่องข้อความทั่วไป",
    type: "text",
  });
  expect(changes[0].value.source).toBeUndefined();
  expect(
    harness.requests.some((request) => request.url.endsWith("/save"))
  ).toBe(false);
  expect(
    harness.messages.some(
      ({ message }) => message.type === "editor-save-request"
    )
  ).toBe(false);
});
