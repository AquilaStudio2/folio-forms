import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { createOffice } from "../src/office.js";
import {
  spreadsheetSelectionCommand,
  spreadsheetValidationCommand,
  spreadsheetTableSelectedRowCommand,
} from "../src/spreadsheet-commands.js";
import {
  selectionPosition,
  tableSelection,
  selectedBinding,
} from "../src/spreadsheet-selection.js";
import {
  acknowledgeBridge,
  completedOperation,
  createHarness,
  flushPlugin,
} from "./harness.js";

const validationRange = (validation, overrides = {}) => {
  const range = {
    GetAddress: () => "A2",
    GetCol: () => 1,
    GetColumnsCount: () => 1,
    GetNumberFormat: () => "General",
    GetRow: () => 2,
    GetRowsCount: () => 1,
    GetValidation: () => validation,
    GetWorksheet: () => ({ GetRange: () => range }),
    SetNumberFormat: () => true,
    ...overrides,
  };
  return range;
};

test("Excel validation failures show the cell and allow another action", async () => {
  const harness = createHarness({
    capabilityResponses: ["submit-capability", "draft-capability"],
    documentKind: "xlsx",
    responses: [
      { operationCapability: "poll", operationId: "failed-submit" },
      {
        operation: {
          error: "callback_processing_failed",
          errorMessage: "ตรวจสอบช่องกรอกที่ระบุก่อนส่งคำตอบ",
          result: {
            validationErrors: [
              { address: "U2", message: "Required field: name" },
            ],
          },
          status: "failed",
        },
      },
      { operationCapability: "poll", operationId: "saved-draft" },
      completedOperation(),
    ],
  });
  acknowledgeBridge(harness);
  await expect(
    harness.window.FormBridge.runAction("submit")
  ).resolves.toMatchObject({
    error: "ตรวจสอบช่องกรอกที่ระบุก่อนส่งคำตอบ — U2: Required field: name",
    ok: false,
  });
  expect(
    harness.messages.find(({ message }) => message.status === "failed")?.message
      .error
  ).toContain("U2: Required field: name");
  await expect(
    harness.window.FormBridge.runAction("save-draft")
  ).resolves.toMatchObject({ ok: true });
});

test("Excel saves use canonical server extraction and never Word control APIs", async () => {
  const harness = createHarness({
    capabilityResponses: ["action-capability"],
    documentKind: "xlsx",
    responses: [
      { operationCapability: "poll-capability", operationId: "xlsx-save" },
      completedOperation(),
    ],
  });
  acknowledgeBridge(harness);
  await expect(
    harness.window.FormBridge.runAction("save-draft", "", {
      action: "insert",
      index: 2,
    })
  ).resolves.toMatchObject({ ok: true });
  expect(JSON.parse(harness.requests[0].body)).toEqual({
    data: {},
    documentKey: "document-key",
    fillMethod: "onlyoffice",
    responseId: "response-id",
    rowChange: { action: "insert", index: 2 },
  });
  expect(
    harness.methodInvocations.some(
      ({ method, args }) =>
        method.includes("ContentControl") || args?.[0] === "forms"
    )
  ).toBe(false);
});

test("Excel correction saves carry a reason with no browser answers", async () => {
  const harness = createHarness({
    action: "correction",
    capabilityResponses: ["action-capability"],
    documentKind: "xlsx",
    responses: [
      { operationCapability: "poll", operationId: "xlsx-correction" },
      completedOperation(),
    ],
  });
  acknowledgeBridge(harness);
  await expect(
    harness.window.FormBridge.runAction("save-correction", "แก้ไขข้อมูล")
  ).resolves.toMatchObject({ ok: true });
  expect(JSON.parse(harness.requests[0].body)).toEqual({
    data: {},
    documentKey: "document-key",
    reason: "แก้ไขข้อมูล",
  });
});

test("selection offset handles absolute addresses and wide tables", () => {
  expect(selectionPosition("$AG$1050:$AZ$1100")).toEqual({
    column: 32,
    row: 1049,
  });
  expect(() => selectionPosition("A1,B2")).toThrow();
});

