import { ACTIONS } from "./constants.js";
import { createPdmsPopupOwner } from "./pdms-popup-owner.js";

/** Own the opening's catalog and trusted save action; the adjacent iframe owns presentation. */
export const createPdmsProjectPicker = (
  options,
  bindings,
  operations,
  setStatus,
  readSelection,
  isEditorBusy = () => false
) => {
  const fields = [
    ...(bindings?.fields || []),
    ...(bindings?.table?.columns || []),
  ];
  if (!fields.some((field) => field.source === "pdms-project-name")) {
    return null;
  }
  const preview = options.action === ACTIONS.TEMPLATE_EDIT;
  let catalog = options.pdmsProjectCatalog;
  let busy = false;
  let retrying = false;
  let popupOwner = null;
  const setBusy = (value) => {
    const changed = busy !== value;
    busy = value;
    if (changed) {
      popupOwner?.busyChanged();
    }
  };
  const choose = async (name, capturedTarget) => {
    if (busy || preview || catalog?.status !== "ready") {
      return;
    }
    setBusy(true);
    const outcome = await operations.runAction(
      options.action === ACTIONS.CORRECTION
        ? ACTIONS.SAVE_CORRECTION_WORKSPACE
        : ACTIONS.SAVE_DRAFT,
      "",
      null,
      {
        pdmsSelection: {
          bindingId: capturedTarget.bindingId,
          name,
          sessionId: catalog.sessionId,
          ...(capturedTarget.row ? { row: capturedTarget.row } : {}),
        },
      }
    );
    if (!outcome.ok) {
      setBusy(false);
    }
  };
  const retryCatalog = async () => {
    if (busy || retrying || catalog?.status === "ready") {
      return;
    }
    retrying = true;
    popupOwner?.busyChanged();
    try {
      catalog = await operations.retryPdmsCatalog();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      retrying = false;
      popupOwner?.busyChanged();
    }
  };
  popupOwner = createPdmsPopupOwner({
    bindings,
    choose,
    getBusy: () => busy || retrying || isEditorBusy(),
    getCatalog: () => catalog,
    options,
    preview,
    readSelection,
    retry: retryCatalog,
    setStatus,
  });
  return {
    destroy() {
      popupOwner?.destroy();
    },
    setBusy,
    updateCatalog(value) {
      catalog = value;
      popupOwner?.changed();
    },
  };
};
