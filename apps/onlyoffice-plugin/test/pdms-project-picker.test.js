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