test("serialized Excel validation supports numeric zero and nullable boolean rules", () => {
  const additions = [];
  const validation = {
    Add(...args) {
      additions.push(args);
      return validation;
    },
    Delete() {},
    SetErrorMessage() {},
    SetIgnoreBlank(value) {
      expect(value).toBe(true);
    },
    SetInCellDropdown(value) {
      expect(value).toBe(true);
    },
    SetShowError(value) {
      expect(value).toBe(true);
    },
  };
  const api = {
    GetDefName: () => ({
      GetRefersToRange: () => validationRange(validation),
    }),
    GetRange: () => validationRange(validation),
  };
  for (const type of ["number", "boolean"]) {
    runInNewContext(`(${spreadsheetValidationCommand.toString()})()`, {
      Api: api,
      Asc: {
        scope: {
          folioSpreadsheetValidation: {
            anchor: "folio_cell",
            computed: false,
            options: [],
            type,
          },
        },
      },
    });
  }
  expect(additions[0]).toEqual([
    "xlValidateCustom",
    "xlValidAlertStop",
    "xlBetween",
    "=ISNUMBER(A2)",
  ]);
  expect(additions[1]).toEqual([
    "xlValidateList",
    "xlValidAlertStop",
    "xlBetween",
    "TRUE,FALSE",
  ]);
});

test("dropdown options containing Thai text use unquoted interface input", () => {
  const additions = [];
  const validation = {
    Add(...args) {
      additions.push(args);
      return validation;
    },
    Delete() {},
    SetErrorMessage() {},
    SetIgnoreBlank() {},
    SetInCellDropdown() {},
    SetShowError() {},
  };
  const api = {
    GetDefName: () => ({
      GetRefersToRange: () => validationRange(validation),
    }),
  };
  const result = runInNewContext(
    `(${spreadsheetValidationCommand.toString()})()`,
    {
      Api: api,
      Asc: {
        scope: {
          folioSpreadsheetValidation: {
            anchor: "folio_cell",
            computed: false,
            options: ["ชาย", "หญิง"],
            type: "dropdown",
          },
        },
      },
    }
  );
  expect(result).toBe(true);
  expect(additions).toEqual([
    ["xlValidateList", "xlValidAlertStop", "xlBetween", "ชาย,หญิง"],
  ]);
});

const descendants = (node) => [node, ...node.children.flatMap(descendants)];

test("legacy calculated bindings cannot be edited by the manual-only designer", () => {
  const harness = createHarness({
    action: "template-edit",
    documentKind: "xlsx",
    spreadsheetBindings: {
      fields: [
        {
          anchor: "folio_old",
          computed: true,
          id: "folio_old",
          key: "old",
          label: "Legacy calculated",
          options: [],
          required: false,
          type: "number",
        },
      ],
      table: null,
      version: 1,
    },
  });
  const nodes = descendants(harness.body);
  const existing = nodes.find(
    (node) =>
      node.tagName === "SELECT" &&
      node.children.some((item) => item.value === "folio_old")
  );
  existing.value = "folio_old";
  existing.dispatchEvent({ type: "change" });
  expect(
    nodes.find(
      (node) => node.tagName === "BUTTON" && node.textContent === "บันทึกการแก้ไข"
    )?.disabled
  ).toBe(true);
});

test("manual field validation rejects formulas but preserves literal text beginning with equals", () => {
  let formula = "=SUM(A1:A2)";
  let value = "3";
  const range = validationRange(
    { Delete() {} },
    {
      GetFormula: () => formula,
      GetValue: () => value,
    }
  );
  const context = {
    Api: { GetDefName: () => ({ GetRefersToRange: () => range }) },
    Asc: {
      scope: {
        folioSpreadsheetValidation: {
          anchor: "folio_manual",
          computed: false,
          type: "text",
        },
      },
    },
  };
  expect(() =>
    runInNewContext(`(${spreadsheetValidationCommand.toString()})()`, context)
  ).toThrow();
  formula = "=literal text";
  value = "=literal text";
  expect(
    runInNewContext(`(${spreadsheetValidationCommand.toString()})()`, context)
  ).toBe(true);
});

