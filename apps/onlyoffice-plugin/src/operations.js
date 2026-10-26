// oxlint-disable func-style sort-keys no-implicit-globals no-unused-vars consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function no-useless-return logical-assignment-operators no-useless-spread no-await-in-loop prefer-await-to-then prefer-dom-node-remove prefer-dom-node-append no-plusplus prefer-spread -- Plugin runs inside the constrained ONLYOFFICE host runtime.
import {
  ACTIONS,
  API_ROUTES,
  MAX_OPERATION_POLLS,
  OPERATION_POLL_INTERVAL_MS,
} from "./constants.js";
import {
  requireOption,
  isRecord,
  firstString,
  actionLabel,
  wait,
  errorMessage,
} from "./values.js";

export function createOperations(
  options,
  office,
  prefill,
  bridge,
  api,
  callbacks
) {
  const { setStatus, isInitializationPending } = callbacks;
  let actionInFlight = false;

  function actionRequest(action, data, reason, rowChange, requestContext) {
    const documentKey = requireOption(options.documentKey, "documentKey");

    if (action === ACTIONS.SAVE_TEMPLATE || action === ACTIONS.PUBLISH) {
      const path = api.adminFormPath(
        action === ACTIONS.SAVE_TEMPLATE ? "save" : "publish"
      );

      return {
        body: {
          documentKey,
          ...(action === ACTIONS.SAVE_TEMPLATE &&
          options.documentKind === "xlsx" &&
          requestContext?.preserveEditorSession === true
            ? {
                preserveEditorSession: true,
                preserveEditorSessionPurpose:
                  requestContext.preserveEditorSessionPurpose || "placement",
                ...((requestContext.preserveEditorSessionPurpose ||
                  "placement") === "placement"
                  ? { uploadPocBindingId: requestContext.uploadPocBindingId }
                  : {
                      spreadsheetSaveCheckpoint: data.spreadsheetSaveCheckpoint,
                      spreadsheetUploadPocSnapshot:
                        data.spreadsheetUploadPocSnapshot,
                    }),
                ...(requestContext.preserveEditorSessionPurpose === "delete"
                  ? {
                      deletedUploadPocBindingIds:
                        requestContext.deletedUploadPocBindingIds,
                    }
                  : {}),
              }
            : {}),
          ...(options.documentKind === "xlsx" && data?.spreadsheetAnchors
            ? { spreadsheetAnchors: data.spreadsheetAnchors }
            : {}),
        },
        path,
      };
    }

    if (action === ACTIONS.SAVE_DRAFT || action === ACTIONS.SUBMIT) {
      const publicId = encodeURIComponent(
        requireOption(options.publicId, "publicId")
      );
      const body = {
        canonicalDateFields: data.canonicalDateFields,
        data: data.data,
        documentKey,
        ...(options.documentKind === "xlsx"
          ? { fillMethod: "onlyoffice", ...(rowChange ? { rowChange } : {}) }
          : {}),
      };

      if (options.responseId) {
        body.responseId = options.responseId;
      }

      return {
        body,
        path: `${API_ROUTES.FORMS}/${publicId}/${
          action === ACTIONS.SAVE_DRAFT ? "draft" : "submit"
        }`,
      };
    }

    if (action === ACTIONS.SAVE_CORRECTION) {
      const responseId = encodeURIComponent(
        requireOption(options.responseId, "responseId")
      );
      return {
        body: {
          data: data.data,
          documentKey,
          reason: requireOption(reason, "correction reason"),
        },
        path: `${API_ROUTES.ADMIN_RESULTS}/${responseId}/correction`,
      };
    }

    throw new Error(`Unsupported form action: ${action || "none"}`);
  }

  async function postAction(
    action,
    data,
    reason,
    capability,
    rowChange,
    requestContext
  ) {
    const request = actionRequest(
      action,
      data,
      reason,
      rowChange,
      requestContext
    );
    const result = await api.requestJson(
      request.path,
      {
        body: JSON.stringify(request.body),
        method: "POST",
      },
      capability
    );

    return result;
  }

  function operationIdFromResponse(payload) {
    if (!isRecord(payload)) {
      return;
    }

    const operation = isRecord(payload.operation) ? payload.operation : {};
    const data = isRecord(payload.data) ? payload.data : {};

    return firstString(
      payload.operationId,
      operation.operationId,
      operation.id,
      data.operationId
    );
  }

  function operationCapabilityFromResponse(payload) {
    if (!isRecord(payload)) {
      return;
    }

    return firstString(payload.operationCapability);
  }

  function operationStatus(payload) {
    const operation = isRecord(payload?.operation) ? payload.operation : {};
    const status = payload?.status ?? operation.status;

    if (typeof status !== "string") {
      return "";
    }

    return status
      .trim()
      .toLowerCase()
      .replaceAll(/[\s-]+/g, "_");
  }

  function operationFailureMessage(payload, operationId) {
    const operation = isRecord(payload?.operation) ? payload.operation : {};
    const detail =
      operation.errorMessage ??
      payload?.message ??
      payload?.error ??
      operation.error;
    const validationErrors = operation.result?.validationErrors;
    const diagnostics = Array.isArray(validationErrors)
      ? validationErrors
          .filter(
            (error) => isRecord(error) && typeof error.message === "string"
          )
          .map((error) =>
            error.address ? `${error.address}: ${error.message}` : error.message
          )
          .join("; ")
      : "";

    return [detail || `การดำเนินการ ${operationId} ไม่สำเร็จ`, diagnostics]
      .filter(Boolean)
      .join(" — ");
  }

  async function pollOperation(operationId, label, operationCapability) {
    const operationLabel = label === undefined ? "operation" : label;
    const id = requireOption(operationId, "operationId");
    const capability = requireOption(
      operationCapability,
      "operationCapability"
    );
    let previousStatus = "";

    for (let attempt = 0; attempt < MAX_OPERATION_POLLS; attempt += 1) {
      const payload = await api.requestJson(
        `${API_ROUTES.OPERATIONS}/${encodeURIComponent(id)}`,
        { method: "GET" },
        capability
      );
      const status = operationStatus(payload);

      if (!status) {
        throw new Error(`การดำเนินการ ${id} ไม่มีสถานะ`);
      }

      if (
        status !== previousStatus &&
        (status === "pending" || status === "queued" || status === "processing")
      ) {
        previousStatus = status;
        setStatus(`${operationLabel} กำลังประมวลผล…`, "pending");
      }

      if (
        status === "completed" ||
        status === "complete" ||
        status === "succeeded" ||
        status === "success" ||
        status === "done"
      ) {
        return payload;
      }

      if (
        status === "failed" ||
        status === "failure" ||
        status === "error" ||
        status === "cancelled" ||
        status === "canceled"
      ) {
        throw new Error(operationFailureMessage(payload, id));
      }

      if (attempt < MAX_OPERATION_POLLS - 1) {
        await wait(OPERATION_POLL_INTERVAL_MS);
      }
    }

    throw new Error(`การดำเนินการ ${id} ใช้เวลานานเกินไป`);
  }

  async function runAction(
    action,
    reason = "",
    rowChange = null,
    requestContext = null
  ) {
    const saveContext =
      requestContext ||
      (action === ACTIONS.SAVE_TEMPLATE &&
      options.documentKind === "xlsx" &&
      options.action === ACTIONS.TEMPLATE_EDIT
        ? {
            preserveEditorSession: true,
            preserveEditorSessionPurpose: "manual",
            ...callbacks.getTemplateSaveContext?.(),
          }
        : null);
    if (actionInFlight || isInitializationPending()) {
      setStatus("มีการดำเนินการของฟอร์มกำลังทำงานอยู่", "pending");
      if (options.documentKind === "xlsx" && !actionInFlight) {
        bridge.notifyParent(
          action,
          "failed",
          undefined,
          undefined,
          "มีการดำเนินการของฟอร์มกำลังทำงานอยู่ กรุณารอแล้วลองใหม่"
        );
      }
      return { ignored: true, ok: false };
    }

    actionInFlight = true;
    if (options.documentKind === "xlsx") {
      callbacks.setActionBusy?.(true);
    }
    let operationId;
    let completedPayload;
    let editorFrozen = false;
    const correctionReason = typeof reason === "string" ? reason.trim() : "";

    try {
      if (
        saveContext?.preserveEditorSession === true &&
        (action !== ACTIONS.SAVE_TEMPLATE ||
          options.documentKind !== "xlsx" ||
          rowChange)
      ) {
        throw new Error(
          "การบันทึกโดยไม่เปิดตัวแก้ไขใหม่ใช้ได้เฉพาะการวางปุ่มแนบไฟล์ในต้นแบบ Excel"
        );
      }
      if (
        saveContext?.preserveEditorSession === true &&
        (saveContext.preserveEditorSessionPurpose || "placement") ===
          "placement" &&
        (typeof saveContext.uploadPocBindingId !== "string" ||
          !/^folio_[A-Za-z0-9_]+$/u.test(saveContext.uploadPocBindingId))
      ) {
        throw new Error(
          "ยังยืนยันรหัสปุ่มแนบไฟล์ที่จะบันทึกไม่ได้ กรุณาเลือกเซลล์เดิมแล้วลองวางปุ่มอีกครั้ง"
        );
      }
      if (
        saveContext?.preserveEditorSession === true &&
        !["placement", "manual", "delete"].includes(
          saveContext.preserveEditorSessionPurpose || "placement"
        )
      ) {
        throw new Error("ประเภทการบันทึกต้นแบบในตัวแก้ไขเดิมไม่ถูกต้อง");
      }
      await callbacks.beforeAction?.(action, rowChange);
      const needsData =
        action === ACTIONS.SAVE_DRAFT ||
        action === ACTIONS.SAVE_CORRECTION ||
        action === ACTIONS.SUBMIT;
      let data;

      if (needsData) {
        if (options.documentKind === "xlsx") {
          data = { data: {} };
        } else {
          if (prefill.shouldApplyRuntimePrefill()) {
            await prefill.ensurePrefill();
          } else if (
            options.action === ACTIONS.DRAFT ||
            options.action === ACTIONS.CORRECTION
          ) {
            await office.restrictEditorToForms();
          }
          await office.freezeEditor();
          editorFrozen = true;
          setStatus(`กำลังอ่านข้อมูลของ ${actionLabel(action)}…`, "pending");
          data = await office.extractFormDataPromise();
        }
        if (options.documentKind === "xlsx") {
          await office.freezeEditor();
          editorFrozen = true;
        }
      }
      if (!needsData) {
        await office.freezeEditor();
        editorFrozen = true;
        if (options.documentKind === "xlsx") {
          data = await callbacks.getTemplateSnapshot?.(saveContext);
        }
      }
      await bridge.flushEditorChanges();

      setStatus(`${actionLabel(action)} กำลังรอดำเนินการ…`, "pending");
      const capability = await bridge.requestActionCapability(action);
      const response = await postAction(
        action,
        data,
        correctionReason,
        capability,
        rowChange,
        saveContext
      );
      operationId = operationIdFromResponse(response);
      bridge.notifyParent(action, "pending", operationId, response);

      if (operationId) {
        completedPayload = await pollOperation(
          operationId,
          actionLabel(action),
          operationCapabilityFromResponse(response)
        );
      }

      const completion = completedPayload || response;
      const result = completion?.operation?.result ?? completion?.result;
      const preservedResult = completedPayload?.operation?.result;
      if (
        saveContext?.preserveEditorSession === true &&
        (preservedResult?.editorSessionPreserved !== true ||
          preservedResult.documentKey !== options.documentKey)
      ) {
        throw new Error(
          "ยังยืนยันการบันทึกต้นแบบในตัวแก้ไขเดิมไม่ได้ กรุณาลองบันทึกซ้ำ หรือกดบันทึกแบบร่างเพื่อลองบันทึกต้นแบบอีกครั้ง"
        );
      }
      setStatus(`${actionLabel(action)} สำเร็จ`, "success");
      bridge.notifyParent(action, "completed", operationId, completion);

      if (needsData || saveContext?.preserveEditorSession === true) {
        bridge.setDirtyState(false);
      }
      await callbacks.onTemplateSaveCompleted?.(action, saveContext, result);

      return {
        ok: true,
        operationId: operationId || null,
        response,
        completion,
        result,
      };
    } catch (error) {
      const message = errorMessage(error);
      setStatus(`${actionLabel(action)} ไม่สำเร็จ: ${message}`, "error");
      bridge.notifyParent(
        action,
        "failed",
        operationId,
        completedPayload,
        message
      );

      return {
        error: message,
        ok: false,
        operationId: operationId || null,
      };
    } finally {
      if (editorFrozen) {
        try {
          await office.executeMethodResult("SetEditingRestrictions", [
            options.documentKind === "xlsx" ||
            options.action === ACTIONS.TEMPLATE_EDIT
              ? "none"
              : "forms",
          ]);
        } catch {
          setStatus("ไม่สามารถคืนค่าการแก้ไขเฉพาะช่องกรอกได้", "error");
        }
      }
      actionInFlight = false;
      if (options.documentKind === "xlsx") {
        callbacks.setActionBusy?.(false);
      }
    }
  }

  function submitForm() {
    return runAction(ACTIONS.SUBMIT);
  }

  return { pollOperation, runAction, submitForm };
}
