import { expect, test } from "bun:test";

import { selectedUploadPocTarget } from "../src/spreadsheet-upload-poc.js";
import { acknowledgeBridge, createHarness, flushPlugin } from "./harness.js";

const field = {
  anchor: "folio_receipt",
  computed: false,
  id: "folio_receipt",
  key: "receipt",
  required: true,
  type: "text",
};
const bindings = {
  fields: [field],
  table: {
    anchor: "folio_items",
    columns: [
      {
        computed: false,
        id: "folio_proof",
        key: "proof",
        offset: 0,
        type: "text",
      },
    ],
    id: "folio_items",
    key: "items",
  },
};
const selection = (address) => ({
  address,
  anchors: [
    ["folio_receipt", "'Sheet1'!$B$2:$C$3"],
    ["folio_items", "'Sheet1'!$B$5:$C$7"],
  ],
  sheet: "Sheet1",
});

const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const pocAction = (harness) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "BUTTON" &&
      node.textContent === "วางปุ่มและบันทึกต้นแบบ (POC)"
  );

test("POC placement action appears only in template editing and declares pending-file scope", async () => {
  const admin = createHarness({
    action: "template-edit",
    documentKind: "xlsx",
  });
  await flushPlugin();
  expect(pocAction(admin)).toBeDefined();
  // Native button semantics provide Tab focus and Enter/Space activation;
  // the harness verifies markup, not a browser's keyboard event synthesis.
  expect(pocAction(admin).type).toBe("button");
  expect(pocAction(admin).disabled).toBe(false);
  expect(pocAction(admin)["aria-describedby"]).toBe(
    "spreadsheet-upload-poc-help"
  );
  expect(
    descendants(admin.body).find(
      (node) => node.id === "spreadsheet-upload-poc-help"
    )?.textContent
  ).toContain("ยังไม่อัปโหลดหรือบันทึกถาวร");
  expect(
    descendants(admin.body).some((node) =>
      node.textContent?.includes("ยังไม่อัปโหลดหรือบันทึกถาวร")
    )
  ).toBe(true);
  const user = createHarness({ action: "fill", documentKind: "xlsx" });
  await flushPlugin();
  expect(pocAction(user)).toBeUndefined();
});

test("POC placement refuses unapplied panel changes before sending a server request", async () => {
  const harness = createHarness({
    action: "template-edit",
    documentKind: "xlsx",
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const [, caption] = descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" &&
      node.children[0]?.textContent === "Title · ชื่อช่อง"
  ).children;
  caption.value = "unsaved panel change";
  caption.dispatchEvent({ type: "input" });
  pocAction(harness).dispatchEvent({ type: "click" });
  await flushPlugin();
  expect(harness.requests).toHaveLength(0);
  expect(harness.statusElement.textContent).toContain("ยังไม่ได้");
});

test("invalid multi-cell POC selection creates no workbook marker and makes no mutation request", async () => {
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["configure-fields-capability"],
    documentKind: "xlsx",
    responses: [
      { bindings: { fields: [], table: null, version: 1 }, revision: 0 },
    ],
    spreadsheetSelection: { address: "A1:B2" },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  pocAction(harness).dispatchEvent({ type: "click" });
  await flushPlugin();
  expect(harness.statusElement.textContent).toContain("หนึ่งเซลล์");
  expect([...harness.spreadsheetNames.keys()]).toHaveLength(0);
  expect(harness.requests).toHaveLength(1);
  expect(harness.requests[0].method).toBe("GET");
});

test("POC scalar target keeps configured identity and leaves required rules unchanged", () => {
  const before = JSON.stringify(bindings);
  expect(selectedUploadPocTarget(selection("B2:C3"), bindings)).toEqual({
    anchor: "folio_receipt",
    bindingId: "folio_receipt",
    kind: "field",
    sheet: "Sheet1",
    tag: "receipt",
  });
  expect(JSON.stringify(bindings)).toBe(before);
});

test("POC table target uses the tracked column anchor and dotted tag", () => {
  expect(selectedUploadPocTarget(selection("B6"), bindings)).toEqual({
    anchor: "folio_column_folio_proof",
    bindingId: "folio_proof",
    bodyAnchor: "folio_items",
    columnOffset: 0,
    kind: "column",
    sheet: "Sheet1",
    tag: "items.proof",
  });
});

test("POC refuses unconfigured selection, whole table, incompatible type and formula", () => {
  expect(() => selectedUploadPocTarget(selection("E1"), bindings)).toThrow(
    "ตั้งค่าไว้"
  );
  expect(() => selectedUploadPocTarget(selection("B5:C7"), bindings)).toThrow(
    "คอลัมน์เดียว"
  );
  for (const change of [{ type: "picture" }, { computed: true }]) {
    expect(() =>
      selectedUploadPocTarget(selection("B2"), {
        ...bindings,
        fields: [{ ...field, ...change }],
      })
    ).toThrow("ช่องข้อความ");
  }
});

test("POC selection follows tracked moved column identity", () => {
  const moved = selection("C6");
  moved.anchors.push(
    ["folio_columns_folio_items", "'Sheet1'!$B$5:$C$7"],
    ["folio_column_folio_proof", "'Sheet1'!$C$5:$C$7"]
  );
  expect(selectedUploadPocTarget(moved, bindings).bindingId).toBe(
    "folio_proof"
  );
});

test.each([
  ["delete", true],
  ["delete", false],
  ["type", true],
  ["type", false],
])(
  "POC marker cleanup participates in %s transaction rollback: %s",
  async (action, accepted) => {
    const initial = {
      fields: [{ ...field, label: "Receipt", options: [] }],
      table: null,
      version: 1,
    };
    const changed = {
      ...initial,
      fields:
        action === "delete" ? [] : [{ ...initial.fields[0], type: "number" }],
    };
    const harness = createHarness({
      action: "template-edit",
      capabilityResponses: ["read", "write", "verify"],
      documentKind: "xlsx",
      responses: [
        { bindings: initial, revision: 0 },
        ...(accepted
          ? [{ bindings: changed, revision: 1 }]
          : [
              { body: { error: "Conflicting deletion" }, httpStatus: 409 },
              { bindings: initial, revision: 0 },
            ]),
      ].map((response) =>
        response.bindings
          ? { documentKey: "document-key", ...response }
          : response
      ),
      spreadsheetBindings: initial,
      spreadsheetSelection: {
        address: "B2",
        names: {
          _folio_upload_poc_folio_receipt: "'Sheet1'!$B$2",
          folio_receipt: "'Sheet1'!$B$2",
          unrelated: "'Sheet1'!$E$1",
        },
      },
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    if (action === "type") {
      const [, control] = descendants(harness.body).find(
        (node) =>
          node.tagName === "LABEL" &&
          node.children[0]?.textContent === "ชนิดข้อมูล"
      ).children;
      control.value = "number";
    }
    descendants(harness.body)
      .find(
        (node) =>
          node.tagName === "BUTTON" &&
          node.textContent === (action === "delete" ? "ลบช่องนี้" : "บันทึกการแก้ไข")
      )
      .dispatchEvent({ type: "click" });
    await flushPlugin();
    await flushPlugin();
    expect(
      harness.spreadsheetNames.has("_folio_upload_poc_folio_receipt")
    ).toBe(!accepted);
    expect(harness.spreadsheetNames.has("folio_receipt")).toBe(
      action === "type" || !accepted
    );
    expect(harness.spreadsheetNames.get("unrelated")).toBe("'Sheet1'!$E$1");
  }
);