test("a failed Excel save restores transient editing restrictions without clearing unsaved work", async () => {
  const harness = createHarness({
    documentKind: "xlsx",
    editorSaveSupported: false,
  });
  acknowledgeBridge(harness);
  await expect(
    harness.window.FormBridge.runAction("save-draft")
  ).resolves.toMatchObject({ ok: false });
  const restrictions = harness.methodInvocations
    .filter(({ method }) => method === "SetEditingRestrictions")
    .map(({ args }) => args[0]);
  expect(restrictions).toEqual(["readOnly", "none"]);
  expect(harness.requests).toHaveLength(0);
  expect(
    harness.messages.some(
      ({ message }) => message.type === "dirty-state" && message.dirty === false
    )
  ).toBe(false);
});

const control = (harness, caption) =>
  descendants(harness.body).find(
    (node) =>
      node.tagName === "LABEL" && node.children[0]?.textContent === caption
  )?.children[1];
const click = async (harness, caption) => {
  descendants(harness.body)
    .find((node) => node.tagName === "BUTTON" && node.textContent === caption)
    .dispatchEvent({ type: "click" });
  await flushPlugin();
};

test("serialized selection retains valid anchors when another saved name is missing", () => {
  const result = runInNewContext(
    `(${spreadsheetSelectionCommand.toString()})()`,
    {
      Api: {
        GetActiveSheet: () => ({
          GetName: () => "Form",
          GetSelection: () => ({ GetAddress: () => "$E$5" }),
        }),
        GetDefName(name) {
          if (name === "missing") {
            throw new Error("Defined name does not exist:missing");
          }
          return name === "empty" ? null : { GetRefersTo: () => "'Form'!$E$5" };
        },
      },
      Asc: {
        scope: { folioSpreadsheetAnchors: ["missing", "month", "empty"] },
      },
    }
  );
  expect(JSON.parse(result)).toEqual({
    address: "$E$5",
    anchors: [
      ["missing", null],
      ["month", "'Form'!$E$5"],
      ["empty", null],
    ],
    sheet: "Form",
  });
});

