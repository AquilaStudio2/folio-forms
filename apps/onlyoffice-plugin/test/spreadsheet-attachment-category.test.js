import { expect, test } from "bun:test";

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

test("native category controls retain the saved destination during an outage and show only actual loaded choices plus the saved name", async () => {
  const state = {
    fields: [
      {
        anchor: "folio_proof",
        attachment: { category: "หมวดเดิม" },
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
  let outage = true;
  const response = (url) => {
    if (String(url).endsWith("/attachment-categories")) {
      return outage
        ? {
            body: { error: "ecm_unavailable", message: "ระบบเอกสารแนบไม่พร้อม" },
            httpStatus: 503,
          }
        : { categories: ["หมวดใหม่"] };
    }
    return { bindings: state, documentKey: "document-key", revision: 0 };
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
    spreadsheetBindings: state,
    spreadsheetSelection: {
      address: "B3",
      names: { folio_proof: "'Sheet1'!$B$3" },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const category = control(harness, "Document Category");
  expect(category.value).toBe("หมวดเดิม");
  expect(control(harness, "ช่องแนบไฟล์จากปุ่มเดิม").checked).toBe(true);
  button(harness, "โหลด Document Category").dispatchEvent({ type: "click" });
  await flushPlugin();
  expect(category.value).toBe("หมวดเดิม");
  outage = false;
  button(harness, "โหลด Document Category").dispatchEvent({ type: "click" });
  await flushPlugin();
  expect(category.value).toBe("หมวดเดิม");
  expect(category.children.map((option) => option.value)).toEqual([
    "",
    "หมวดใหม่",
    "หมวดเดิม",
  ]);
});
