import { spreadsheetPicturePlaceholder } from "../../server/src/documents/spreadsheets/picture-placeholder.ts";
import { createApi } from "./api.js";
import { createBridge } from "./bridge.js";
import { ACTIONS } from "./constants.js";
import { createOffice } from "./office.js";
import { createOperations } from "./operations.js";
import {
  spreadsheetSelectionCommand,
  spreadsheetAnchorCommand,
  spreadsheetTableBordersCommand,
  spreadsheetTableRowCountCommand,
  spreadsheetTableSelectedRowCommand,
  spreadsheetValidationCommand,
  spreadsheetHeadersCommand,
} from "./spreadsheet-commands.js";
// oxlint-disable func-style sort-keys no-implicit-globals consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function prefer-await-to-then prefer-destructuring logical-assignment-operators func-names prefer-arrow-callback no-loop-func no-use-before-define throw-new-error no-await-in-loop -- ONLYOFFICE commands are serialized into the editor sandbox.
import {
  spreadsheetPictureCommand,
  spreadsheetPictureReconcileCommand,
  readSpreadsheetPictureFile,
} from "./spreadsheet-pictures.js";
import {
  selectionPosition,
  tableSelection,
  selectedBinding,
} from "./spreadsheet-selection.js";

const parseDropdownOptions = (text) => {
  const seen = new Set();
  const parsed = [];
  for (const raw of text.split(/[,;\r\n]+/)) {
    const item = raw.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      parsed.push(item);
    }
  }
  return parsed;
};

// Mirrors ONLYOFFICE's native "Drop-down list" content control editor
// (Add/Edit/Delete/Up/Down over a reorderable list) for Excel dropdown fields.
const createOptionsField = () => {
  const wrapper = document.createElement("div");
  wrapper.className = "field-label options-field";
  const caption = document.createElement("span");
  caption.textContent = "ตัวเลือก";
  wrapper.append(caption);

  const entryRow = document.createElement("div");
  entryRow.className = "options-entry-row";
  const entryInput = document.createElement("textarea");
  entryInput.rows = 2;
  entryInput.placeholder = "พิมพ์ตัวเลือก";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add";
  entryRow.append(entryInput, addButton);
  wrapper.append(entryRow);

  const list = document.createElement("ul");
  list.className = "options-list";
  wrapper.append(list);

  const actionsRow = document.createElement("div");
  actionsRow.className = "options-actions-row";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "Edit";
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  const upButton = document.createElement("button");
  upButton.type = "button";
  upButton.textContent = "Up";
  const downButton = document.createElement("button");
  downButton.type = "button";
  downButton.textContent = "Down";
  actionsRow.append(editButton, deleteButton, upButton, downButton);
  wrapper.append(actionsRow);

  let items = [];
  let selected = -1;
  let editingIndex = -1;

  const exitEditMode = () => {
    editingIndex = -1;
    addButton.textContent = "Add";
    entryInput.value = "";
  };

  const renderList = () => {
    list.replaceChildren();
    for (const [index, item] of items.entries()) {
      const row = document.createElement("li");
      row.textContent = item;
      row.tabIndex = 0;
      row.className =
        index === selected ? "options-item selected" : "options-item";
      row.addEventListener("click", () => {
        selected = index;
        renderList();
      });
      list.append(row);
    }
    editButton.disabled = selected === -1;
    deleteButton.disabled = selected === -1;
    upButton.disabled = selected <= 0;
    downButton.disabled = selected === -1 || selected >= items.length - 1;
  };

  addButton.addEventListener("click", () => {
    if (editingIndex !== -1) {
      const value = entryInput.value.trim();
      if (value) {
        items[editingIndex] = value;
      }
      exitEditMode();
      renderList();
      return;
    }
    const seen = new Set(items);
    for (const value of parseDropdownOptions(entryInput.value)) {
      if (!seen.has(value)) {
        seen.add(value);
        items.push(value);
      }
    }
    entryInput.value = "";
    renderList();
  });

  editButton.addEventListener("click", () => {
    if (selected === -1) {
      return;
    }
    entryInput.value = items[selected];
    editingIndex = selected;
    addButton.textContent = "Update";
    entryInput.focus?.();
  });

  deleteButton.addEventListener("click", () => {
    if (selected === -1) {
      return;
    }
    items.splice(selected, 1);
    selected = -1;
    exitEditMode();
    renderList();
  });

  upButton.addEventListener("click", () => {
    if (selected <= 0) {
      return;
    }
    [items[selected - 1], items[selected]] = [
      items[selected],
      items[selected - 1],
    ];
    selected -= 1;
    renderList();
  });

  downButton.addEventListener("click", () => {
    if (selected === -1 || selected >= items.length - 1) {
      return;
    }
    [items[selected + 1], items[selected]] = [
      items[selected],
      items[selected + 1],
    ];
    selected += 1;
    renderList();
  });

  renderList();

  return {
    element: wrapper,
    getOptions: () => [...items],
    setOptions: (next) => {
      items = [...next];
      selected = -1;
      exitEditMode();
      renderList();
    },
  };
};