test.each(["field", "table", "unfinished table"])(
  "reopened drafts can repair a missing %s anchor without replacing its configuration",
  async (variant) => {
    const category = variant === "field" ? "field" : "table";
    const month = {
      anchor: "month",
      id: "month-id",
      key: "month",
      label: "เดือน",
      options: ["มกราคม", "กุมภาพันธ์"],
      required: true,
      type: "dropdown",
    };
    const missing = {
      anchor: "missing",
      id: "missing-id",
      key: "saved",
      label: "ช่องเดิม",
      options: [],
      required: false,
      type: "text",
    };
    const table = {
      ...missing,
      columns: [
        {
          id: "first",
          key: "first",
          label: "หนึ่ง",
          offset: 0,
          options: [],
          type: "text",
        },
        {
          id: "second",
          key: "second",
          label: "สอง",
          offset: 1,
          options: [],
          type: "text",
        },
      ],
    };
    if (variant === "unfinished table") {
      table.columns = [];
    }
    const bindings = {
      fields: [month, ...(category === "field" ? [missing] : [])],
      table: category === "table" ? table : null,
      version: 1,
    };
    const native = { address: "E5", names: { month: "'Sheet1'!$E$5" } };
    const harness = createHarness({
      action: "template-edit",
      capabilityResponses: ["read", "write"],
      documentKind: "xlsx",
      responses: [
        { bindings, revision: 0 },
        { bindings, revision: 1 },
      ],
      serializeCommands: true,
      spreadsheetBindings: bindings,
      spreadsheetSelection: native,
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    expect(control(harness, "Title · ชื่อช่อง").value).toBe("เดือน");
    expect(
      descendants(harness.body).some((node) =>
        node.textContent.includes("ไม่พบตำแหน่งใน Excel 1")
      )
    ).toBe(true);
    native.address = category === "table" ? "B9:C12" : "B9";
    await harness.window.FormBridge.refreshSelection();
    const existing = control(harness, "ช่องที่บันทึกแล้ว");
    existing.value = missing.id;
    existing.dispatchEvent({ type: "change" });
    expect(control(harness, "Title · ชื่อช่อง").value).toBe("ช่องเดิม");
    await click(harness, "บันทึกการแก้ไข");
    expect(harness.requests).toHaveLength(0);
    expect(harness.spreadsheetNames.has("missing")).toBe(false);
    if (category === "table" && table.columns.length > 0) {
      native.address = "B9";
      await click(harness, "ผูกตำแหน่งใหม่กับช่วงที่เลือก");
      expect(harness.spreadsheetNames.has("missing")).toBe(false);
      native.address = "B9:C12";
      await harness.window.FormBridge.refreshSelection();
      existing.value = missing.id;
      existing.dispatchEvent({ type: "change" });
    }
    await click(harness, "ผูกตำแหน่งใหม่กับช่วงที่เลือก");
    expect(harness.spreadsheetNames.get("missing")).toBe(
      `'Sheet1'!${native.address}`
    );
    expect(harness.spreadsheetNames.get("month")).toBe("'Sheet1'!$E$5");
    expect(harness.requests).toHaveLength(0);
    await click(harness, "บันทึกการแก้ไข");
    const patches = harness.requests.filter(
      (request) => request.method === "PATCH"
    );
    expect(patches).toHaveLength(1);
    expect(JSON.parse(patches[0].body).change).toMatchObject({
      kind: category,
      value: {
        anchor: "missing",
        id: "missing-id",
        key: "saved",
        label: "ช่องเดิม",
      },
    });
    if (category === "table") {
      expect(JSON.parse(patches[0].body).change.value.columns).toEqual(
        table.columns
      );
    }
    native.address = "E5";
    await harness.window.FormBridge.refreshSelection();
    expect(control(harness, "Title · ชื่อช่อง").value).toBe("เดือน");
    expect(
      descendants(harness.body)
        .filter((node) => node.tagName === "LI")
        .map((node) => node.textContent)
    ).toEqual(month.options);
  }
);

test("table mapping explicitly excludes chosen headers and rejects header-only selections", () => {
  expect(tableSelection("$B$3:$D$7", true)).toEqual({
    address: "B4:D7",
    headerAddress: "B3:D3",
    width: 3,
  });
  expect(tableSelection("B3:D7").address).toBe("B3:D7");
  expect(() => tableSelection("B3:D3", true)).toThrow();
  expect(() => tableSelection("A1:XFD8")).toThrow();
});

test("native selection finds saved fields and table columns by live defined names", () => {
  const field = { anchor: "scalar", id: "one" };
  const column = { id: "column", offset: 1 };
  const bindings = {
    fields: [field],
    table: { anchor: "rows", columns: [column] },
  };
  const anchors = [
    ["scalar", "'My Sheet'!$B$2"],
    ["rows", "'My Sheet'!$C$4:$D$8"],
  ];
  expect(
    selectedBinding({ address: "B2", anchors, sheet: "My Sheet" }, bindings)
  ).toEqual(["field", field]);
  expect(
    selectedBinding({ address: "D6", anchors, sheet: "My Sheet" }, bindings)
  ).toEqual(["column", column]);
  expect(
    selectedBinding({ address: "D6", anchors, sheet: "Other" }, bindings)
  ).toBeNull();
});

test("selection editing keeps identity and hidden prefill metadata without accumulating buttons", async () => {
  const field = {
    anchor: "old",
    id: "old",
    key: "name",
    label: "Name",
    options: [],
    prefillPointer: "/customer/name",
    prefillPolicy: "lock_when_available",
    required: false,
    type: "text",
  };
  const bindings = { fields: [field], table: null, version: 1 };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write", "read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 1 },
      { bindings, revision: 1 },
      { bindings, revision: 2 },
    ],
    spreadsheetBindings: bindings,
    spreadsheetSelection: { address: "B2", names: { old: "'Sheet1'!$B$2" } },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Name");
  control(harness, "Title · ชื่อช่อง").value = "Customer name";
  control(harness, "Tag · รหัสช่อง").value = "customer_name";
  const count = descendants(harness.body).filter(
    (node) => node.tagName === "BUTTON"
  ).length;
  await click(harness, "บันทึกการแก้ไข");
  await click(harness, "บันทึกการแก้ไข");
  for (const request of harness.requests.filter(
    (item) => item.method === "PATCH"
  )) {
    expect(JSON.parse(request.body).change.value).toMatchObject({
      anchor: "old",
      id: "old",
      key: "customer_name",
      label: "Customer name",
      prefillPointer: "/customer/name",
      prefillPolicy: "lock_when_available",
    });
  }
  expect(
    harness.requests.filter((request) => request.method === "PATCH")
  ).toHaveLength(2);
  expect(
    descendants(harness.body).filter((node) => node.tagName === "BUTTON")
  ).toHaveLength(count);
});

