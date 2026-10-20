// oxlint-disable prefer-await-to-callbacks node/callback-return unicorn/prefer-dom-node-remove prefer-destructuring unicorn/prefer-response-static-json no-await-in-loop unicorn/consistent-function-scoping no-plusplus unicorn/prefer-array-find no-empty-function -- VM harness intentionally mirrors browser callbacks and DOM shims.
import path from "node:path";
import { setImmediate as nextEventLoopTurn } from "node:timers/promises";
import { runInNewContext } from "node:vm";

import { buildPlugin } from "../../server/src/plugin-bundle.ts";
import { createNativeValidationModel } from "./spreadsheet-native-state.js";

const pluginDirectory = path.dirname(import.meta.dirname);
const pluginArtifact = await buildPlugin(pluginDirectory);
const pluginSource = await pluginArtifact.text();
const recordEntries = (value) => Object.entries(value ?? {});

export const createHarness = ({
  action = "fill",
  documentKind = "docx",
  spreadsheetBindings = { fields: [], table: null, version: 1 },
  spreadsheetPictureFrames = [],
  spreadsheetSelection = {},
  browserGlobals = {},
  capabilityResponses = [],
  clipboard,
  controls = [],
  editorSaveSupported = true,
  holdEditorSave = false,
  prefill,
  responses = [],
  selection,
  serializeCommands = false,
  tagAliases,
} = {}) => {
  const parentOrigin = "https://web.example.test";
  const bridgeId = "bridge-test-1";
  const messages = [];
  const messageListeners = [];
  const windowEventListeners = new Map();
  const editorEvents = new Map();
  const elements = new Map();
  const requests = [];
  const methodCalls = [];
  const methodInvocations = [];
  const saveCalls = [];
  const timers = [];
  const queuedCapabilityResponses = [...capabilityResponses];
  const queuedResponses = [...responses];
  const selectionState = {
    currentControl: selection?.currentControl,
    properties: selection?.properties,
  };
  let pendingEditorSaveRequest;

  const createElement = (tagName = "div", id = "") => {
    const listeners = new Map();
    const element = {
      addEventListener(type, listener) {
        const callbacks = listeners.get(type) || [];
        callbacks.push(listener);
        listeners.set(type, callbacks);
      },
      append(...children) {
        for (const child of children) {
          if (!child) {
            continue;
          }
          child.parentNode = this;
          this.children.push(child);
        }
      },
      appendChild(child) {
        if (!child) {
          return child;
        }
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      checked: false,
      children: [],
      dataset: {},
      disabled: false,
      dispatchEvent(event = {}) {
        const callbacks = listeners.get(event.type) || [];
        const dispatched = {
          ...event,
          currentTarget: this,
          preventDefault:
            event.preventDefault ||
            (() => {
              // Browser event cancellation is not modeled by this DOM shim.
            }),
          target: event.target || this,
        };
        for (const callback of callbacks) {
          callback(dispatched);
        }
        return true;
      },
      hidden: false,
      id,
      remove() {
        if (!this.parentNode) {
          return;
        }
        this.parentNode.removeChild(this);
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
          this.children.splice(index, 1);
          child.parentNode = undefined;
        }
        return child;
      },
      replaceChildren(...children) {
        this.children = [];
        this.append(...children);
      },
      select() {
        // Text selection is not modeled by this DOM shim.
      },
      setAttribute(name, value) {
        this[name] = String(value);
      },
      style: {},
      tagName: tagName.toUpperCase(),
      textContent: "",
      value: "",
    };
    if (id) {
      elements.set(id, element);
    }
    return element;
  };

  const panelIds = [
    "field-apply-pointer",
    "field-panel",
    "field-picture-help",
    "field-policy-form",
    "field-prefill-policy",
    "field-required",
    "field-save",
    "field-schema-list",
    "field-schema-next",
    "field-schema-query",
    "field-schema-search",
    "field-selection-tag",
    "field-selection-type",
    "field-panel-status",
    "form-bridge-status",
  ];
  for (const id of panelIds) {
    createElement("div", id);
  }
  elements.get("field-panel").hidden = true;
  const statusElement = elements.get("form-bridge-status");

  const dispatch = (event) => {
    for (const listener of messageListeners) {
      listener(event);
    }
  };
  const parentWindow = {
    postMessage(message, targetOrigin) {
      messages.push({ message, targetOrigin });
      if (message.type === "editor-save-request") {
        pendingEditorSaveRequest = message;
        if (!holdEditorSave) {
          queueMicrotask(() => {
            dispatch({
              data: {
                ...message,
                saved: true,
                source: "folio-parent",
                type: "editor-save-response",
              },
              origin: parentOrigin,
              source: parentWindow,
            });
          });
        }
        return;
      }

      if (message.type !== "capability-request") {
        return;
      }

      const response = queuedCapabilityResponses.shift();
      if (response === undefined) {
        return;
      }

      queueMicrotask(() => {
        dispatch({
          data: {
            ...message,
            ...(typeof response === "string"
              ? { capability: response }
              : response),
            source: "folio-parent",
            type: "capability-response",
          },
          origin: parentOrigin,
          source: parentWindow,
        });
      });
    },
  };

  const plugin = {
    attachEditorEvent(name, callback) {
      const callbacks = editorEvents.get(name) || [];
      callbacks.push(callback);
      editorEvents.set(name, callbacks);
    },
    executeMethod(method, ...args) {
      methodCalls.push(method);
      methodInvocations.push({ args: args[0], method });
      const done = args.at(-1);
      if (typeof done !== "function") {
        return;
      }
      if (selection !== undefined) {
        if (method === "GetCurrentContentControl") {
          done(selectionState.currentControl);
          return;
        }
        if (method === "GetCurrentContentControlPr") {
          done(selectionState.properties);
          return;
        }
      }
      done();
    },
    info: {
      guid: "asc.test-plugin",
      options: {
        action,
        apiBase: "https://api.example.test/",
        bridgeId,
        documentKey: "document-key",
        documentKind,
        parentOrigin,
        prefill,
        publicId: "public-id",
        responseId: "response-id",
        spreadsheetBindings,
        spreadsheetPictureFrames,
        tagAliases,
        targetId: "target-id",
      },
    },
  };

  const fetch = (input, init = {}) => {
    const payload = queuedResponses.shift();
    if (payload === undefined) {
      throw new Error("Unexpected plugin request");
    }
    requests.push({
      body: init.body,
      credentials: init.credentials,
      headers: init.headers,
      method: init.method ?? "GET",
      url: String(input),
    });
    if (payload instanceof Response) {
      return payload;
    }
    if (
      payload &&
      typeof payload === "object" &&
      payload.httpStatus !== undefined
    ) {
      return new Response(JSON.stringify(payload.body ?? {}), {
        status: payload.httpStatus,
      });
    }
    return Response.json(payload);
  };

  const window = {
    Asc: { plugin },
    addEventListener(type, listener) {
      if (type === "message") {
        messageListeners.push(listener);
      }
      const callbacks = windowEventListeners.get(type) || [];
      callbacks.push(listener);
      windowEventListeners.set(type, callbacks);
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cancelled = true;
      }
    },
    setTimeout(callback, milliseconds) {
      const timer = { callback, cancelled: false, milliseconds };
      timers.push(timer);
      if (milliseconds === 1000) {
        queueMicrotask(() => {
          if (!timer.cancelled) {
            return callback();
          }
        });
      }
      return timer;
    },
    top: parentWindow,
  };
  const officeControl = {
    GetClassType() {
      return "inlineLvlSdt";
    },
    GetFormType() {
      return selection?.formType || "";
    },
    GetInternalId() {
      return selectionState.currentControl;
    },
    GetTag() {
      return selectionState.properties?.Tag || "";
    },
    SetTag(tag) {
      selectionState.properties.Tag = tag;
      return true;
    },
  };
  const spreadsheetNames = new Map(recordEntries(spreadsheetSelection.names));
  const spreadsheetBorders = [];
  const visibleSpreadsheetBorders = [];
  const spreadsheetValidations = new Map(
    recordEntries(spreadsheetSelection.validations)
  );
  const spreadsheetNumberFormats = new Map(
    recordEntries(spreadsheetSelection.formats)
  );
  const nativeValidationModel = createNativeValidationModel(
    spreadsheetValidations
  );
  Object.assign(window.Asc, nativeValidationModel.constructors);
  const normalizedAddress = (address) =>
    address.split("!").at(-1).replaceAll("$", "");
  const position = (address) => ({
    column: [...address.match(/^[A-Z]+/u)[0]].reduce(
      (index, character) => index * 26 + character.codePointAt(0) - 64,
      0
    ),
    row: Number(address.match(/\d+/u)[0]),
  });
  const spreadsheetValidation = (address) => {
    const key = normalizedAddress(address);
    const validation = {
      Add(type, alertStyle, operator, formula1, formula2) {
        spreadsheetValidations.set(key, {
          alertStyle,
          formula1,
          formula2,
          operator,
          type,
        });
        return validation;
      },
      Delete() {
        spreadsheetValidations.delete(key);
        return true;
      },
      get validations() {
        return nativeValidationModel.rules(key);
      },
    };
    for (const property of [
      "Type",
      "AlertStyle",
      "Operator",
      "Formula1",
      "Formula2",
      "ErrorMessage",
      "ErrorTitle",
      "InputMessage",
      "InputTitle",
      "IgnoreBlank",
      "InCellDropdown",
      "ShowError",
      "ShowInput",
    ]) {
      const stateKey = property[0].toLowerCase() + property.slice(1);
      validation[`Get${property}`] = () =>
        spreadsheetValidations.get(key)?.[stateKey] ?? null;
      validation[`Set${property}`] = (value) => {
        const rule = spreadsheetValidations.get(key);
        if (rule) {
          rule[stateKey] = value;
        }
      };
    }
    return validation;
  };
  // oxlint-disable no-use-before-define -- Native sheet and range objects refer to one another lazily.
  const spreadsheetSheet = () => ({
    GetName: () => spreadsheetSelection?.sheet || "Sheet1",
    GetRange: spreadsheetRange,
    GetSelection: () => spreadsheetRange(spreadsheetSelection?.address || "A1"),
    SetActive() {},
    worksheet: nativeValidationModel.worksheet,
  });
  // oxlint-enable no-use-before-define
  const spreadsheetRange = (address) => ({
    GetAddress: () => address,
    GetCol: () => position(normalizedAddress(address)).column,
    GetColumnsCount: () => {
      const [first, last = first] = normalizedAddress(address).split(":");
      return position(last).column - position(first).column + 1;
    },
    GetFormula: () => "",
    GetNumberFormat: () =>
      spreadsheetNumberFormats.get(normalizedAddress(address)) ?? "General",
    GetRow: () => position(normalizedAddress(address)).row,
    GetRowsCount: () => {
      const [first, last = first] = normalizedAddress(address).split(":");
      return position(last).row - position(first).row + 1;
    },
    GetValidation: () => spreadsheetValidation(address),
    GetValue: () => spreadsheetSelection?.headers || "",
    GetWorksheet: spreadsheetSheet,
    SetBorders(border, style, color) {
      spreadsheetBorders.push({ address, border, color, style });
      return true;
    },
    SetNumberFormat(format) {
      spreadsheetNumberFormats.set(normalizedAddress(address), format);
      return true;
    },
    range: nativeValidationModel.range(normalizedAddress(address)),
  });
  const Api = {
    AddDefName(name, reference) {
      spreadsheetNames.set(name, reference);
      return true;
    },
    CreateColorFromRGB: (red, green, blue) => ({ blue, green, red }),
    DeleteDefName(name) {
      return spreadsheetNames.delete(name);
    },
    GetActiveSheet: spreadsheetSheet,
    GetDefName(name) {
      const reference = spreadsheetNames.get(name);
      if (!reference) {
        throw new Error(`Defined name does not exist:${name}`);
      }
      return reference
        ? {
            Delete: () => spreadsheetNames.delete(name),
            GetName: () => name,
            GetRefersTo: () => reference,
            GetRefersToRange: () =>
              spreadsheetRange(reference.split("!").at(-1)),
            SetRefersTo(value) {
              spreadsheetNames.set(name, value);
              return true;
            },
          }
        : null;
    },
    GetDocument() {
      return {
        GetAllContentControls() {
          return controls;
        },
        GetCurrentContentControl() {
          return selection ? officeControl : null;
        },
        GetCurrentContentControlPr() {
          return selectionState.properties || {};
        },
      };
    },
    GetSheet: spreadsheetSheet,
    Save() {
      saveCalls.push("save");
      return true;
    },
  };
  plugin.callCommand = function callCommand(...args) {
    const command = args[0];
    const callback = args.at(-1);
    if (typeof callback !== "function") {
      return;
    }
    const done = (result) => {
      // Spreadsheet formatting stays offscreen until a calculating command
      // refreshes the editor, even though the workbook model already changed.
      if (args[2] !== false) {
        visibleSpreadsheetBorders.splice(
          0,
          visibleSpreadsheetBorders.length,
          ...spreadsheetBorders
        );
      }
      callback(result);
    };
    if (serializeCommands && typeof command === "function") {
      done(
        runInNewContext(`(${command.toString()})()`, {
          Api,
          Asc: window.Asc,
          AscCommonExcel: nativeValidationModel.AscCommonExcel,
        })
      );
      return;
    }
    if (
      command?.name === "getCurrentContentControlCommand" &&
      selectionState.properties
    ) {
      done(command());
      return;
    }
    if (
      command?.name === "setCurrentContentControlTagCommand" &&
      selectionState.properties
    ) {
      const tag = window.Asc.scope?.formBridgeSelectionTag;
      selectionState.properties.Tag = tag;
      done(JSON.stringify({ ok: true, tag }));
      return;
    }
    if (typeof command === "function") {
      done(command());
      return;
    }
    done(JSON.stringify({ name: "Ada", value: "example" }));
  };
  const document = {
    body: createElement("body"),
    createElement,
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      if (selector.startsWith("#")) {
        return elements.get(selector.slice(1)) || null;
      }
      return statusElement;
    },
  };
  const context = {
    ...browserGlobals,
    AbortController,
    Api,
    Asc: window.Asc,
    AscCommonExcel: nativeValidationModel.AscCommonExcel,
    Headers,
    Response,
    document,
    fetch,
    navigator: clipboard ? { clipboard } : undefined,
    queueMicrotask,
    window,
  };

  runInNewContext(pluginSource, context, {
    filename: "apps/onlyoffice-plugin/dist/plugin.js",
  });
  window.Asc.plugin.init();

  return {
    body: document.body,
    bridgeId,
    dispatch,
    editorEvents,
    editorSaveSupported,
    element(id) {
      return elements.get(id);
    },
    emitEditorEvent(name, value) {
      for (const callback of editorEvents.get(name) || []) {
        callback(value);
      }
    },
    emitWindowEvent(type) {
      for (const listener of windowEventListeners.get(type) || []) {
        listener();
      }
    },
    expireCapabilityRequests() {
      for (const timer of timers) {
        if (timer.milliseconds !== 5000 || timer.cancelled) {
          continue;
        }
        timer.cancelled = true;
        timer.callback();
      }
    },
    expireEditorSaveRequests() {
      for (const timer of timers) {
        if (timer.milliseconds === 45_000 && !timer.cancelled) {
          timer.cancelled = true;
          timer.callback();
        }
      }
    },
    finishEditorSave(error) {
      dispatch({
        data: {
          ...pendingEditorSaveRequest,
          ...(error ? { error } : { saved: true }),
          source: "folio-parent",
          type: "editor-save-response",
        },
        origin: parentOrigin,
        source: parentWindow,
      });
    },
    messages,
    methodCalls,
    methodInvocations,
    parentOrigin,
    parentWindow,
    requests,
    async runPictureGuardTimer() {
      const timer = timers.find(
        (item) => item.milliseconds === 750 && !item.cancelled
      );
      if (!timer) {
        return false;
      }
      timer.cancelled = true;
      await timer.callback();
      return true;
    },
    saveCalls,
    setSelection(nextSelection) {
      selectionState.currentControl = nextSelection?.currentControl;
      selectionState.properties = nextSelection?.properties;
    },
    spreadsheetBorders,
    spreadsheetNames,
    spreadsheetNumberFormats,
    spreadsheetValidations,
    statusElement,
    visibleSpreadsheetBorders,
    window,
  };
};

export const completedOperation = (result = {}) => ({
  operation: { result, status: "completed" },
});
export const acknowledgeBridge = (harness) => {
  harness.dispatch({
    data: {
      bridgeId: harness.bridgeId,
      editorSaveSupported: harness.editorSaveSupported,
      source: "folio-parent",
      type: "bridge-ack",
    },
    origin: harness.parentOrigin,
    source: harness.parentWindow,
  });
};
// Drain the current promise chain, including nested editor callbacks, without
// relying on a fixed number of microtasks or advancing the harness's timers.
export const flushPlugin = () => nextEventLoopTurn();

export const selectedControl = (
  tag = "title",
  controlType = "text",
  internalId = "control-1"
) => ({
  currentControl: internalId,
  properties: {
    InternalId: internalId,
    Tag: tag,
    Type: controlType,
  },
});
