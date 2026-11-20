import { expect, test } from "bun:test";

import { attachCategoryPopup } from "./attachment-category-popup-harness.js";
import { acknowledgeBridge, createHarness, flushPlugin } from "./harness.js";

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const control = (harness, label) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === label
  )?.children[1];
const button = (harness, text) =>
  descendants(harness.body).find(
    (node) => node.tagName === "BUTTON" && node.textContent === text
  );
const savedChoice = {
  category: null,
  document_category_id: 1,
  mode: "template",
  storage_template_id: "saved-template",
  template_name: "หมวดเดิม",
};

test("category dialog preserves a saved destination through an outage and a renamed upstream list without writing on cancel", async () => {
  const state = {
    fields: [
      {
        anchor: "folio_proof",
        attachment: savedChoice,
        computed: false,
        id: "folio_proof",
        key: "attachment_1",
        label: "หลักฐาน",
        options: [],
        placeholder: null,
        prefillPointer: null,
        prefillPolicy: "editable",
        required: false,
        type: "text",
      },
    ],
    table: null,
    version: 1,
  };
  let categories = [{ id: 2, type: "หมวดใหม่" }];
  const templates = [
    { document_category_id: 1, id: "saved-template", template_name: "หมวดเดิม" },
    { document_category_id: 2, id: "new-template", template_name: "หมวดใหม่" },
  ];
  let outage = true;
  const response = (url) => {
    if (String(url).endsWith("/attachment-categories")) {
      return outage
        ? {
            body: { error: "ecm_unavailable", message: "ระบบเอกสารแนบไม่พร้อม" },
            httpStatus: 503,
          }
        : { categories, templates };
    }
    return { bindings: state, documentKey: "document-key", revision: 0 };
  };
  const harness = createHarness({
    action: "template-edit",
    attachmentCategoryPopupChannelId: "category-channel",
    capabilityResponses: Array.from(
      { length: 30 },
      () => "configure-fields-capability"
    ),
    documentKind: "xlsx",
    responses: Array.from({ length: 30 }, () => response),
    serializeCommands: true,
    spreadsheetBindings: state,
    spreadsheetSelection: {
      address: "B3",
      names: { folio_proof: "'Sheet1'!$B$3" },
    },
  });
  const popup = attachCategoryPopup(harness);
  acknowledgeBridge(harness);
  await flushPlugin();
  button(harness, "เปลี่ยนหมวด").click();
  await flushPlugin();
  const category = control(popup, "หมวดหมู่จัดเก็บเอกสาร");
  expect(category.disabled).toBe(true);
  expect(button(popup, "ยืนยันและบันทึก").disabled).toBe(true);
  expect(state.fields[0].attachment).toEqual(savedChoice);
  button(popup, "ยกเลิก").click();
  await flushPlugin();
  outage = false;
  button(harness, "เปลี่ยนหมวด").click();
  await flushPlugin();
  const refreshed = control(popup, "หมวดหมู่จัดเก็บเอกสาร");
  expect(refreshed.value).toBe("");
  expect(refreshed.children.map((option) => option.value)).toEqual(["", "2"]);
  expect(button(popup, "ยืนยันและบันทึก").disabled).toBe(true);
  expect(state.fields[0].attachment).toEqual(savedChoice);
  button(popup, "ยกเลิก").click();
  await flushPlugin();
  expect(popup.methodInvocations).toContainEqual({
    args: ["asc.test-plugin", 430, 430, true],
    method: "ShowInputHelper",
  });
  expect(popup.methodCalls).toContain("UnShowInputHelper");
  expect(
    descendants(harness.body).some((node) => node.tagName === "DIALOG")
  ).toBe(false);
  categories = [
    { id: 1, type: "หมวดเดิม" },
    { id: 2, type: "หมวดใหม่" },
  ];
  button(harness, "เปลี่ยนหมวด").click();
  await flushPlugin();
  expect(control(popup, "หมวดหมู่จัดเก็บเอกสาร").value).toBe("1");
  expect(button(popup, "ยืนยันและบันทึก").disabled).toBe(false);
  const categorySelect = control(popup, "หมวดหมู่จัดเก็บเอกสาร");
  const templateSelect = control(popup, "แม่แบบจัดเก็บเอกสาร");
  categorySelect.value = "2";
  categorySelect.dispatchEvent({ type: "change" });
  expect(templateSelect.value).toBe("");
  expect(button(popup, "ยืนยันและบันทึก").disabled).toBe(true);
  expect(templateSelect.children.map((option) => option.value)).toEqual([
    "",
    "new-template",
  ]);
  templates.splice(0, 1);
  button(popup, "ยกเลิก").click();
  await flushPlugin();
  button(harness, "เปลี่ยนหมวด").click();
  await flushPlugin();
  expect(
    control(popup, "หมวดหมู่จัดเก็บเอกสาร").children.map((option) => option.value)
  ).toEqual(["", "2"]);
  expect(button(popup, "ยืนยันและบันทึก").disabled).toBe(true);
  button(popup, "ยกเลิก").click();
  await flushPlugin();
  expect(popup.requests).toEqual([]);
  expect(
    harness.requests.filter((request) => request.method !== "GET")
  ).toEqual([]);
});