test.each(["field", "column", "table"])(
  "editing a saved %s locks its category and keeps its identity",
  async (category) => {
    const column = {
      id: "column",
      key: "item_name",
      label: "รายการ",
      offset: 0,
      options: [],
      required: false,
      type: "text",
    };
    const field = {
      anchor: "scalar",
      id: "field",
      key: "name",
      label: "ชื่อ",
      options: [],
      required: false,
      type: "text",
    };
    const table = {
      anchor: "rows",
      columns: [column],
      id: "table",
      key: "items",
      label: "รายการเบิก",
    };
    const bindings = { fields: [field], table, version: 1 };
    const native = {
      address: category === "field" ? "B2" : "A5",
      names: { rows: "'Sheet1'!$A$5:$A$7", scalar: "'Sheet1'!$B$2" },
    };
    const harness = createHarness({
      action: "template-edit",
      capabilityResponses: ["read", "write"],
      documentKind: "xlsx",
      responses: [
        { bindings, revision: 0 },
        { bindings, revision: 1 },
      ],
      spreadsheetBindings: bindings,
      spreadsheetSelection: native,
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    if (category === "table") {
      const existing = control(harness, "ช่องที่บันทึกแล้ว");
      existing.value = table.id;
      existing.dispatchEvent({ type: "change" });
    }
    const kind = control(harness, "กำหนดช่วงที่เลือกเป็น");
    expect(kind.disabled).toBe(true);
    expect(kind.value).toBe(category);
    // Even a dispatched event cannot abandon the saved item's identity.
    kind.value = category === "field" ? "table" : "field";
    kind.dispatchEvent({ type: "change" });
    expect(kind.value).toBe(category);
    control(harness, "Title · ชื่อช่อง").value = "ชื่อใหม่";
    await click(harness, "บันทึกการแก้ไข");
    const changes = harness.requests.filter(
      (request) => request.method === "PATCH"
    );
    expect(changes).toHaveLength(1);
    expect(JSON.parse(changes[0].body).change).toMatchObject({
      action: "upsert",
      kind: category,
      value: { id: category, label: "ชื่อใหม่" },
    });
    expect(kind.disabled).toBe(true);
    kind.value = category === "field" ? "table" : "field";
    await click(harness, "บันทึกการแก้ไข");
    expect(kind.value).toBe(category);
    expect(
      harness.requests.filter((request) => request.method === "PATCH")
    ).toHaveLength(1);
    // Selecting an unbound range still allows choosing a new field's category.
    native.address = "D10";
    harness.window.Asc.plugin.init();
    await flushPlugin();
    expect(kind.disabled).toBe(false);
    kind.value = "table";
    kind.dispatchEvent({ type: "change" });
    expect(kind.value).toBe("table");
  }
);

test.each([false, true])(
  "table creation immediately displays borders (headers: %s)",
  async (withHeaders) => {
    const bindings = { fields: [], table: null, version: 1 };
    const harness = createHarness({
      action: "template-edit",
      capabilityResponses: ["read", "write"],
      documentKind: "xlsx",
      responses: [
        { bindings, revision: 0 },
        { bindings, revision: 1 },
      ],
      spreadsheetBindings: bindings,
      spreadsheetSelection: {
        address: "B3:C8",
        headers: [["Product", "Quantity"]],
      },
    });
    acknowledgeBridge(harness);
    await flushPlugin();
    const kind = control(harness, "กำหนดช่วงที่เลือกเป็น");
    control(harness, "ชนิดข้อมูล").value = "dropdown";
    kind.value = "table";
    kind.dispatchEvent({ type: "change" });
    const headers = control(harness, "ใช้แถวแรกเป็นชื่อคอลัมน์");
    headers.checked = withHeaders;
    headers.dispatchEvent({ type: "change" });
    await click(harness, "เพิ่มช่องจากช่วงที่เลือก");
    const changes = harness.requests.filter(
      (request) => request.method === "PATCH"
    );
    expect(changes).toHaveLength(1);
    const { change } = JSON.parse(changes[0].body);
    expect(change.kind).toBe("table");
    expect(
      change.value.columns.map(({ key, label, offset, type }) => ({
        key,
        label,
        offset,
        type,
      }))
    ).toEqual([
      {
        key: "column_1",
        label: withHeaders ? "Product" : "คอลัมน์ 1",
        offset: 0,
        type: "text",
      },
      {
        key: "column_2",
        label: withHeaders ? "Quantity" : "คอลัมน์ 2",
        offset: 1,
        type: "text",
      },
    ]);
    expect(harness.spreadsheetNames.get(change.value.anchor)).toBe(
      withHeaders ? "'Sheet1'!B4:C8" : "'Sheet1'!B3:C8"
    );
    expect(
      harness.spreadsheetBorders.map(({ address, border, style }) => ({
        address,
        border,
        style,
      }))
    ).toEqual(
      [
        "Top",
        "Bottom",
        "Left",
        "Right",
        "InsideHorizontal",
        "InsideVertical",
      ].map((border) => ({ address: "B3:C8", border, style: "Thin" }))
    );
    expect(harness.visibleSpreadsheetBorders).toEqual(
      harness.spreadsheetBorders
    );
  }
);

test("unresponsive Office commands and methods time out with a retryable error", async () => {
  const timers = [];
  const office = runInNewContext(`(${createOffice.toString()})({})`, {
    window: {
      Asc: { plugin: { callCommand() {}, executeMethod() {} } },
      clearTimeout() {},
      setTimeout(callback, delay) {
        timers.push({ callback, delay });
        return callback;
      },
    },
  });
  const pending = [
    office.callCommandResult(() => {}),
    office.executeMethodResult("SetEditingRestrictions", ["readOnly"]),
  ];
  const assertions = pending.map(async (promise) => {
    try {
      await promise;
      return "unexpected success";
    } catch (error) {
      return error.message;
    }
  });
  for (const timer of timers) {
    expect(timer.delay).toBe(15_000);
    timer.callback();
  }
  expect(await Promise.all(assertions)).toEqual([
    "ตัวแก้ไขไม่ตอบสนอง กรุณาลองอีกครั้งก่อนปิดหน้านี้",
    "ตัวแก้ไขไม่ตอบสนอง กรุณาลองอีกครั้งก่อนปิดหน้านี้",
  ]);
});

test("a missing native save acknowledgement times out without reporting a saved workbook", async () => {
  const harness = createHarness({ documentKind: "xlsx", holdEditorSave: true });
  acknowledgeBridge(harness);
  const pending = harness.window.FormBridge.runAction("save-draft");
  await flushPlugin();
  harness.expireEditorSaveRequests();
  await expect(pending).resolves.toMatchObject({ ok: false });
  expect(harness.requests).toHaveLength(0);
  expect(
    harness.messages.some(
      ({ message }) => message.type === "dirty-state" && message.dirty === false
    )
  ).toBe(false);
});

test("repeated native init refreshes selection without rebuilding the panel and preserves unsaved settings", async () => {
  const native = { address: "A1" };
  const harness = createHarness({
    action: "template-edit",
    documentKind: "xlsx",
    spreadsheetSelection: native,
  });
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("ช่อง A1");
  expect(control(harness, "Tag · รหัสช่อง").value).toBe("field_1");
  const count = descendants(harness.body).length;
  control(harness, "Title · ชื่อช่อง").value = "Unsaved first field";
  control(harness, "Tag · รหัสช่อง").value = "first_field";
  native.address = "B2";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("ช่อง B2");
  expect(descendants(harness.body).length).toBe(count);
  native.address = "A1";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Unsaved first field");
  expect(control(harness, "Tag · รหัสช่อง").value).toBe("first_field");
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("Unsaved first field");
});

test("new default tags skip saved field and table keys", async () => {
  const harness = createHarness({
    action: "template-edit",
    documentKind: "xlsx",
    spreadsheetBindings: {
      fields: [{ anchor: "one", id: "one", key: "field_1", label: "Saved" }],
      table: { columns: [], key: "field_2" },
      version: 1,
    },
  });
  await flushPlugin();
  expect(control(harness, "Tag · รหัสช่อง").value).toBe("field_3");
});

test("selection changes while metadata saves are reconciled after the action", async () => {
  const native = { address: "A1" };
  const bindings = { fields: [], table: null, version: 1 };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 1 },
    ],
    spreadsheetSelection: native,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const save = descendants(harness.body).find(
    (node) =>
      node.tagName === "BUTTON" && node.textContent === "เพิ่มช่องจากช่วงที่เลือก"
  );
  save.dispatchEvent({ type: "click" });
  await Promise.resolve();
  native.address = "B2";
  harness.window.Asc.plugin.init();
  await flushPlugin();
  expect(control(harness, "Title · ชื่อช่อง").value).toBe("ช่อง B2");
});

