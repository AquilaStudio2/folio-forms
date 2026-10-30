import { spreadsheetColumnAnchor } from "./spreadsheet-columns.js";
// oxlint-disable complexity prefer-destructuring prefer-await-to-callbacks prefer-await-to-then -- Keep origin, target and asynchronous generation fences together at the plugin boundary.
import { selectionPosition } from "./spreadsheet-selection.js";

const mappedTarget = (selected, bindings, documentKey) => {
  if (selected.drawing || selected.uploadPocBindingId) {
    return null;
  }
  const references = new Map(selected.anchors || []);
  const location = (anchor) => {
    const reference = references.get(anchor);
    if (typeof reference !== "string") {
      return null;
    }
    const separator = reference.lastIndexOf("!");
    const sheet = reference
      .slice(0, separator)
      .replace(/^'/u, "")
      .replace(/'$/u, "")
      .replaceAll("''", "'");
    if (sheet !== selected.sheet) {
      return null;
    }
    const parts = reference.slice(separator + 1).split(":");
    return {
      first: selectionPosition(parts[0]),
      last: selectionPosition(parts[1] || parts[0]),
    };
  };
  const parts = selected.address.split(":");
  const point = selectionPosition(parts[0]);
  const end = selectionPosition(parts[1] || parts[0]);
  const single = point.column === end.column && point.row === end.row;
  const contains = (range) =>
    range &&
    point.column >= range.first.column &&
    point.column <= range.last.column &&
    point.row >= range.first.row &&
    point.row <= range.last.row;
  const fields = (bindings.fields || []).filter((field) => {
    const range = location(field.anchor);
    return (
      field.source === "pdms-project-name" &&
      contains(range) &&
      (single ||
        (point.column === range.first.column &&
          point.row === range.first.row &&
          end.column === range.last.column &&
          end.row === range.last.row))
    );
  });
  if (fields.length === 1) {
    const [field] = fields;
    return { bindingId: field.id, key: field.key, label: field.label };
  }
  if (fields.length || !single || !bindings.table) {
    return null;
  }
  const body = location(bindings.table.anchor);
  if (!contains(body)) {
    return null;
  }
  const columns = bindings.table.columns.filter((field) => {
    const range = location(spreadsheetColumnAnchor(field.id));
    return (
      field.source === "pdms-project-name" &&
      range &&
      range.first.column === point.column &&
      range.last.column === point.column &&
      range.first.row <= point.row &&
      range.last.row >= point.row
    );
  });
  if (columns.length !== 1) {
    return null;
  }
  const [field] = columns;
  return {
    bindingId: field.id,
    key: `${bindings.table.key}.${field.key}`,
    label: field.label,
    row: { documentKey, index: point.row - body.first.row },
    rowLabel: `แถว ${point.row + 1}`,
  };
};

/** The background iframe can ask to locate/select, but cannot send actions or addresses. */
export const createPdmsPopupOwner = ({
  options,
  bindings,
  readSelection,
  getCatalog,
  getBusy,
  choose,
  retry,
  preview,
  setStatus,
}) => {
  if (!options.pdmsPopupChannelId || typeof readSelection !== "function") {
    return null;
  }
  let instanceId = null;
  let sequence = 0;
  let generation = 0;
  let target = null;
  let choicePending = false;
  let cancelled = false;
  let destroyed = false;
  const send = (cancelledState = false) => {
    if (!instanceId || destroyed) {
      return;
    }
    window.top.postMessage(
      {
        bridgeId: options.bridgeId,
        channelId: options.pdmsPopupChannelId,
        documentKey: options.documentKey,
        instanceId,
        sequence,
        source: "form-bridge",
        state: {
          busy: getBusy() || choicePending,
          cancelled: cancelledState,
          catalog: getCatalog(),
          preview,
          target,
        },
        type: "pdms-popup-state",
      },
      options.parentOrigin
    );
  };
  const invalidate = (cancelledState = false) => {
    generation += 1;
    target = null;
    send(cancelledState);
  };
  const locate = async () => {
    invalidate();
    const current = generation;
    if (getBusy() || choicePending) {
      return;
    }
    const selected = await readSelection();
    if (destroyed || generation !== current || getBusy() || choicePending) {
      return;
    }
    const mapped = mappedTarget(selected, bindings, options.documentKey);
    target = mapped
      ? {
          ...mapped,
          sessionId: getCatalog()?.sessionId,
          token: window.crypto.randomUUID(),
        }
      : null;
    send();
  };
  const handle = async (event) => {
    const message = event.data;
    if (
      destroyed ||
      event.source !== window.top ||
      event.origin !== options.parentOrigin ||
      message?.source !== "folio-pdms-popup-host" ||
      message.bridgeId !== options.bridgeId ||
      message.channelId !== options.pdmsPopupChannelId ||
      message.documentKey !== options.documentKey ||
      typeof message.instanceId !== "string" ||
      !Number.isSafeInteger(message.sequence)
    ) {
      return;
    }
    if (message.type === "locate") {
      if (
        message.sequence <= sequence ||
        (instanceId && message.instanceId !== instanceId)
      ) {
        return;
      }
      instanceId = message.instanceId;
      sequence = message.sequence;
      cancelled = false;
      await locate();
      return;
    }
    if (message.instanceId !== instanceId || message.sequence !== sequence) {
      return;
    }
    if (message.type === "cancel") {
      cancelled = true;
      invalidate(true);
      return;
    }
    if (
      !target ||
      target.token !== message.token ||
      getBusy() ||
      choicePending
    ) {
      return;
    }
    if (message.type === "retry") {
      const currentSequence = sequence;
      await retry();
      if (!destroyed && !cancelled && currentSequence === sequence) {
        await locate();
      }
      return;
    }
    if (
      message.type !== "choose" ||
      preview ||
      typeof message.name !== "string" ||
      getCatalog()?.status !== "ready" ||
      !getCatalog().names.includes(message.name)
    ) {
      return;
    }
    const captured = target;
    const capturedGeneration = generation;
    choicePending = true;
    send();
    try {
      const selected = await readSelection();
      const current = mappedTarget(selected, bindings, options.documentKey);
      if (
        destroyed ||
        capturedGeneration !== generation ||
        getBusy() ||
        captured.sessionId !== getCatalog()?.sessionId ||
        !current ||
        current.bindingId !== captured.bindingId ||
        current.row?.index !== captured.row?.index
      ) {
        invalidate();
        return;
      }
      await choose(message.name, captured);
    } finally {
      choicePending = false;
      if (!destroyed && !getBusy()) {
        await locate();
      }
    }
  };
  const listener = (event) => {
    void handle(event).catch((error) => {
      invalidate();
      setStatus(error.message, "error");
    });
  };
  window.addEventListener("message", listener);
  // Binding reconciliation can replace this owner without remounting the native
  // editor. Ask the same opening's popup to resolve its current cell again.
  window.top.postMessage(
    {
      bridgeId: options.bridgeId,
      channelId: options.pdmsPopupChannelId,
      documentKey: options.documentKey,
      source: "form-bridge",
      type: "pdms-popup-owner-ready",
    },
    options.parentOrigin
  );
  return {
    busyChanged() {
      if (getBusy()) {
        invalidate();
      } else {
        send();
      }
    },
    changed: invalidate,
    destroy() {
      invalidate();
      destroyed = true;
      window.removeEventListener("message", listener);
    },
  };
};
