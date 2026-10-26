import { spreadsheetPicturePlaceholder } from "../../server/src/documents/spreadsheets/picture-placeholder.ts";
import { spreadsheetUploadPocCommand } from "../../server/src/documents/spreadsheets/upload-poc-command.js";
import {
  uploadPocGuid,
  uploadPocPreview,
} from "../../server/src/documents/spreadsheets/upload-poc-preview.ts";
import { createApi } from "./api.js";
import { createBridge } from "./bridge.js";
import { ACTIONS } from "./constants.js";
import { createOffice } from "./office.js";
import { createOperations } from "./operations.js";
import {
  spreadsheetBindingAttempt,
  spreadsheetBindingOutcome,
  spreadsheetBindingNeedsFence,
  sameSpreadsheetBindings,
  sameSpreadsheetNativeState,
} from "./spreadsheet-binding-recovery.js";
import {
  spreadsheetColumnsCommand,
  reconcileSpreadsheetColumns,
  spreadsheetBindingAnchors,
  spreadsheetColumnAnchor,
} from "./spreadsheet-columns.js";
import {
  spreadsheetSelectionCommand,
  spreadsheetAnchorCommand,
  spreadsheetTableBordersCommand,
  spreadsheetTableRowCountCommand,
  spreadsheetTableSelectedRowCommand,
  spreadsheetValidationCommand,
  spreadsheetCaptureValidationCommand,
  spreadsheetRestoreValidationCommand,
  spreadsheetClearValidationCommand,
  spreadsheetHeadersCommand,
} from "./spreadsheet-commands.js";
import { spreadsheetEditorSaveCheckpointCommand } from "./spreadsheet-editor-save.js";
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
import { spreadsheetUploadPocActivationCommand } from "./spreadsheet-upload-poc-activation.js";
import { spreadsheetUploadPocDeleteCommand } from "./spreadsheet-upload-poc-delete.js";
import {
  selectedUploadPocTarget,
  selectedUploadPocBinding,
  existingUploadPocEntry,
  automaticUploadPocField,
  spreadsheetUploadPocSelectionCommand,
  uploadPocCleanupNames,
  missingUploadPocBindings,
  spreadsheetUploadPocCleanupCommand,
  spreadsheetUploadPocHasMarkerCommand,
} from "./spreadsheet-upload-poc.js";
import { createUploadPocActivationLifecycle } from "./upload-poc-activation-lifecycle.js";
import { checkUploadPocPending } from "./upload-poc-pending.js";

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
const createOptionsField = (onChange) => {
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
      onChange();
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
    onChange();
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
    onChange();
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
    onChange();
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
    onChange();
  });

  renderList();
  entryInput.addEventListener("input", onChange);

  return {
    element: wrapper,
    controls: [
      entryInput,
      addButton,
      editButton,
      deleteButton,
      upButton,
      downButton,
    ],
    getOptions: () => [...items],
    getEntry: () => entryInput.value,
    getEditorState: () => ({ selected, editingIndex, entry: entryInput.value }),
    setEditorState: (state) => {
      selected =
        Number.isInteger(state?.selected) &&
        state.selected >= 0 &&
        state.selected < items.length
          ? state.selected
          : -1;
      editingIndex =
        Number.isInteger(state?.editingIndex) &&
        state.editingIndex >= 0 &&
        state.editingIndex < items.length
          ? state.editingIndex
          : -1;
      entryInput.value = state?.entry || "";
      addButton.textContent = editingIndex === -1 ? "Add" : "Update";
      renderList();
    },
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
  let metadataBindings = bindings;
  let revision;
  let editing = null;
  let busy = false;
  let pictureSavePending = false;
  let authoringMismatch = false;
  let pendingRecovery = null;
  let recoveryRequestInFlight = false;
  let refreshRecoveryControls = () => {};
  let ensureAuthoringReady = async () => {};
  let validatePanelDrafts = () => {};
  let uploadPocSaveInFlight = false;
  let uploadPocDeleteNeedsSave = false;
  let pendingTemplateDeletePurpose = "manual";
  const deletedUploadPocBindingIds = new Set();
  const deletedUploadPocTargets = new Map();
  const pendingUploadPocChanges = new Map();
  let preparePreservedTemplateSave = () => Promise.resolve({});
  const authoringControls = [];
  const controlStates = new Map();
  const disableAuthoringControls = (disabled) => {
    for (const control of authoringControls) {
      if (disabled) {
        // Nested operations must retain the state from before the outer button disabled the panel.
        if (!controlStates.has(control)) {
          controlStates.set(control, control.disabled);
        }
        control.disabled = true;
      } else if (controlStates.has(control)) {
        control.disabled = controlStates.get(control);
      }
    }
    if (!disabled) {
      controlStates.clear();
    }
  };

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
    isInitializationPending: () => busy && !uploadPocSaveInFlight,
    getTemplateSaveContext: () =>
      uploadPocDeleteNeedsSave && pendingTemplateDeletePurpose === "delete"
        ? {
            preserveEditorSessionPurpose: "delete",
            deletedUploadPocBindingIds: [...deletedUploadPocBindingIds],
          }
        : { preserveEditorSessionPurpose: "manual" },
    onTemplateSaveCompleted: (action, context) => {
      if (
        action === ACTIONS.SAVE_TEMPLATE &&
        context?.preserveEditorSession === true
      ) {
        uploadPocDeleteNeedsSave = false;
        pendingUploadPocChanges.clear();
      }
    },
    beforeAction: async (action, rowChange) => {
      if (uploadPocDeleteNeedsSave && action !== ACTIONS.SAVE_TEMPLATE) {
        throw new Error(
          "การลบปุ่มยังรอบันทึกต้นแบบ กรุณากดบันทึกแบบร่างเพื่อลองอีกครั้งก่อนแก้ไขต่อ"
        );
      }
      await ensureAuthoringReady();
      validatePanelDrafts();
      await checkUploadPocPending(window, options, action, rowChange);
    },
    setActionBusy: (value) => {
      busy = value;
      for (const item of buttons) {
        item.disabled = value;
      }
      disableAuthoringControls(value);
      if (!value) {
        void refreshAfterAction();
      }
    },
    getTemplateSnapshot: async (context) => {
      validatePanelDrafts();
      const proof =
        context?.preserveEditorSession === true &&
        ["manual", "delete"].includes(context.preserveEditorSessionPurpose)
          ? await preparePreservedTemplateSave(context)
          : {};
      const raw = await office.callCommandResult(spreadsheetSelectionCommand);
      const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(snapshot?.anchors)) {
        throw new TypeError("อ่านตำแหน่งช่องก่อนบันทึกไม่ได้ กรุณาลองใหม่");
      }
      return { spreadsheetAnchors: snapshot.anchors, ...proof };
    },
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
    authoringControls.push(control);
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
  const button = (caption, action, recoveryAction = false) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = caption;
    buttons.push(node);
    panel.append(node);
    node.addEventListener("click", () => {
      if (busy) {
        return;
      }
      if (uploadPocDeleteNeedsSave && !recoveryAction) {
        setStatus(
          "การลบปุ่มยังรอบันทึกต้นแบบ กรุณากดบันทึกแบบร่างเพื่อลองอีกครั้งก่อนแก้ไขต่อ",
          "error"
        );
        return;
      }
      if (pendingRecovery && !recoveryAction) {
        setStatus("ยังยืนยันผลการตั้งค่าไม่ได้ กรุณากด ลองยืนยันอีกครั้ง ก่อนแก้ไขต่อ", "error");
        return;
      }
      busy = true;
      for (const item of buttons) {
        item.disabled = true;
      }
      disableAuthoringControls(true);
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
          disableAuthoringControls(false);
          void refreshAfterAction();
        });
    });
    return node;
  };
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  panel.append(message);
  async function selection() {
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.folioSpreadsheetAnchors =
      spreadsheetBindingAnchors(bindings);
    const result = await office.callCommandResult(spreadsheetSelectionCommand);
    const selected = typeof result === "string" ? JSON.parse(result) : result;
    if (!selected?.sheet || !selected.address) {
      throw new Error("อ่านตำแหน่งที่เลือกไม่ได้");
    }
    selected.address = selected.address.split("!").at(-1);
    const objectBinding = selectedUploadPocBinding(
      selected,
      bindings,
      uploadPocGuid
    );
    if (objectBinding) {
      selected.address = objectBinding.address;
      selected.uploadPocBindingId = objectBinding.entry[1].id;
    }
    selectionPosition(selected.address);
    return selected;
  }
  const activeUploadPocBindingIds = () =>
    [...(bindings.fields || []), ...(bindings.table?.columns || [])].map(
      (field) => field.id
    );
  async function captureUploadPocTargets(
    bindingIds,
    sourceBindings = bindings
  ) {
    window.Asc.scope.folioUploadPocDelete = {
      phase: "capture",
      guid: uploadPocGuid,
      bindingIds,
    };
    try {
      const raw = await office.callCommandResult(
        spreadsheetUploadPocDeleteCommand
      );
      const result = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!result?.ok || !Array.isArray(result.targets)) {
        throw new Error(result?.error || "อ่านข้อมูลปุ่ม POC ก่อนบันทึกไม่ได้");
      }
      window.Asc.scope.folioSpreadsheetAnchors =
        spreadsheetBindingAnchors(sourceBindings);
      const snapshotRaw = await office.callCommandResult(
        spreadsheetSelectionCommand
      );
      const snapshot =
        typeof snapshotRaw === "string" ? JSON.parse(snapshotRaw) : snapshotRaw;
      const slots = new Set();
      for (const target of result.targets) {
        const resolved = selectedUploadPocBinding(
          {
            ...snapshot,
            sheet: target.sheet,
            drawing: {
              count: 1,
              applicationId: uploadPocGuid,
              data: target.data,
              from: { row: target.row, column: target.column },
              marker: target.marker,
            },
          },
          sourceBindings,
          uploadPocGuid
        );
        if (resolved?.entry[1].id !== target.bindingId) {
          throw new Error("ปุ่ม POC ไม่ตรงกับช่องที่กำลังบันทึก");
        }
        const data = JSON.parse(target.data);
        const slot = `${target.bindingId}:${data.rowIndex ?? "scalar"}`;
        if (slots.has(slot)) {
          throw new Error("ตำแหน่งปุ่ม POC ซ้ำกัน จึงยังบันทึกโดยไม่เปิดตัวแก้ไขใหม่ไม่ได้");
        }
        slots.add(slot);
      }
      return result.targets;
    } finally {
      delete window.Asc.scope.folioUploadPocDelete;
    }
  }
  preparePreservedTemplateSave = async () => {
    // Operations invokes this only after freezing the native editor.
    for (const pending of pendingUploadPocChanges.values()) {
      const current = [
        ...(bindings.fields || []),
        ...(bindings.table?.columns || []),
      ].filter((field) => pending.bindingIds.includes(field.id));
      const ineligible = pending.reason === "ineligible/type-change";
      if (
        current.length !== pending.bindingIds.length ||
        current.some((field) =>
          ineligible
            ? field.type === "text" && !field.computed
            : field.type !== "text" || field.computed
        )
      ) {
        throw new Error("การตั้งค่าปุ่มที่รอบันทึกเปลี่ยนไป กรุณาตรวจสอบก่อนลองอีกครั้ง");
      }
      const targets = pending.targets.map((target) => {
        const field = current.find((item) => item.id === target.bindingId);
        const column = bindings.table?.columns.some(
          (item) => item.id === field.id
        );
        const tag = column ? `${bindings.table.key}.${field.key}` : field.key;
        return {
          ...target,
          nextData: JSON.stringify({ ...JSON.parse(target.data), tag }),
        };
      });
      window.Asc.scope.folioUploadPocDelete = {
        phase: ineligible ? "remove" : "verify",
        reason: pending.reason,
        guid: uploadPocGuid,
        bindingIds: pending.bindingIds,
        targets,
        activeBindingIds: activeUploadPocBindingIds(),
        currentBindings: current,
      };
      try {
        const raw = await office.callCommandResult(
          spreadsheetUploadPocDeleteCommand,
          ineligible
        );
        const result = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!result?.ok) {
          throw new Error(result?.error || "ยังยืนยันข้อมูลปุ่ม POC ไม่ได้");
        }
      } finally {
        delete window.Asc.scope.folioUploadPocDelete;
      }
      if (!ineligible) {
        // Revalidate old physical anchors, markers and row slots against the captured contract.
        // Accept only the exact new tag after a partial projection retry.
        const snapshotRaw = await office.callCommandResult(
          spreadsheetSelectionCommand
        );
        const snapshot =
          typeof snapshotRaw === "string"
            ? JSON.parse(snapshotRaw)
            : snapshotRaw;
        for (const target of pending.targets) {
          selectedUploadPocBinding(
            {
              ...snapshot,
              sheet: target.sheet,
              drawing: {
                count: 1,
                applicationId: uploadPocGuid,
                data: target.data,
                from: { row: target.row, column: target.column },
                marker: target.marker,
              },
            },
            pending.bindings,
            uploadPocGuid
          );
        }
        const projections = current.map((field) => {
          const column = bindings.table?.columns.some(
            (item) => item.id === field.id
          );
          const captured = pending.targets.filter(
            (item) => item.bindingId === field.id
          );
          if (column) {
            const reference = new Map(snapshot.anchors).get(
              bindings.table.anchor
            );
            const [first, last = first] = reference
              .slice(reference.lastIndexOf("!") + 1)
              .split(":");
            if (
              captured.length !==
                selectionPosition(last).row -
                  selectionPosition(first).row +
                  1 ||
              captured.some(
                (item, index) => JSON.parse(item.data).rowIndex !== index
              )
            ) {
              throw new Error("ตำแหน่งปุ่มตารางไม่ครบ จึงยังปรับข้อมูลอย่างปลอดภัยไม่ได้");
            }
          }
          return {
            bindingId: field.id,
            kind: column ? "column" : "field",
            anchor: column ? spreadsheetColumnAnchor(field.id) : field.anchor,
            ...(column
              ? {
                  bodyAnchor: bindings.table.anchor,
                  columnOffset: field.offset,
                }
              : {}),
            tag: column ? `${bindings.table.key}.${field.key}` : field.key,
            sheet: captured[0].sheet,
          };
        });
        window.Asc.scope.folioSpreadsheetUploadPoc = {
          targets: projections,
          preview: uploadPocPreview,
          guid: uploadPocGuid,
          mark: false,
        };
        try {
          const raw = await office.callCommandResult(
            spreadsheetUploadPocCommand,
            true
          );
          const result = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!result?.ok) {
            throw new Error(result?.error || "ปรับข้อมูลปุ่ม POC ไม่สำเร็จ");
          }
        } finally {
          delete window.Asc.scope.folioSpreadsheetUploadPoc;
        }
      }
    }
    if (deletedUploadPocBindingIds.size) {
      window.Asc.scope.folioUploadPocDelete = {
        phase: "remove",
        guid: uploadPocGuid,
        bindingIds: [...deletedUploadPocBindingIds],
        targets: [...deletedUploadPocTargets.values()],
        activeBindingIds: activeUploadPocBindingIds(),
      };
      try {
        const raw = await office.callCommandResult(
          spreadsheetUploadPocDeleteCommand,
          true
        );
        const result = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!result?.ok) {
          throw new Error(
            result?.error || "ยังยืนยันการลบปุ่มในชีตไม่ได้ กรุณากดบันทึกแบบร่างเพื่อลองอีกครั้ง"
          );
        }
      } finally {
        delete window.Asc.scope.folioUploadPocDelete;
      }
    }
    const targets = await captureUploadPocTargets(activeUploadPocBindingIds());
    if (targets.length > 4096) {
      throw new Error("จำนวนปุ่ม POC เกินขอบเขตการบันทึกในตัวแก้ไขเดิม");
    }
    const spreadsheetUploadPocSnapshot = targets.map((target) => {
      const data = JSON.parse(target.data);
      return {
        bindingId: target.bindingId,
        tag: data.tag,
        rowIndex: data.rowIndex ?? null,
      };
    });
    const spreadsheetSaveCheckpoint = window.crypto.randomUUID();
    window.Asc.scope.folioSpreadsheetSaveCheckpoint = spreadsheetSaveCheckpoint;
    try {
      if (
        (await office.callCommandResult(
          spreadsheetEditorSaveCheckpointCommand,
          true
        )) !== true
      ) {
        throw new Error("สร้างรหัสยืนยันการบันทึกต้นแบบไม่ได้");
      }
    } finally {
      delete window.Asc.scope.folioSpreadsheetSaveCheckpoint;
    }
    return { spreadsheetSaveCheckpoint, spreadsheetUploadPocSnapshot };
  };
  async function fetchBindings() {
    const capability = await bridge.requestActionCapability(
      ACTIONS.CONFIGURE_FIELDS
    );
    const result = await api.requestJson(
      api.adminFormPath("spreadsheet-bindings"),
      { method: "GET" },
      capability
    );
    if (
      !Array.isArray(result?.bindings?.fields) ||
      !Number.isSafeInteger(result?.revision)
    ) {
      throw new TypeError("อ่านผลการตั้งค่าช่องไม่ได้ กรุณาลองใหม่");
    }
    return result;
  }
  function applyBindings(result) {
    bindings = result.bindings;
    metadataBindings = result.bindings;
    revision = result.revision;
  }
  async function readBindings(reconcile = true) {
    const result = await fetchBindings();
    if (result.documentKey && result.documentKey !== options.documentKey) {
      throw new Error(
        "ต้นแบบเปลี่ยนเป็นเอกสารอีกฉบับแล้ว กรุณาตรวจสอบต้นแบบล่าสุดก่อนแก้ไขต่อ"
      );
    }
    applyBindings(result);
    if (reconcile) {
      await synchronizeColumns(false);
    }
    return result;
  }
  const recoveryMessage = (outcome) => {
    if (outcome === "stale") {
      return "ต้นแบบเปลี่ยนเป็นเอกสารอีกฉบับแล้ว การแก้ไขของคุณยังอยู่ กรุณาตรวจสอบต้นแบบล่าสุดก่อนดำเนินการต่อ";
    }
    if (outcome === "conflict" || outcome === "native-conflict") {
      return "การตั้งค่าหรือเอกสารเปลี่ยนระหว่างรอยืนยัน การแก้ไขของคุณยังอยู่ กรุณาตรวจสอบต้นแบบล่าสุด แล้วกด ลองยืนยันอีกครั้ง";
    }
    return "ยังยืนยันผลบันทึกการตั้งค่าไม่ได้ การแก้ไขของคุณยังอยู่ กรุณากด ลองยืนยันอีกครั้ง เมื่อเชื่อมต่อได้";
  };
  function beginRecovery(attempt, native, outcome = "unverified") {
    const entering = !pendingRecovery;
    pendingRecovery = { attempt, native, outcome, phase: "applied" };
    authoringMismatch = true;
    bridge.setDirtyState(true);
    refreshRecoveryControls();
    if (entering) {
      panel.scrollTop = 0;
    }
  }
  async function captureNativeState(target) {
    window.Asc.scope.folioSpreadsheetValidation = target;
    const snapshot = await office.callCommandResult(
      spreadsheetCaptureValidationCommand
    );
    if (!snapshot) {
      throw new Error("สำรองกฎเดิมของช่องไม่ได้ กรุณาลองอีกครั้ง");
    }
    return snapshot;
  }
  async function restoreNativeState(snapshot) {
    window.Asc.scope.folioSpreadsheetValidationSnapshot = snapshot;
    try {
      if (
        (await office.callCommandResult(
          spreadsheetRestoreValidationCommand,
          true
        )) !== true
      ) {
        throw new Error("คืนกฎเดิมของช่องไม่ได้ กรุณากด ลองยืนยันอีกครั้ง");
      }
    } finally {
      delete window.Asc.scope.folioSpreadsheetValidationSnapshot;
    }
  }
  async function releaseNativeLock(native) {
    if (native?.frozen) {
      native.lockConfirmed = false;
      await office.executeMethodResult("SetEditingRestrictions", ["none"]);
      native.frozen = false;
    }
  }
  async function restoreTransactionNative(native) {
    const current = await captureNativeState(native.target);
    if (sameSpreadsheetNativeState(current, native.before)) {
      native.checkpoint = current;
      return;
    }
    await restoreNativeState(native.before);
    native.checkpoint = await captureNativeState(native.target);
  }
  async function synchronizeColumns(
    initialize,
    table = bindings?.table,
    repair = false
  ) {
    window.Asc.scope = window.Asc.scope || {};
    window.Asc.scope.folioSpreadsheetAnchors =
      spreadsheetBindingAnchors(bindings);
    if (!table?.columns?.length) {
      return;
    }
    window.Asc.scope.folioSpreadsheetColumns = { table, initialize, repair };
    const raw = await office.callCommandResult(
      spreadsheetColumnsCommand,
      initialize
    );
    const result = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!result?.ok) {
      throw new Error(result?.error || "อ่านตำแหน่งคอลัมน์ไม่ได้ กรุณาเปิดต้นแบบใหม่");
    }
    if (bindings?.table?.id === table.id) {
      bindings = reconcileSpreadsheetColumns(bindings, result);
    }
    if (result.changed) {
      bridge.setDirtyState(true);
    }
  }
  const bindingValue = (source, kind, bindingId) => {
    if (kind === "table") {
      return source?.table?.id === bindingId ? source.table : null;
    }
    return (
      (kind === "column" ? source?.table?.columns : source?.fields)?.find(
        (item) => item.id === bindingId
      ) || null
    );
  };
  const sameValue = (left, right) => {
    if (Array.isArray(left)) {
      return (
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((item, index) => sameValue(item, right[index]))
      );
    }
    if (left && typeof left === "object") {
      return (
        Boolean(right) &&
        Object.entries(left).every(
          ([name, value]) =>
            value === undefined || sameValue(value, right[name])
        )
      );
    }
    return left === right;
  };
  async function changeBinding(change, native = null) {
    if (authoringMismatch) {
      throw new Error(
        pendingRecovery
          ? recoveryMessage(pendingRecovery.outcome)
          : "การตั้งค่าช่องกับเอกสารยังไม่ตรงกัน กรุณาตรวจสอบต้นแบบล่าสุดก่อนบันทึก"
      );
    }
    let capability;
    try {
      if (revision === undefined) {
        await readBindings(change.action !== "delete");
      }
      capability = await bridge.requestActionCapability(
        ACTIONS.CONFIGURE_FIELDS
      );
    } catch (error) {
      error.bindingUnchanged = true;
      throw error;
    }
    const columnOffsets =
      change.kind === "column" && change.action === "upsert"
        ? bindings.table.columns.map((column) => [column.id, column.offset])
        : null;
    const attempt = spreadsheetBindingAttempt({
      bindings: metadataBindings,
      change,
      columnOffsets,
      documentKey: options.documentKey,
      revision,
    });
    if (native) {
      native.attempt = attempt;
    }
    try {
      const result = await api.requestJson(
        api.adminFormPath("spreadsheet-bindings"),
        {
          method: "PATCH",
          body: JSON.stringify({
            documentKey: options.documentKey,
            revision,
            change,
            ...(columnOffsets
              ? { spreadsheetColumnOffsets: columnOffsets }
              : {}),
          }),
        },
        capability
      );
      if (
        !Array.isArray(result?.bindings?.fields) ||
        !Number.isSafeInteger(result?.revision)
      ) {
        throw new TypeError("ยืนยันผลบันทึกการตั้งค่าช่องไม่ได้");
      }
      if (result.documentKey && result.documentKey !== attempt.documentKey) {
        throw new Error("ผลบันทึกเป็นของต้นแบบอีกฉบับ");
      }
      applyBindings(result);
    } catch (error) {
      attempt.requiresFence = !(
        Number.isInteger(error.httpStatus) &&
        error.httpStatus >= 400 &&
        error.httpStatus < 500 &&
        error.httpStatus !== 408
      );
      let result;
      let outcome = "unverified";
      try {
        result = await fetchBindings();
        outcome = spreadsheetBindingOutcome(attempt, result);
      } catch (verificationError) {
        if (
          [
            "stale_document",
            "editor_capability_scope_mismatch",
            "document_unavailable",
            "editor_lease_inactive",
            "published_immutable",
          ].includes(verificationError.code)
        ) {
          outcome = "stale";
        }
      }
      if (outcome !== "committed") {
        if (outcome === "unchanged" && !attempt.requiresFence) {
          applyBindings(result);
          const failure = new Error(error.message || "บันทึกการตั้งค่าไม่สำเร็จ", {
            cause: error,
          });
          failure.bindingUnchanged = true;
          failure.bindingAttempt = attempt;
          throw failure;
        }
        const recoveryOutcome =
          outcome === "unchanged" ? "unverified" : outcome;
        beginRecovery(attempt, native, recoveryOutcome);
        throw new Error(recoveryMessage(recoveryOutcome), { cause: error });
      }
      applyBindings(result);
      if (change.action !== "delete") {
        await synchronizeColumns(false);
      }
    }
    bridge.setDirtyState(true);
    setStatus("บันทึกการตั้งค่าช่องแล้ว กรุณาบันทึกต้นแบบ", "success");
    renderList();
  }
  async function mutateBinding(change, requestedTarget, mutate, onCommitted) {
    const cleanupNames = uploadPocCleanupNames(change, bindings);
    const target = {
      ...requestedTarget,
      extraAnchorNames: [
        ...(requestedTarget.extraAnchorNames || []),
        ...cleanupNames,
      ],
    };
    if (!Number.isSafeInteger(revision)) {
      await readBindings(change.action !== "delete");
    }
    let pocChange = null;
    const committed = async () => {
      if (pocChange?.targets.length) {
        pendingUploadPocChanges.set(change.value.id, pocChange);
        uploadPocDeleteNeedsSave = true;
        pendingTemplateDeletePurpose = "manual";
      }
      await onCommitted?.();
    };
    const native = {
      before: null,
      target: { ...target },
      applied: null,
      checkpoint: null,
      onCommitted: committed,
      frozen: false,
      lockConfirmed: false,
      attempt: null,
    };
    let snapshot;
    let metadataAttempted = false;
    try {
      native.frozen = true;
      await office.freezeEditor();
      native.lockConfirmed = true;
      if (
        change.action === "upsert" &&
        bindings?.table &&
        ["column", "table"].includes(change.kind)
      ) {
        await synchronizeColumns(false);
        if (change.kind === "column") {
          change.value.offset = bindings.table.columns.find(
            (column) => column.id === change.value.id
          ).offset;
        } else if (change.value.id === bindings.table.id) {
          change.value.columns = bindings.table.columns;
        }
      }
      if (change.action === "upsert") {
        const previous = bindingValue(bindings, change.kind, change.value.id);
        const ineligible =
          change.kind !== "table" &&
          (change.value.type !== "text" || change.value.computed);
        if (previous && (ineligible || previous.key !== change.value.key)) {
          const bindingIds =
            change.kind === "table"
              ? previous.columns.map((field) => field.id)
              : [previous.id];
          const targets = await captureUploadPocTargets(bindingIds);
          pocChange = {
            reason: ineligible ? "ineligible/type-change" : "key-change",
            bindingIds: [...new Set(targets.map((item) => item.bindingId))],
            targets,
            // oxlint-disable-next-line prefer-structured-clone -- The plugin VM and supported embedded browsers do not expose structuredClone.
            bindings: JSON.parse(JSON.stringify(bindings)),
          };
        }
      }
      snapshot = await captureNativeState(target);
      native.before = snapshot;
      const parsed =
        typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
      if (parsed.range) {
        Object.assign(native.target, {
          sheet: parsed.range.sheet,
          address: parsed.range.address,
        });
      }
      await mutate();
      if (cleanupNames.length) {
        window.Asc.scope.folioSpreadsheetUploadPocCleanup = cleanupNames;
        try {
          if (
            (await office.callCommandResult(
              spreadsheetUploadPocCleanupCommand
            )) !== true
          ) {
            throw new Error("ยังยืนยันการล้างตำแหน่งปุ่ม POC ไม่ได้ กรุณาลองอีกครั้ง");
          }
        } finally {
          delete window.Asc.scope.folioSpreadsheetUploadPocCleanup;
        }
      }
      native.applied = await captureNativeState(native.target);
      native.checkpoint = native.applied;
      metadataAttempted = true;
      await changeBinding(change, native);
    } catch (error) {
      if (metadataAttempted && error.bindingUnchanged !== true) {
        if (!pendingRecovery) {
          beginRecovery(native.attempt, native);
        }
        throw new Error(recoveryMessage(pendingRecovery.outcome), {
          cause: error,
        });
      }
      if (!snapshot) {
        try {
          await releaseNativeLock(native);
        } catch (unlockError) {
          native.noMutation = true;
          const attempt = spreadsheetBindingAttempt({
            bindings: metadataBindings,
            change,
            columnOffsets: null,
            documentKey: options.documentKey,
            revision,
          });
          beginRecovery(attempt, native);
          pendingRecovery.phase = "untouched";
          pendingRecovery.provenOutcome = "unchanged";
          throw new Error("ตัวแก้ไขยังยืนยันการเปิดแก้ไขต่อไม่ได้ กรุณากด ลองยืนยันอีกครั้ง", {
            cause: unlockError,
          });
        }
        throw error;
      }
      try {
        await restoreTransactionNative(native);
      } catch {
        const attempt =
          error.bindingAttempt ||
          native.attempt ||
          spreadsheetBindingAttempt({
            bindings: metadataBindings,
            change,
            columnOffsets: null,
            documentKey: options.documentKey,
            revision,
          });
        beginRecovery(attempt, native);
        pendingRecovery.phase = "restoring";
        pendingRecovery.provenOutcome = "unchanged";
        try {
          native.checkpoint = await captureNativeState(native.target);
        } catch {
          native.checkpoint = null;
        }
        throw new Error("คืนกฎเดิมของช่องยังไม่สำเร็จ กรุณากด ลองยืนยันอีกครั้ง", {
          cause: error,
        });
      }
      try {
        await releaseNativeLock(native);
      } catch (unlockError) {
        const attempt =
          error.bindingAttempt ||
          native.attempt ||
          spreadsheetBindingAttempt({
            bindings: metadataBindings,
            change,
            columnOffsets: null,
            documentKey: options.documentKey,
            revision,
          });
        beginRecovery(attempt, native);
        pendingRecovery.phase = "restored";
        pendingRecovery.provenOutcome = "unchanged";
        throw new Error("คืนกฎเดิมแล้ว แต่ยังเปิดการแก้ไขต่อไม่ได้ กรุณากด ลองยืนยันอีกครั้ง", {
          cause: unlockError,
        });
      }
      throw error;
    }
    try {
      await releaseNativeLock(native);
    } catch (error) {
      beginRecovery(native.attempt, native);
      pendingRecovery.provenOutcome = "committed";
      throw new Error(
        "ยืนยันการตั้งค่าแล้ว แต่ยังเปิดการแก้ไขต่อไม่ได้ กรุณากด ลองยืนยันอีกครั้ง",
        { cause: error }
      );
    }
    await committed();
  }
  async function retryBindingRecovery() {
    if (recoveryRequestInFlight) {
      return;
    }
    recoveryRequestInFlight = true;
    try {
      return await verifyBindingRecovery();
    } finally {
      recoveryRequestInFlight = false;
    }
  }
  async function verifyBindingRecovery() {
    const recovery = pendingRecovery;
    if (!recovery) {
      return;
    }
    let result;
    try {
      result = await fetchBindings();
    } catch (error) {
      if (
        [
          "stale_document",
          "editor_capability_scope_mismatch",
          "document_unavailable",
          "editor_lease_inactive",
          "published_immutable",
        ].includes(error.code)
      ) {
        recovery.outcome = "stale";
      }
      refreshRecoveryControls();
      throw new Error(recoveryMessage(recovery.outcome), { cause: error });
    }
    if (spreadsheetBindingNeedsFence(recovery.attempt, result)) {
      try {
        const capability = await bridge.requestActionCapability(
          ACTIONS.CONFIGURE_FIELDS
        );
        result = await api.requestJson(
          api.adminFormPath("spreadsheet-bindings/recover"),
          {
            method: "POST",
            body: JSON.stringify({
              documentKey: recovery.attempt.documentKey,
              revision: recovery.attempt.revision,
            }),
          },
          capability
        );
      } catch (error) {
        if (
          [
            "stale_document",
            "editor_capability_scope_mismatch",
            "document_unavailable",
            "editor_lease_inactive",
            "published_immutable",
          ].includes(error.code)
        ) {
          recovery.outcome = "stale";
        }
        throw new Error(recoveryMessage(recovery.outcome), { cause: error });
      }
    }
    const outcome = spreadsheetBindingOutcome(recovery.attempt, result);
    recovery.outcome = outcome;
    if (
      !["committed", "unchanged"].includes(outcome) ||
      (outcome === "unchanged" &&
        recovery.attempt.requiresFence &&
        !(
          result.recovery?.settled === true &&
          result.recovery.baseRevision === recovery.attempt.revision &&
          result.revision === recovery.attempt.revision + 1
        ))
    ) {
      refreshRecoveryControls();
      throw new Error(recoveryMessage(outcome));
    }
    if (recovery.provenOutcome && recovery.provenOutcome !== outcome) {
      recovery.outcome = "conflict";
      refreshRecoveryControls();
      throw new Error(recoveryMessage("conflict"));
    }
    recovery.provenOutcome = outcome;
    const native = recovery.native;
    if (native && !native.noMutation) {
      if (!native.lockConfirmed) {
        native.frozen = true;
        await office.freezeEditor();
        native.lockConfirmed = true;
      }
      const current = await captureNativeState(native.target);
      const alreadyRestored =
        outcome === "unchanged" &&
        sameSpreadsheetNativeState(current, native.before);
      if (
        !alreadyRestored &&
        (!native.checkpoint ||
          !sameSpreadsheetNativeState(current, native.checkpoint))
      ) {
        recovery.outcome = "native-conflict";
        refreshRecoveryControls();
        throw new Error(recoveryMessage(recovery.outcome));
      }
      if (alreadyRestored) {
        native.checkpoint = current;
        recovery.phase = "restored";
      }
      if (outcome === "unchanged" && recovery.phase !== "restored") {
        recovery.phase = "restoring";
        try {
          await restoreTransactionNative(native);
        } catch (error) {
          try {
            native.checkpoint = await captureNativeState(native.target);
          } catch {
            native.checkpoint = null;
          }
          throw error;
        }
        recovery.phase = "restored";
      }
    }
    applyBindings(result);
    if (outcome === "committed") {
      await synchronizeColumns(false);
      if (
        recovery.attempt.enforceColumnOffsets &&
        !sameSpreadsheetBindings(result.bindings, bindings)
      ) {
        recovery.outcome = "native-conflict";
        refreshRecoveryControls();
        throw new Error(recoveryMessage(recovery.outcome));
      }
    }
    await releaseNativeLock(native);
    pendingRecovery = null;
    authoringMismatch = false;
    renderList();
    refreshRecoveryControls();
    if (outcome === "committed") {
      await native?.onCommitted?.();
      setStatus("ยืนยันว่าบันทึกการตั้งค่าช่องแล้ว กรุณาบันทึกต้นแบบ", "success");
    } else {
      setStatus(
        "ยืนยันว่าการตั้งค่ายังไม่ได้บันทึก คืนกฎเดิมแล้ว การแก้ไขของคุณยังอยู่ กรุณาแก้ไขแล้วบันทึกอีกครั้ง",
        "info"
      );
    }
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
    const recoveryStatus = document.createElement("p");
    recoveryStatus.id = "spreadsheet-recovery-status";
    recoveryStatus.setAttribute("role", "status");
    recoveryStatus.textContent = "มีการตั้งค่ารอยืนยัน การแก้ไขของคุณยังอยู่";
    recoveryStatus.hidden = true;
    panel.append(recoveryStatus);
    const retryRecovery = button("ลองยืนยันอีกครั้ง", retryBindingRecovery, true);
    retryRecovery.className = "secondary-action spreadsheet-recovery-confirm";
    retryRecovery.setAttribute("aria-describedby", recoveryStatus.id);
    retryRecovery.hidden = true;
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
    let panelChanged = () => {};
    const optionsField = createOptionsField(() => panelChanged());
    authoringControls.push(...optionsField.controls);
    panel.append(optionsField.element);
    const headers = input("ใช้แถวแรกเป็นชื่อคอลัมน์", "checkbox");
    let editingKind = null;
    let selected = null;
    let entries = [];
    let selectionSequence = 0;
    const missingAnchor = (entry) =>
      Boolean(entry?.anchor) &&
      selected?.anchors?.some(
        ([name, reference]) => name === entry.anchor && !reference
      );
    const drafts = new Map();
    const draftBaselines = new Map();
    const pendingDrafts = new Set();
    const panelDraft = () => ({
      kind: kind.value,
      caption: caption.value,
      key: key.value,
      type: type.value,
      required: required.checked,
      placeholder: placeholder.value,
      choices: optionsField.getOptions(),
      optionEntry: optionsField.getEntry(),
      headers: headers.checked,
    });
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
      const draft = panelDraft();
      if (sameValue(draft, draftBaselines.get(target))) {
        // Pristine defaults are not drafts: their generated key can change after a metadata refresh.
        drafts.delete(target);
        pendingDrafts.delete(target);
      } else {
        drafts.set(target, {
          ...draft,
          optionEditor: optionsField.getEditorState(),
        });
        pendingDrafts.add(target);
        bridge.setDirtyState(true);
      }
    };
    panelChanged = captureDraft;
    for (const control of [
      caption,
      key,
      type,
      required,
      placeholder,
      headers,
      kind,
    ]) {
      control.addEventListener("input", captureDraft);
      control.addEventListener("change", captureDraft);
    }
    validatePanelDrafts = () => {
      captureDraft();
      if (pendingDrafts.size) {
        throw new Error(
          "มีการตั้งค่าช่องที่ยังไม่ได้บันทึก กรุณากด บันทึกการแก้ไข หรือ เพิ่มช่องจากช่วงที่เลือก ในแผงตั้งค่าฟิลด์ก่อนบันทึกแบบร่างหรือเผยแพร่"
        );
      }
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
        editingKind !== "field" ||
        editing?.type !== "picture" ||
        missingAnchor(editing);
      repairAnchor.hidden = !missingAnchor(editing);
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
      const missing = selected
        ? missingUploadPocBindings(selected, bindings)
        : [];
      if (missing.length) {
        message.textContent = `มีช่องที่ไม่พบตำแหน่งใน Excel ${missing.length} รายการ: ${missing.join(", ")} เลือกช่วงเซลล์ที่ต้องการ แล้วเลือกช่องเดิมจาก “ช่องที่บันทึกแล้ว” และกด “ผูกตำแหน่งใหม่กับช่วงที่เลือก” (ตารางเลือกเฉพาะแถวข้อมูล ไม่รวมหัวตาราง)`;
      }
      refreshRecoveryControls();
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
      headers.checked = false;
      existing.value = editing?.id || "";
      draftBaselines.set(draftKey(), panelDraft());
      const draft = drafts.get(draftKey());
      if (draft) {
        kind.value = editingKind || draft.kind;
        caption.value = draft.caption;
        key.value = draft.key;
        type.value = draft.type;
        required.checked = draft.required;
        placeholder.value = draft.placeholder;
        optionsField.setOptions(draft.choices);
        optionsField.setEditorState(
          draft.optionEditor || { entry: draft.optionEntry }
        );
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
    const uploadPocHelp = document.createElement("p");
    uploadPocHelp.textContent =
      "เลือกเซลล์ว่างแล้วกดวางปุ่มและบันทึกต้นแบบ ระบบสร้าง Title และ Tag และบันทึกปุ่มก่อนเลือกไฟล์ ถ้าเป็นช่องข้อความหรือคอลัมน์ตารางเดิมจะใช้ข้อมูลเดิม หลังบันทึกสำเร็จจึงดับเบิลคลิกเลือกไฟล์ ไฟล์ยังไม่อัปโหลดหรือบันทึกถาวร";
    uploadPocHelp.id = "spreadsheet-upload-poc-help";
    panel.append(uploadPocHelp);
    const placeUploadPoc = button("วางปุ่มและบันทึกต้นแบบ (POC)", async () => {
      const clickedSelection = await selection();
      // Initial identity is only a movement check. Authorize against fresh metadata below.
      const clickedEntry = selectedBinding(clickedSelection, bindings);
      await ensureAuthoringReady();
      validatePanelDrafts();
      // Reject pending browser Files before creating metadata or native workbook changes.
      await checkUploadPocPending(window, options, ACTIONS.SAVE_TEMPLATE);
      await readBindings();
      const refreshed = await selection();
      let current = {
        ...refreshed,
        sheet: clickedSelection.sheet,
        address: clickedSelection.address,
      };
      let entry = existingUploadPocEntry(current, bindings);
      if (
        clickedEntry &&
        ["field", "column"].includes(clickedEntry[0]) &&
        bindingValue(bindings, clickedEntry[0], clickedEntry[1].id) &&
        clickedEntry[1].id !== entry?.[1]?.id
      ) {
        throw new Error("ตำแหน่งช่องเปลี่ยนระหว่างวางปุ่ม กรุณาเลือกเซลล์ใหม่แล้วลองอีกครั้ง");
      }
      window.Asc.scope.folioUploadPocSelection = {
        ...current,
        column: entry?.[0] === "column",
        requireBlank: !entry,
      };
      const preflightRaw = await office.callCommandResult(
        spreadsheetUploadPocSelectionCommand
      );
      const preflight =
        typeof preflightRaw === "string"
          ? JSON.parse(preflightRaw)
          : preflightRaw;
      if (!preflight?.ok) {
        throw new Error(preflight?.error || "ตรวจสอบเซลล์ที่เลือกไม่ได้");
      }
      current = { ...current, address: preflight.address };
      entry = existingUploadPocEntry(current, bindings);
      if (!entry) {
        const value = automaticUploadPocField(bindings, id());
        const savedDraftKey = draftKey();
        await mutateBinding(
          { action: "upsert", kind: "field", value },
          {
            anchor: value.anchor,
            sheet: current.sheet,
            address: current.address,
          },
          async () => {
            // Recheck the blank cell under the existing transaction's native lock.
            window.Asc.scope.folioUploadPocSelection = {
              ...current,
              requireBlank: true,
            };
            const raw = await office.callCommandResult(
              spreadsheetUploadPocSelectionCommand
            );
            const checked = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (!checked?.ok || checked.address !== current.address) {
              throw new Error(
                checked?.error || "เซลล์ที่เลือกเปลี่ยนระหว่างสร้างช่อง กรุณาลองอีกครั้ง"
              );
            }
            await anchor(value.anchor, current);
            window.Asc.scope.folioSpreadsheetValidation = value;
            if (
              (await office.callCommandResult(
                spreadsheetValidationCommand,
                true
              )) !== true
            ) {
              throw new Error("ตั้งค่าช่องแนบไฟล์ไม่ได้ กรุณาลองอีกครั้ง");
            }
          },
          () => {
            drafts.delete(savedDraftKey);
            draftBaselines.delete(savedDraftKey);
            pendingDrafts.delete(savedDraftKey);
            selected = current;
            loadEntry(["field", value]);
          }
        );
      }
      // Bindings must be committed before a marker or drawing can be created.
      window.Asc.scope.folioSpreadsheetAnchors =
        spreadsheetBindingAnchors(bindings);
      const targetSelection = await selection();
      const target = selectedUploadPocTarget(
        { ...targetSelection, address: current.address, sheet: current.sheet },
        bindings
      );
      window.Asc.scope.folioSpreadsheetUploadPoc = {
        mark: true,
        targets: [target],
        preview: uploadPocPreview,
        guid: uploadPocGuid,
      };
      // A timed-out drawing command may still complete; retry replaces the same
      // managed objects. Mark dirty before dispatch so saving retains its marker.
      bridge.setDirtyState(true);
      try {
        const raw = await office.callCommandResult(
          spreadsheetUploadPocCommand,
          true
        );
        const result = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!result?.ok) {
          throw new Error(
            result?.error || "ยังยืนยันการวางปุ่ม POC ไม่ได้ กรุณาลองวางซ้ำ"
          );
        }
        window.Asc.scope.folioUploadPocSelection = {
          ...current,
          restore: true,
        };
        const restoredRaw = await office.callCommandResult(
          spreadsheetUploadPocSelectionCommand
        );
        const restored =
          typeof restoredRaw === "string"
            ? JSON.parse(restoredRaw)
            : restoredRaw;
        if (!restored?.ok) {
          throw new Error(
            "วางปุ่มแล้ว แต่ยังเลือกช่องเพื่อแสดง Title และ Tag ไม่ได้ กรุณาคลิกเซลล์เดิม"
          );
        }
        selected = await selection();
        loadEntry(existingUploadPocEntry(selected, bindings));
        // mutateBinding has confirmed its commit and released the native edit lock.
        uploadPocSaveInFlight = true;
        let saved;
        try {
          saved = await operations.runAction(ACTIONS.SAVE_TEMPLATE, "", null, {
            preserveEditorSession: true,
            preserveEditorSessionPurpose: "placement",
            uploadPocBindingId: target.bindingId,
          });
        } finally {
          uploadPocSaveInFlight = false;
        }
        if (!saved?.ok) {
          throw new Error(
            `วางปุ่มแล้ว แต่บันทึกต้นแบบยังไม่สำเร็จ: ${saved?.error || "ยังยืนยันผลไม่ได้"} กรุณากด “วางปุ่มและบันทึกต้นแบบ (POC)” ที่เซลล์เดิมเพื่อลองบันทึกซ้ำ ปุ่มและ Tag เดิมจะถูกใช้ต่อ ยังเลือกไฟล์ไม่ได้จนกว่าจะบันทึกสำเร็จ`
          );
        }
        setStatus(
          "วางปุ่มและบันทึกต้นแบบ POC สำเร็จในตัวแก้ไขเดิมแล้ว ดับเบิลคลิกปุ่มเพื่อเลือกไฟล์ได้ ไฟล์ยังไม่อัปโหลดหรือบันทึกถาวร",
          "success"
        );
      } finally {
        delete window.Asc.scope.folioSpreadsheetUploadPoc;
        delete window.Asc.scope.folioUploadPocSelection;
      }
    });
    placeUploadPoc.setAttribute("aria-describedby", uploadPocHelp.id);
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
      const targetAnchor =
        kind.value === "column" ? bindings?.table?.anchor : editing?.anchor;
      if (
        targetAnchor &&
        current.anchors?.some(
          ([name, reference]) => name === targetAnchor && !reference
        )
      ) {
        throw new Error(
          "ไม่พบตำแหน่งช่องนี้ กรุณาเลือกช่องหรือตารางเดิมแล้วกดผูกตำแหน่งใหม่ก่อนบันทึกการแก้ไข"
        );
      }
      await readBindings();
      if (editing) {
        editing = bindingValue(bindings, editingKind, editing.id);
        if (!editing) {
          throw new Error("ไม่พบช่องเดิมในการตั้งค่าล่าสุด กรุณาเปิดต้นแบบใหม่");
        }
      }
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
      if (
        kind.value !== "table" &&
        value.type === "dropdown" &&
        optionsField.getEntry().trim()
      ) {
        throw new Error(
          "มีตัวเลือกที่ยังไม่ได้เพิ่ม กรุณากด Add หรือ Update ในรายการตัวเลือกก่อนบันทึกการแก้ไข"
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
      const newTable = kind.value === "table" && !editing;
      const target = {
        anchor:
          kind.value === "column"
            ? spreadsheetColumnAnchor(value.id)
            : value.anchor,
        ...(kind.value === "table"
          ? {
              extraAnchorNames: spreadsheetBindingAnchors({
                fields: [],
                table: value,
              }).filter((name) => name !== value.anchor),
            }
          : {}),
      };
      if (!editing) {
        target.sheet = body.sheet;
        target.address = body.address;
      }
      const savedKind = kind.value;
      const savedDraftKey = draftKey();
      await mutateBinding(
        { kind: kind.value, action: "upsert", value },
        target,
        async () => {
          if (kind.value !== "column" && !editing) {
            await anchor(value.anchor, body);
          }
          if (kind.value === "table") {
            await synchronizeColumns(true, value);
          } else {
            const validation = {
              ...value,
              anchor: target.anchor,
            };
            if (savedKind === "column") {
              delete validation.offset;
            }
            window.Asc.scope.folioSpreadsheetValidation = validation;
            if (
              (await office.callCommandResult(
                spreadsheetValidationCommand,
                true
              )) !== true
            ) {
              throw new Error("ตั้งกฎชนิดข้อมูลไม่ได้ กรุณาลองอีกครั้ง");
            }
          }
        },
        async () => {
          const active =
            draftKey() === savedDraftKey || editing?.id === value.id;
          for (const targetKey of [savedDraftKey, `${savedKind}:${value.id}`]) {
            drafts.delete(targetKey);
            draftBaselines.delete(targetKey);
            pendingDrafts.delete(targetKey);
          }
          if (active) {
            loadEntry([savedKind, value]);
          }
          if (savedKind === "field" && value.type === "picture") {
            await ensurePictureFrame(value);
            setStatus("บันทึกฟิลด์และกรอบรูปแล้ว กรุณาบันทึกต้นแบบ", "success");
          }
          if (newTable) {
            window.Asc.scope.folioSpreadsheetTableBorders = current;
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
        }
      );
    });
    const remove = button("ลบช่องนี้", async () => {
      if (!editing) {
        return;
      }
      const clicked = await selection();
      if (
        clicked.uploadPocBindingId &&
        clicked.uploadPocBindingId !== editing.id
      ) {
        throw new Error("ปุ่มที่เลือกเปลี่ยนแล้ว กรุณารอให้ Title และ Tag อัปเดตก่อนลบ");
      }
      const hasPoc = clicked.drawing;
      const pocNames = uploadPocCleanupNames(
        { action: "delete", kind: editingKind, id: editing.id },
        bindings
      );
      window.Asc.scope.folioSpreadsheetUploadPocMarkerNames = pocNames;
      const marked = await office.callCommandResult(
        spreadsheetUploadPocHasMarkerCommand
      );
      delete window.Asc.scope.folioSpreadsheetUploadPocMarkerNames;
      const deletingPoc = Boolean(hasPoc || marked);
      validatePanelDrafts();
      await checkUploadPocPending(window, options, ACTIONS.SAVE_TEMPLATE);
      await readBindings(false);
      const current = bindingValue(bindings, editingKind, editing.id);
      if (!current) {
        throw new Error("ไม่พบช่องเดิมในการตั้งค่าล่าสุด กรุณาเปิดต้นแบบใหม่");
      }
      const target = {
        anchor:
          editingKind === "column"
            ? spreadsheetColumnAnchor(current.id)
            : current.anchor,
        removeAnchor: true,
        ...(editingKind === "table"
          ? {
              extraAnchorNames: spreadsheetBindingAnchors({
                fields: [],
                table: current,
              }).filter((name) => name !== current.anchor),
            }
          : {}),
      };
      const deletedKind = editingKind;
      const deletedDraftKey = draftKey();
      const deletedIds =
        deletedKind === "table"
          ? current.columns.map((column) => column.id)
          : [current.id];
      let nativeDeleteTargets = [];
      await mutateBinding(
        { kind: editingKind, action: "delete", id: current.id },
        target,
        async () => {
          if (deletingPoc) {
            nativeDeleteTargets = await captureUploadPocTargets(deletedIds);
          }
          window.Asc.scope.folioSpreadsheetValidation = target;
          if (
            (await office.callCommandResult(
              spreadsheetClearValidationCommand,
              true
            )) !== true
          ) {
            throw new Error("ลบกฎของช่องไม่ได้ กรุณาลองอีกครั้ง");
          }
        },
        async () => {
          uploadPocDeleteNeedsSave = true;
          pendingTemplateDeletePurpose = deletingPoc ? "delete" : "manual";
          if (deletingPoc) {
            for (const bindingId of deletedIds) {
              deletedUploadPocBindingIds.add(bindingId);
            }
            for (const deletedTarget of nativeDeleteTargets) {
              deletedUploadPocTargets.set(
                deletedTarget.nativeId,
                deletedTarget
              );
            }
          }
          try {
            await synchronizeColumns(false);
            initializationError = null;
          } catch (error) {
            initializationError = error;
          }
          drafts.delete(deletedDraftKey);
          draftBaselines.delete(deletedDraftKey);
          pendingDrafts.delete(deletedDraftKey);
          if (deletedKind === "table") {
            for (const column of current.columns) {
              const columnKey = `column:${column.id}`;
              drafts.delete(columnKey);
              draftBaselines.delete(columnKey);
              pendingDrafts.delete(columnKey);
            }
          }
          if (editing?.id === current.id) {
            loadEntry(null);
          }
        }
      );
      {
        uploadPocSaveInFlight = true;
        let saved;
        try {
          saved = await operations.runAction(ACTIONS.SAVE_TEMPLATE, "", null, {
            preserveEditorSession: true,
            preserveEditorSessionPurpose: deletingPoc ? "delete" : "manual",
            ...(deletingPoc
              ? { deletedUploadPocBindingIds: [...deletedUploadPocBindingIds] }
              : {}),
          });
        } finally {
          uploadPocSaveInFlight = false;
        }
        if (!saved?.ok) {
          throw new Error(
            `ลบการตั้งค่าปุ่มแล้ว แต่ยังบันทึกต้นแบบไม่สำเร็จ: ${saved?.error || "ยังยืนยันผลไม่ได้"} กรุณากด “บันทึกแบบร่าง” เพื่อลองบันทึกต้นแบบอีกครั้ง ห้ามเลือกไฟล์จากปุ่มเดิม`
          );
        }
        setStatus(
          deletingPoc
            ? "ลบช่องและปุ่ม POC พร้อมบันทึกต้นแบบแล้ว"
            : "ลบช่องและบันทึกต้นแบบในตัวแก้ไขเดิมแล้ว",
          "success"
        );
      }
    });
    remove.className = "secondary-action";
    remove.title = "ลบช่องแล้วบันทึกต้นแบบทั้งฉบับในตัวแก้ไขเดิมทันที";
    const restorePicture = button("สร้างกรอบรูปอีกครั้ง", async () => {
      if (editingKind !== "field" || editing?.type !== "picture") {
        return;
      }
      await ensurePictureFrame(editing);
      setStatus("เตรียมกรอบรูปแล้ว กรุณาบันทึกต้นแบบ", "success");
    });
    restorePicture.className = "secondary-action";
    const repairAnchor = button("ผูกตำแหน่งใหม่กับช่วงที่เลือก", async () => {
      if (!editing?.anchor) {
        return;
      }
      const current = await selection();
      if (
        !current.anchors?.some(
          ([name, reference]) => name === editing.anchor && !reference
        )
      ) {
        throw new Error("ช่องนี้มีตำแหน่งอ้างอิงแล้ว กรุณาเลือกช่องที่ตำแหน่งหาย");
      }
      if (editingKind === "table") {
        const range = tableSelection(current.address);
        if (
          editing.columns.length > 0 &&
          range.width !==
            Math.max(...editing.columns.map((column) => column.offset)) + 1
        ) {
          throw new Error(
            "เลือกช่วงข้อมูลให้มีจำนวนคอลัมน์ตรงกับตารางเดิม โดยไม่รวมหัวตาราง"
          );
        }
      }
      const target = {
        anchor: editing.anchor,
        sheet: current.sheet,
        address: current.address,
        ...(editingKind === "table"
          ? {
              extraAnchorNames: spreadsheetBindingAnchors({
                fields: [],
                table: editing,
              }).filter((name) => name !== editing.anchor),
            }
          : {}),
      };
      window.Asc.scope.folioSpreadsheetValidation = target;
      const snapshot = await office.callCommandResult(
        spreadsheetCaptureValidationCommand
      );
      if (!snapshot) {
        throw new Error("สำรองตำแหน่งช่องเดิมไม่ได้ กรุณาลองอีกครั้ง");
      }
      try {
        await anchor(editing.anchor, current);
        if (editingKind === "table") {
          await synchronizeColumns(true, editing, true);
          initializationError = null;
        }
      } catch (error) {
        window.Asc.scope.folioSpreadsheetValidationSnapshot = snapshot;
        try {
          if (
            (await office.callCommandResult(
              spreadsheetRestoreValidationCommand,
              true
            )) !== true
          ) {
            throw new Error("คืนตำแหน่งเดิมไม่ได้", { cause: error });
          }
        } catch {
          authoringMismatch = true;
          throw new Error("คืนตำแหน่งเดิมไม่ได้ กรุณาเปิดต้นแบบใหม่ก่อนบันทึก", {
            cause: error,
          });
        } finally {
          delete window.Asc.scope.folioSpreadsheetValidationSnapshot;
        }
        throw error;
      }
      selected = await selection();
      updateControls();
      setStatus("ผูกตำแหน่งใหม่แล้ว กรุณาบันทึกการแก้ไขช่องและบันทึกแบบร่าง", "success");
    });
    repairAnchor.className = "secondary-action";
    const recoveryControlStates = new Map();
    refreshRecoveryControls = () => {
      recoveryStatus.hidden = !pendingRecovery;
      retryRecovery.hidden = !pendingRecovery;
      retryRecovery.disabled = busy;
      for (const control of authoringControls) {
        if (control === existing) {
          continue;
        }
        if (pendingRecovery || uploadPocDeleteNeedsSave) {
          if (!recoveryControlStates.has(control)) {
            recoveryControlStates.set(
              control,
              controlStates.has(control)
                ? controlStates.get(control)
                : control.disabled
            );
          }
          control.disabled = true;
        } else if (recoveryControlStates.has(control)) {
          const disabled = recoveryControlStates.get(control);
          control.disabled = disabled;
          if (controlStates.has(control)) {
            controlStates.set(control, disabled);
          }
        }
      }
      if (pendingRecovery || uploadPocDeleteNeedsSave) {
        for (const item of buttons) {
          item.disabled = !pendingRecovery || item !== retryRecovery || busy;
        }
      } else {
        recoveryControlStates.clear();
      }
    };
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
      window.Asc.scope.folioSpreadsheetAnchors =
        spreadsheetBindingAnchors(bindings);
    };
    let selectionRefreshInFlight = false;
    const refreshSelection = async () => {
      if (busy || selectionRefreshInFlight) {
        return;
      }
      selectionRefreshInFlight = true;
      selectionSequence += 1;
      const sequence = selectionSequence;
      try {
        const current = await selection();
        if (sequence !== selectionSequence || busy) {
          return;
        }
        if (
          selected?.sheet === current.sheet &&
          selected?.address === current.address &&
          JSON.stringify(selected?.anchors) ===
            JSON.stringify(current.anchors) &&
          JSON.stringify(selected?.drawing) === JSON.stringify(current.drawing)
        ) {
          return;
        }
        captureDraft();
        selected = current;
        const objectBinding = selectedUploadPocBinding(
          current,
          bindings,
          uploadPocGuid
        );
        const match =
          objectBinding?.entry || selectedBinding(current, bindings);
        loadEntry(match);
      } catch (error) {
        if (sequence !== selectionSequence || busy) {
          return;
        }
        captureDraft();
        selected = null;
        loadEntry(null);
        message.textContent = error.message;
      } finally {
        selectionRefreshInFlight = false;
      }
    };
    refreshAfterAction = async () => {
      updateControls();
      await refreshSelection();
    };
    window.Asc.plugin.attachEditorEvent?.("onTargetPositionChanged", () => {
      void refreshSelection();
    });
    window.Asc.plugin.attachEditorEvent?.("onChangeCurrentSheet", () => {
      void refreshSelection();
    });
    window.Asc.plugin.attachEditorEvent?.("onDocumentContentReady", () => {
      void refreshSelection();
    });
    // Native caret events do not cover OLE selection in ONLYOFFICE 9.4.
    // Read-only polling keeps the Admin panel aligned with selected drawings.
    let selectionPollingStopped = false;
    let selectionPollTimer;
    const pollDrawingSelection = () => {
      if (selectionPollingStopped) {
        return;
      }
      if (pendingRecovery) {
        selectionPollTimer = window.setTimeout(pollDrawingSelection, 500);
        return;
      }
      void refreshSelection().finally(() => {
        if (!selectionPollingStopped) {
          selectionPollTimer = window.setTimeout(pollDrawingSelection, 500);
        }
      });
    };
    const stopSelectionPolling = () => {
      selectionPollingStopped = true;
      window.clearTimeout(selectionPollTimer);
    };
    window.addEventListener("pagehide", stopSelectionPolling);
    window.addEventListener("unload", stopSelectionPolling);
    selectionPollTimer = window.setTimeout(pollDrawingSelection, 500);
    renderList();
    updateControls();
    let initializationError = null;
    busy = true;
    for (const item of buttons) {
      item.disabled = true;
    }
    const columnsReady = synchronizeColumns(true)
      .catch((error) => {
        initializationError = error;
        setStatus(error.message, "error");
      })
      .finally(() => {
        busy = false;
        for (const item of buttons) {
          item.disabled = false;
        }
        void refreshSelection();
      });
    ensureAuthoringReady = async () => {
      await columnsReady;
      if (pendingRecovery) {
        throw new Error(
          "ยังยืนยันผลการตั้งค่าไม่ได้ กรุณากด ลองยืนยันอีกครั้ง ก่อนบันทึกแบบร่างหรือเผยแพร่"
        );
      }
      if (authoringMismatch || initializationError) {
        throw new Error(
          initializationError?.message ||
            "การตั้งค่าช่องกับเอกสารยังไม่ตรงกัน กรุณาเปิดต้นแบบใหม่ก่อนบันทึก"
        );
      }
      await synchronizeColumns(false);
    };
    window.FormBridge = {
      getRuntimeOptions: () => options,
      runAction: operations.runAction,
      saveSpreadsheetBinding: changeBinding,
      getSpreadsheetBindings: readBindings,
      refreshSelection,
      retrySpreadsheetBinding: retryBindingRecovery,
    };
    renderList();
  } else {
    message.hidden = true;
    if (options.scopeIdentity && options.action !== ACTIONS.CORRECTION) {
      const activateUploadPoc = () => {
        window.Asc.scope.folioUploadPocActivation = {
          bindings,
          guid: uploadPocGuid,
        };
        return office
          .callCommandResult(spreadsheetUploadPocActivationCommand, true)
          .then((raw) => {
            const result = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (!result?.ok) {
              throw new Error(
                result?.error || "ONLYOFFICE รุ่นนี้ยังเปิดปุ่มเลือกไฟล์ POC ไม่ได้"
              );
            }
            if (result.count > 0) {
              setStatus(
                "พร้อมเลือกไฟล์ POC ไฟล์อยู่ในหน้านี้เท่านั้น ยังไม่อัปโหลดหรือบันทึกถาวร",
                "success"
              );
            }
          })
          .finally(() => {
            delete window.Asc.scope.folioUploadPocActivation;
          });
      };
      const activation = createUploadPocActivationLifecycle(
        activateUploadPoc,
        (error) => setStatus(error.message, "error")
      );
      window.Asc.plugin.attachEditorEvent?.("onDocumentContentReady", () => {
        void activation.ready();
      });
      // Autostart may begin after content-ready; every editor remount gets a fresh instance.
      window.setTimeout(() => {
        void activation.fallback();
      }, 1000);
    }
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