test("dropdown options editor supports bulk add, edit, delete and reordering", async () => {
  const native = { address: "A1" };
  const bindings = { fields: [], table: null, version: 1 };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 1 },
    ],
    spreadsheetSelection: native,
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  control(harness, "ชนิดข้อมูล").value = "dropdown";
  control(harness, "ชนิดข้อมูล").dispatchEvent({ type: "change" });
  const entryInput = descendants(harness.body).find(
    (node) => node.tagName === "TEXTAREA"
  );
  const selectOption = (text) => {
    descendants(harness.body)
      .find((node) => node.tagName === "LI" && node.textContent === text)
      .dispatchEvent({ type: "click" });
  };
  const optionTexts = () =>
    descendants(harness.body)
      .filter((node) => node.tagName === "LI")
      .map((node) => node.textContent);

  entryInput.value = "ชาย, หญิง, อื่นๆ";
  await click(harness, "Add");
  expect(optionTexts()).toEqual(["ชาย", "หญิง", "อื่นๆ"]);

  selectOption("หญิง");
  await click(harness, "Up");
  expect(optionTexts()).toEqual(["หญิง", "ชาย", "อื่นๆ"]);

  selectOption("อื่นๆ");
  await click(harness, "Edit");
  expect(entryInput.value).toBe("อื่นๆ");
  entryInput.value = "อื่นๆ (ระบุ)";
  await click(harness, "Update");
  expect(optionTexts()).toEqual(["หญิง", "ชาย", "อื่นๆ (ระบุ)"]);

  selectOption("ชาย");
  await click(harness, "Delete");
  expect(optionTexts()).toEqual(["หญิง", "อื่นๆ (ระบุ)"]);

  const save = descendants(harness.body).find(
    (node) =>
      node.tagName === "BUTTON" && node.textContent === "เพิ่มช่องจากช่วงที่เลือก"
  );
  save.dispatchEvent({ type: "click" });
  await flushPlugin();
  const { change } = JSON.parse(
    harness.requests.find((request) => request.method === "PATCH").body
  );
  expect(change.value.type).toBe("dropdown");
  expect(change.value.options).toEqual(["หญิง", "อื่นๆ (ระบุ)"]);
});