export function initializeSpreadsheet(options, setStatus) {
  const office = createOffice(options);
  const api = createApi(options);
  let bindings = options.spreadsheetBindings;
  let revision;
  let editing = null;
  let busy = false;
  let pictureSavePending = false;

  let renderList = () => {};
  let refreshAfterAction = () => {};
  const bridge = createBridge(options, office, {
    getFieldSelection: () => null,
    loadFieldRules: () => Promise.resolve(),
    runAction: (...args) => operations.runAction(...args),
    setPanelStatus: setStatus,
    setStatus,
  });
  const prefill = { shouldApplyRuntimePrefill: () => false };
  const operations = createOperations(options, office, prefill, bridge, api, {
    isInitializationPending: () => busy,
    setStatus,
  });
  bridge.startBridge();
  let panelActivated = false;
  const activatePanelOnce = () => {
    if (panelActivated) {
      return;
    }
    panelActivated = true;
    // ONLYOFFICE 9.4's main side panels are registered under the plugin GUID;
    // iframe-prefixed frame IDs identify separate PluginWindow instances.
    const guid = window.Asc.plugin.guid || window.Asc.plugin.info?.guid;
    if (!guid) {
      return;
    }
    void office.executeMethodResult("ActivateWindow", [guid]).catch((error) => {
      setStatus(error.message, "error");
    });
  };
  window.Asc.plugin.attachEditorEvent?.("onDocumentContentReady", () => {
    window.setTimeout(activatePanelOnce, 1000);
  });
  // Allow the editor to finish its initial native sidebar/layout restoration.
  // Autostart may run after content-ready has already been emitted.
  window.setTimeout(activatePanelOnce, 1000);
  const wordPanel = document.querySelector("#field-panel");
  if (wordPanel) {
    wordPanel.hidden = true;
  }
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "ช่องกรอก Excel");
  panel.className = "panel-section spreadsheet-panel";
  document.body.append(panel);
  const label = (caption, control) => {
    const element = document.createElement("label");
    element.className = "field-label";
    const text = document.createElement("span");
    text.textContent = caption;
    element.append(text);
    element.append(control);
    panel.append(element);
    return control;
  };
  const input = (caption, type = "text") => {
    const node = document.createElement("input");
    node.type = type;
    return label(caption, node);
  };
  const select = (caption, choices) => {
    const node = document.createElement("select");
    for (const [value, text] of choices) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = text;
      node.append(item);
    }
    return label(caption, node);
  };
  const buttons = [];
  const button = (caption, action) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = caption;
    buttons.push(node);
    panel.append(node);
    node.addEventListener("click", () => {
      if (busy) {
        return;
      }
      busy = true;
      for (const item of buttons) {
        item.disabled = true;
      }
      Promise.resolve()
        .then(action)
        .catch((error) =>
          setStatus(error.message || "ดำเนินการไม่สำเร็จ", "error")
        )
        .finally(() => {
          busy = false;
          for (const item of buttons) {
            item.disabled = false;
          }
          void refreshAfterAction();
        });
    });
    return node;
  };
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  panel.append(message);
  async function selection() {
    const result = await office.callCommandResult(spreadsheetSelectionCommand);
    const selected = typeof result === "string" ? JSON.parse(result) : result;
    if (!selected?.sheet || !selected.address) {
      throw new Error("อ่านตำแหน่งที่เลือกไม่ได้");
    }
    selected.address = selected.address.split("!").at(-1);
    selectionPosition(selected.address);
    return selected;
  }
  async function readBindings() {
    const capability = await bridge.requestActionCapability(
      ACTIONS.CONFIGURE_FIELDS
    );
    const result = await api.requestJson(
      api.adminFormPath("spreadsheet-bindings"),
      { method: "GET" },
      capability
    );
    bindings = result.bindings;
    revision = result.revision;
    return result;
  }
  async function changeBinding(change) {
    if (revision === undefined) {
      await readBindings();
    }
    const capability = await bridge.requestActionCapability(
      ACTIONS.CONFIGURE_FIELDS
    );
    const result = await api.requestJson(
      api.adminFormPath("spreadsheet-bindings"),
      {
        method: "PATCH",
        body: JSON.stringify({
          documentKey: options.documentKey,
          revision,
          change,
        }),
      },
      capability
    );
    bindings = result.bindings;
    revision = result.revision;
    bridge.setDirtyState(true);
    setStatus("บันทึกการตั้งค่าช่องแล้ว กรุณาบันทึกต้นแบบ", "success");
    renderList();
  }
  const id = () =>
    `folio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  async function anchor(anchorName, requestedSelection) {
    const selected = requestedSelection || (await selection());
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.folioSpreadsheetAnchor = {
      anchor: anchorName,
      reference: `'${selected.sheet.replaceAll("'", "''")}'!${selected.address}`,
    };
    if ((await office.callCommandResult(spreadsheetAnchorCommand)) !== true) {
      throw new Error("สร้างตำแหน่งอ้างอิงไม่ได้ กรุณาเลือกช่วงเซลล์ใหม่");
    }
    bridge.setDirtyState(true);
    return selected;
  }
  async function ensurePictureFrame(field) {
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.folioSpreadsheetPicture = {
      ...spreadsheetPicturePlaceholder,
      placeholder: true,
      anchor: field.anchor,
      id: field.id,
    };
    try {
      if (
        (await office.callCommandResult(spreadsheetPictureCommand, true)) !==
        true
      ) {
        throw new Error("สร้างกรอบรูปไม่ได้ กดปุ่มสร้างกรอบรูปอีกครั้งเพื่อลองใหม่");
      }
      bridge.setDirtyState(true);
    } finally {
      delete window.Asc.scope.folioSpreadsheetPicture;
    }
  }
  if (options.action === ACTIONS.TEMPLATE_EDIT) {
    const existing = select("ช่องที่บันทึกแล้ว", [["", "เลือกช่องเพื่อแก้ไข"]]);
    const kind = select("กำหนดช่วงที่เลือกเป็น", [
      ["field", "ช่องกรอก"],
      ["table", "ตารางรายการ"],
      ["column", "คอลัมน์ที่บันทึกแล้ว"],
    ]);
    kind.children[2].hidden = true;
    const caption = input("Title · ชื่อช่อง");
    const key = input("Tag · รหัสช่อง");
    key.pattern = "[A-Za-z_][A-Za-z0-9_]*";
    const type = select("ชนิดข้อมูล", [
      ["text", "ข้อความ"],
      ["date", "วันที่"],
      ["number", "ตัวเลข"],
      ["dropdown", "รายการเลือก"],
      ["boolean", "ใช่ / ไม่ใช่"],
      ["picture", "รูปภาพ (JPEG / PNG)"],
    ]);
    const required = input("บังคับกรอก", "checkbox");
    const placeholder = input("คำแนะนำในเซลล์ · Placeholder (ไม่บังคับ)");
    const optionsField = createOptionsField();
    panel.append(optionsField.element);
    const headers = input("ใช้แถวแรกเป็นชื่อคอลัมน์", "checkbox");
    let editingKind = null;
    let selected = null;
    let entries = [];
    let selectionSequence = 0;
    const drafts = new Map();
    const draftKey = () => {
      if (editing) {
        return `${kind.value}:${editing.id}`;
      }
      return selected ? `${selected.sheet}!${selected.address}` : null;
    };
    const captureDraft = () => {
      const target = draftKey();
      if (!target) {
        return;
      }
      drafts.set(target, {
        kind: kind.value,
        caption: caption.value,
        key: key.value,
        type: type.value,
        required: required.checked,
        placeholder: placeholder.value,
        choices: optionsField.getOptions(),
        headers: headers.checked,
      });
    };
    const defaultKey = () => {
      const used = new Set([
        ...(bindings?.fields || []).map((field) => field.key),
        bindings?.table?.key,
      ]);
      let index = 1;
      while (used.has(`field_${index}`)) {
        index += 1;
      }
      return `field_${index}`;
    };
    const show = (control, visible) => {
      control.parentNode.hidden = !visible;
    };
    const updateControls = () => {
      kind.disabled = Boolean(editing);
      const table = kind.value === "table";
      const pictureOption = [...type.children].find(
        (option) => option.value === "picture"
      );
      pictureOption.hidden = kind.value === "column";
      pictureOption.disabled = kind.value === "column";
      if (kind.value === "column" && type.value === "picture") {
        type.value = "text";
      }
      show(type, !table);
      show(required, !table);
      show(placeholder, !table);
      optionsField.element.hidden = table || type.value !== "dropdown";
      show(headers, table && !editing);
      save.textContent = editing ? "บันทึกการแก้ไข" : "เพิ่มช่องจากช่วงที่เลือก";
      remove.hidden = !editing;
      restorePicture.hidden =
        editingKind !== "field" || editing?.type !== "picture";
      save.disabled = editing?.computed === true;
      message.textContent = selected
        ? `${selected.sheet}!${selected.address}`
        : "เลือกเซลล์หรือช่วงข้อมูลในชีต";
      if (selected && table && !editing) {
        try {
          message.textContent = `พื้นที่ข้อมูล: ${selected.sheet}!${tableSelection(selected.address, headers.checked).address}`;
        } catch (error) {
          message.textContent = error.message;
        }
      }
    };
    const loadEntry = (entry) => {
      editing = entry?.[1] || null;
      editingKind = entry?.[0] || null;
      kind.value = editingKind || "field";
      caption.value =
        editing?.label || (selected ? `ช่อง ${selected.address}` : "ช่องใหม่");
      key.value = editing?.key || defaultKey();
      type.value = editing?.type || "text";
      required.checked = Boolean(editing?.required);
      placeholder.value = editing?.placeholder || "";
      optionsField.setOptions(editing?.options || []);
      existing.value = editing?.id || "";
      const draft = drafts.get(draftKey());
      if (draft) {
        kind.value = editingKind || draft.kind;
        caption.value = draft.caption;
        key.value = draft.key;
        type.value = draft.type;
        required.checked = draft.required;
        placeholder.value = draft.placeholder;
        optionsField.setOptions(draft.choices);
        headers.checked = draft.headers;
      }
      updateControls();
    };
    type.addEventListener("change", updateControls);
    headers.addEventListener("change", updateControls);
    kind.addEventListener("change", () => {
      if (editing) {
        kind.value = editingKind;
        return;
      }
      editing = null;
      existing.value = "";
      updateControls();
    });
    existing.addEventListener("change", () => {
      const targetId = existing.value;
      captureDraft();
      loadEntry(entries.find((entry) => entry[1].id === targetId));
    });
    const save = button("เพิ่มช่องจากช่วงที่เลือก", async () => {
      if (editing && kind.value !== editingKind) {
        kind.value = editingKind;
        throw new Error("เปลี่ยนประเภทของช่องเดิมไม่ได้ กรุณาบันทึกการแก้ไขอีกครั้ง");
      }
      if (editing?.computed) {
        throw new Error("ช่องสูตรเดิมไม่รองรับ กรุณาลบช่องนี้และสูตรในชีตก่อน");
      }
      // Read the selection again at the action boundary, while retaining the
      // editing identity so changing Title/Tag never creates another binding.
      if (kind.value === "column" && !editing) {
        throw new Error("เลือกคอลัมน์จากช่องที่บันทึกแล้ว หรือเลือกเซลล์ในตาราง");
      }
      const current = await selection();
      await readBindings();
      const bindingId = editing?.id || id();
      const bindingKey = key.value.trim() || defaultKey();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(bindingKey)) {
        throw new Error(
          "Tag ต้องเริ่มด้วยตัวอักษรอังกฤษหรือ _ และใช้เฉพาะตัวอักษร ตัวเลข _"
        );
      }
      const labelText =
        caption.value.trim() ||
        (kind.value === "table" ? "ตารางรายการ" : `ช่อง ${current.address}`);
      let value = {
        ...editing,
        id: bindingId,
        key: bindingKey,
        label: labelText,
        type: type.value,
        required: required.checked,
        placeholder: placeholder.value.trim() || null,
        computed: false,
        options: type.value === "dropdown" ? optionsField.getOptions() : [],
      };
      if (
        kind.value !== "table" &&
        value.type === "dropdown" &&
        !value.options.length
      ) {
        throw new Error(
          "เพิ่มตัวเลือกอย่างน้อยหนึ่งรายการ โดยขึ้นบรรทัดใหม่หรือคั่นด้วยจุลภาคระหว่างรายการ"
        );
      }
      let body = current;
      if (kind.value === "table") {
        value = {
          ...editing,
          id: bindingId,
          key: bindingKey,
          label: labelText,
          anchor: editing?.anchor || bindingId,
        };
        if (!editing) {
          if (bindings?.table) {
            throw new Error(
              "มีตารางรายการแล้ว เลือกตารางเดิมจากช่องที่บันทึกแล้วเพื่อแก้ไข"
            );
          }
          const setup = tableSelection(current.address, headers.checked);
          body = { ...current, address: setup.address };
          let titles = [];
          if (headers.checked) {
            window.Asc.scope.folioSpreadsheetSelection = {
              sheet: current.sheet,
              address: setup.headerAddress,
            };
            const result = await office.callCommandResult(
              spreadsheetHeadersCommand
            );
            titles = typeof result === "string" ? JSON.parse(result) : result;
            if (Array.isArray(titles?.[0])) {
              titles = titles[0];
            } else if (!Array.isArray(titles)) {
              titles = [titles];
            }
          }
          value.columns = Array.from({ length: setup.width }, (_, offset) => ({
            id: id(),
            key: `column_${offset + 1}`,
            label: String(titles?.[offset] || `คอลัมน์ ${offset + 1}`),
            offset,
            type: "text",
            required: false,
            computed: false,
            options: [],
          }));
        }
      } else if (kind.value !== "column") {
        value.anchor = editing?.anchor || bindingId;
        value.prefillPointer =
          value.type === "picture" ? null : (editing?.prefillPointer ?? null);
        value.prefillPolicy =
          value.type === "picture"
            ? "editable"
            : editing?.prefillPolicy || "editable";
      }
      if (kind.value !== "column" && !editing) {
        await anchor(value.anchor, body);
      }
      if (kind.value !== "table") {
        window.Asc.scope.folioSpreadsheetValidation = {
          ...value,
          anchor:
            kind.value === "column" ? bindings.table.anchor : value.anchor,
        };
        if (
          (await office.callCommandResult(spreadsheetValidationCommand)) !==
          true
        ) {
          throw new Error("ตั้งกฎชนิดข้อมูลไม่ได้ กรุณาลองอีกครั้ง");
        }
      }
      const newTable = kind.value === "table" && !editing;
      await changeBinding({ kind: kind.value, action: "upsert", value });
      drafts.delete(draftKey());
      drafts.delete(`${kind.value}:${value.id}`);
      loadEntry([kind.value, value]);
      if (kind.value === "field" && value.type === "picture") {
        await ensurePictureFrame(value);
        setStatus("บันทึกฟิลด์และกรอบรูปแล้ว กรุณาบันทึกต้นแบบ", "success");
      }
      if (newTable) {
        window.Asc.scope.folioSpreadsheetTableBorders = current;
        // Recalculate after formatting so ONLYOFFICE redraws the borders now.
        if (
          (await office.callCommandResult(
            spreadsheetTableBordersCommand,
            true
          )) !== true
        ) {
          throw new Error(
            "สร้างตารางแล้ว แต่ใส่เส้นไม่สำเร็จ กรุณาใช้เมนูเส้นขอบของ ONLYOFFICE"
          );
        }
        bridge.setDirtyState(true);
      }
    });
    const remove = button("ลบช่องนี้", async () => {
      if (!editing) {
        return;
      }
      await changeBinding({
        kind: kind.value,
        action: "delete",
        id: editing.id,
      });
      loadEntry(null);
    });
    remove.className = "secondary-action";
    const restorePicture = button("สร้างกรอบรูปอีกครั้ง", async () => {
      if (editingKind !== "field" || editing?.type !== "picture") {
        return;
      }
      await ensurePictureFrame(editing);
      setStatus("เตรียมกรอบรูปแล้ว กรุณาบันทึกต้นแบบ", "success");
    });
    restorePicture.className = "secondary-action";
    renderList = () => {
      entries = [
        ...(bindings?.fields || []).map((value) => ["field", value]),
        ...(bindings?.table
          ? [
              ["table", bindings.table],
              ...bindings.table.columns.map((value) => ["column", value]),
            ]
          : []),
      ];
      existing.replaceChildren();
      for (const [value, text] of [
        ["", "เลือกช่องเพื่อแก้ไข"],
        ...entries.map(([entryKind, entry]) => [
          entry.id,
          `${entryKind === "column" ? "↳ " : ""}${entry.label} (${entry.key})${entry.computed ? " · ช่องสูตรเดิม" : ""}`,
        ]),
      ]) {
        const item = document.createElement("option");
        item.value = value;
        item.textContent = text;
        existing.append(item);
      }
      existing.value = editing?.id || "";
      window.Asc.scope = window.Asc.scope || {};
      window.Asc.scope.folioSpreadsheetAnchors = [
        ...(bindings?.fields || []).map((item) => item.anchor),
        ...(bindings?.table ? [bindings.table.anchor] : []),
      ];
    };
    const refreshSelection = async () => {
      if (busy) {
        return;
      }
      selectionSequence += 1;
      const sequence = selectionSequence;
      try {
        const current = await selection();
        if (sequence !== selectionSequence || busy) {
          return;
        }
        if (
          selected?.sheet === current.sheet &&
          selected?.address === current.address
        ) {
          return;
        }
        captureDraft();
        selected = current;
        const match = selectedBinding(current, bindings);
        loadEntry(match);
      } catch (error) {
        message.textContent = error.message;
      }
    };
    refreshAfterAction = refreshSelection;
    window.Asc.plugin.attachEditorEvent?.("onTargetPositionChanged", () => {
      void refreshSelection();
    });
    window.Asc.plugin.attachEditorEvent?.("onChangeCurrentSheet", () => {
      void refreshSelection();
    });
    window.Asc.plugin.attachEditorEvent?.("onDocumentContentReady", () => {
      void refreshSelection();
    });
    renderList();
    updateControls();
    void refreshSelection();
    window.FormBridge = {
      getRuntimeOptions: () => options,
      runAction: operations.runAction,
      saveSpreadsheetBinding: changeBinding,
      getSpreadsheetBindings: readBindings,
      refreshSelection,
    };
    renderList();
  } else {
    message.hidden = true;
    const pictureInputs = [];
    const pictureFrames = (options.spreadsheetPictureFrames || []).filter(
      (frame) =>
        bindings?.fields?.some(
          (field) =>
            field.type === "picture" &&
            field.id === frame.id &&
            field.anchor === frame.anchor
        )
    );
    let pictureObserved = {};
    let pictureReconciliation = null;
    let pictureTimer;
    let pictureGuardStopped = false;
    const reconcilePictures = async (force = false) => {
      if (!pictureFrames.length) {
        return;
      }
      if (pictureReconciliation) {
        await pictureReconciliation;
        if (!force) {
          return;
        }
      }
      pictureReconciliation = (async () => {
        window.Asc.scope = window.Asc.scope || {};
        window.Asc.scope.folioSpreadsheetPictureReconcile = {
          frames: pictureFrames,
          observed: pictureObserved,
          force,
          dataUrl: spreadsheetPicturePlaceholder.dataUrl,
        };
        try {
          const raw = await office.callCommandResult(
            spreadsheetPictureReconcileCommand,
            true
          );
          const result = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!result?.ok) {
            throw new Error("ดูแลกรอบรูปไม่ได้ กรุณาลองอีกครั้งหรือเปิดแบบฟอร์มใหม่");
          }
          pictureObserved = result.observed;
          if (result.changed) {
            bridge.setDirtyState(true);
          }
        } finally {
          delete window.Asc.scope.folioSpreadsheetPictureReconcile;
        }
      })().finally(() => {
        pictureReconciliation = null;
      });
      await pictureReconciliation;
    };
    const schedulePictureGuard = () => {
      if (pictureGuardStopped || !pictureFrames.length) {
        return;
      }
      pictureTimer = window.setTimeout(async () => {
        try {
          if (!busy && !pictureSavePending && !document.hidden) {
            await reconcilePictures();
          }
        } catch (error) {
          setStatus(error.message || "ดูแลกรอบรูปไม่ได้ กรุณาลองอีกครั้ง", "error");
        } finally {
          schedulePictureGuard();
        }
      }, 750);
    };
    window.addEventListener("pagehide", () => {
      pictureGuardStopped = true;
      window.clearTimeout(pictureTimer);
    });
    schedulePictureGuard();
    const runResponseAction = operations.runAction;
    operations.runAction = async (...args) => {
      if (busy || pictureSavePending) {
        setStatus("มีการดำเนินการของฟอร์มกำลังทำงานอยู่", "pending");
        return { ok: false, ignored: true };
      }
      pictureSavePending = true;
      for (const upload of pictureInputs) {
        upload.disabled = true;
      }
      try {
        // Reconcile before freezing: Office drawing commands need edit access.
        await reconcilePictures(true);
        return await runResponseAction(...args);
      } catch (error) {
        const detail = error.message || "ดูแลกรอบรูปไม่ได้ กรุณาลองอีกครั้ง";
        setStatus(detail, "error");
        bridge.notifyParent(args[0], "failed", undefined, undefined, detail);
        return { ok: false, error: detail };
      } finally {
        pictureSavePending = false;
        for (const upload of pictureInputs) {
          upload.disabled = false;
        }
      }
    };
    for (const field of bindings?.fields || []) {
      if (field.type !== "picture") {
        continue;
      }
      const upload = input(
        `${field.label}${field.required ? " (จำเป็น)" : ""} · JPEG / PNG ไม่เกิน 10 MB`,
        "file"
      );
      upload.accept = "image/png,image/jpeg";
      pictureInputs.push(upload);
      upload.addEventListener("change", () => {
        const file = upload.files?.[0];
        if (!file) {
          return;
        }
        if (busy || pictureSavePending) {
          upload.value = "";
          setStatus(
            "มีการดำเนินการของฟอร์มกำลังทำงานอยู่ กรุณาเลือกรูปอีกครั้ง",
            "pending"
          );
          return;
        }
        busy = true;
        for (const control of [...buttons, ...pictureInputs]) {
          control.disabled = true;
        }
        Promise.resolve()
          .then(async () => {
            if (pictureReconciliation) {
              await pictureReconciliation;
            }
            const frame = options.spreadsheetPictureFrames?.find(
              (item) => item.id === field.id && item.anchor === field.anchor
            );
            if (!frame) {
              throw new Error("ไม่พบข้อมูลกรอบรูปต้นแบบ กรุณาเปิดแบบฟอร์มใหม่");
            }
            const picture = await readSpreadsheetPictureFile(file);
            window.Asc.scope = window.Asc.scope || {};
            window.Asc.scope.folioSpreadsheetPicture = {
              ...picture,
              frame,
              id: field.id,
              anchor: field.anchor,
            };
            try {
              if (
                (await office.callCommandResult(
                  spreadsheetPictureCommand,
                  true
                )) !== true
              ) {
                throw new Error("ใส่รูปภาพไม่ได้ กรุณาเลือกไฟล์เพื่อลองอีกครั้ง");
              }
              bridge.setDirtyState(true);
              setStatus(`ใส่รูป ${field.label} แล้ว กรุณาบันทึก`, "success");
            } finally {
              delete window.Asc.scope.folioSpreadsheetPicture;
            }
          })
          .catch((error) => {
            setStatus(error.message || "ใส่รูปภาพไม่ได้ กรุณาลองอีกครั้ง", "error");
          })
          .finally(() => {
            upload.value = "";
            busy = false;
            for (const control of [...buttons, ...pictureInputs]) {
              control.disabled = false;
            }
          });
      });
    }
    if (bindings?.table) {
      const changeRows = async (action, index) => {
        if (!Number.isSafeInteger(index) || index < 0) {
          throw new Error("ลำดับรายการไม่ถูกต้อง");
        }
        // runAction provides the save barrier and invokes the authenticated server operation.
        busy = false;
        return await operations.runAction(ACTIONS.SAVE_DRAFT, "", {
          action,
          index,
        });
      };
      if (options.action !== ACTIONS.CORRECTION) {
        button("เพิ่มแถว", async () => {
          window.Asc.scope = window.Asc.scope || {};
          window.Asc.scope.folioTableAnchor = bindings.table.anchor;
          const count = await office.callCommandResult(
            spreadsheetTableRowCountCommand
          );
          if (!Number.isSafeInteger(count) || count < 1) {
            throw new Error("ไม่พบช่วงตาราง กรุณาบันทึกและเปิดแบบฟอร์มใหม่");
          }
          return changeRows("insert", count);
        });
        button("ลบแถวที่เลือก", async () => {
          window.Asc.scope = window.Asc.scope || {};
          window.Asc.scope.folioTableAnchor = bindings.table.anchor;
          const index = await office.callCommandResult(
            spreadsheetTableSelectedRowCommand
          );
          if (!Number.isSafeInteger(index) || index < 0) {
            throw new Error("เลือกเซลล์ในแถวข้อมูลที่ต้องการลบก่อน");
          }
          return changeRows("delete", index);
        });
      }
    }
    window.FormBridge = {
      getRuntimeOptions: () => options,
      runAction: operations.runAction,
      extractFormData: (callback) => callback(null, { data: {} }),
    };
  }
  return { operations, bridge };
}