test("extending a reopened dropdown preserves its identity and refreshes the native dropdown", async () => {
  const field = {
    anchor: "folio_saved",
    id: "saved",
    key: "choice",
    label: "Choice",
    options: ["test_1", "test_2", "test_3"],
    type: "dropdown",
  };
  const bindings = { fields: [field], table: null, version: 1 };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 1 },
    ],
    spreadsheetBindings: bindings,
    spreadsheetSelection: {
      address: "A1",
      names: { folio_saved: "'Sheet1'!$A$1" },
    },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const originalCallCommand = harness.window.Asc.plugin.callCommand;
  const validationRefreshes = [];
  harness.window.Asc.plugin.callCommand = (...args) => {
    if (args[0].toString().includes("ISNUMBER")) {
      validationRefreshes.push(args[2]);
    }
    return originalCallCommand(...args);
  };
  const entry = descendants(harness.body).find(
    (node) => node.tagName === "TEXTAREA"
  );
  entry.value = "test_4";
  await click(harness, "Add");
  await click(harness, "บันทึกการแก้ไข");
  const request = harness.requests.find(
    (candidate) => candidate.method === "PATCH"
  );
  expect(JSON.parse(request.body).change).toMatchObject({
    kind: "field",
    value: {
      anchor: field.anchor,
      id: field.id,
      options: [...field.options, "test_4"],
    },
  });
  expect(validationRefreshes).toEqual([true]);
});

test("response append-row button inserts after all current rows with native save synchronization", async () => {
  const harness = createHarness({
    capabilityResponses: ["save"],
    documentKind: "xlsx",
    responses: [
      { operationCapability: "poll", operationId: "append" },
      completedOperation(),
    ],
    spreadsheetBindings: {
      fields: [],
      table: { anchor: "rows", columns: [] },
      version: 1,
    },
    spreadsheetSelection: { names: { rows: "'Sheet1'!B4:C6" }, rowCount: 3 },
  });
  acknowledgeBridge(harness);
  await click(harness, "เพิ่มแถว");
  expect(JSON.parse(harness.requests[0].body).rowChange).toEqual({
    action: "insert",
    index: 3,
  });
});

test("Excel response accepts authenticated shared submit actions from the parent", async () => {
  const harness = createHarness({
    capabilityResponses: ["submit"],
    documentKind: "xlsx",
    responses: [
      { operationCapability: "poll", operationId: "submit" },
      completedOperation(),
    ],
  });
  acknowledgeBridge(harness);
  harness.dispatch({
    data: {
      action: "submit",
      bridgeId: harness.bridgeId,
      source: "folio-parent",
      type: "run-action",
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
  await flushPlugin();
  expect(harness.requests[0].url).toEndWith("/api/forms/public-id/submit");
});

test("editing an existing table preserves columns without redrawing user borders", async () => {
  const table = {
    anchor: "rows",
    columns: [
      {
        id: "column",
        key: "item",
        label: "Item",
        offset: 0,
        options: [],
        required: false,
        type: "text",
      },
    ],
    id: "rows",
    key: "items",
    label: "Items",
  };
  const bindings = { fields: [], table, version: 1 };
  const harness = createHarness({
    action: "template-edit",
    capabilityResponses: ["read", "write"],
    documentKind: "xlsx",
    responses: [
      { bindings, revision: 0 },
      { bindings, revision: 1 },
    ],
    spreadsheetBindings: bindings,
    spreadsheetSelection: { names: { rows: "'Sheet1'!$A$5:$A$7" } },
  });
  acknowledgeBridge(harness);
  await flushPlugin();
  const existing = control(harness, "ช่องที่บันทึกแล้ว");
  existing.value = "rows";
  existing.dispatchEvent({ type: "change" });
  control(harness, "Title · ชื่อช่อง").value = "Updated items";
  await click(harness, "บันทึกการแก้ไข");
  expect(JSON.parse(harness.requests[1].body).change.value.columns).toEqual(
    table.columns
  );
  expect(harness.spreadsheetBorders).toHaveLength(0);
});

test("native row deletion uses the selected table row and rejects cells outside its body", () => {
  let row = 6;
  let column = 3;
  const body = {
    GetCol: () => 2,
    GetColumnsCount: () => 2,
    GetRow: () => 4,
    GetRowsCount: () => 3,
    GetWorksheet: () => ({ GetName: () => "Form" }),
  };
  const context = {
    Api: {
      GetActiveSheet: () => ({
        GetName: () => "Form",
        GetSelection: () => ({ GetCol: () => column, GetRow: () => row }),
      }),
      GetDefName: () => ({ GetRefersToRange: () => body }),
    },
    Asc: { scope: { folioTableAnchor: "rows" } },
  };
  const run = () =>
    runInNewContext(
      `(${spreadsheetTableSelectedRowCommand.toString()})()`,
      context
    );
  expect(run()).toBe(2);
  row = 3;
  expect(run()).toBeNull();
  row = 5;
  column = 1;
  expect(run()).toBeNull();
});

test("Excel activates its main panel once per mount without reopening on selection or repeated ready", async () => {
  const harness = createHarness({ documentKind: "xlsx" });
  await flushPlugin();
  expect(
    harness.methodInvocations.filter(
      ({ method }) => method === "ActivateWindow"
    )
  ).toEqual([{ args: ["asc.test-plugin"], method: "ActivateWindow" }]);
  harness.window.Asc.plugin.init();
  harness.emitEditorEvent("onDocumentContentReady");
  harness.emitEditorEvent("onTargetPositionChanged");
  await flushPlugin();
  expect(
    harness.methodInvocations.filter(
      ({ method }) => method === "ActivateWindow"
    )
  ).toHaveLength(1);
});
