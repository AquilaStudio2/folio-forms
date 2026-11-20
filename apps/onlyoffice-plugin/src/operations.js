// oxlint-disable func-style sort-keys no-implicit-globals no-unused-vars consistent-function-scoping complexity prefer-named-capture-group require-unicode-regexp avoid-new prefer-await-to-callbacks no-empty-function no-useless-return logical-assignment-operators no-useless-spread no-await-in-loop prefer-await-to-then prefer-dom-node-remove prefer-dom-node-append no-plusplus prefer-spread -- Plugin runs inside the constrained ONLYOFFICE host runtime.
import {
  ACTIONS,
  API_ROUTES,
  MAX_OPERATION_POLLS,
  OPERATION_POLL_INTERVAL_MS,
} from "./constants.js";
import { saveUploadPocSnapshot } from "./upload-poc-save.js";
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
  const hasAttachments =
    options.documentKind === "xlsx" &&
    (options.spreadsheetBindings?.fields?.some((field) => field.attachment) ||
      options.spreadsheetBindings?.table?.columns?.some(
        (field) => field.attachment
      ));
  let attachmentCommitUnresolved = false;
  let attachmentOperationId = "";
  const draftCheckpointKey =
    options.xlsxDraftProtocol === 1 && options.scopeIdentity
      ? `folio-xlsx-draft:${options.scopeIdentity}`
      : "";

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
            ? {
                spreadsheetAnchors: data.spreadsheetAnchors,
                xlsxDraft: data.xlsxDraft,
              }
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
          ? {
              fillMethod: "onlyoffice",
              ...(rowChange ? { rowChange } : {}),
              ...(options.pdmsProjectCatalog?.sessionId
                ? { pdmsCatalogSessionId: options.pdmsProjectCatalog.sessionId }
                : {}),
              ...(requestContext?.pdmsSelection
                ? { pdmsSelection: requestContext.pdmsSelection }
                : {}),
            }
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

    if (
      action === ACTIONS.SAVE_CORRECTION ||
      action === ACTIONS.SAVE_CORRECTION_WORKSPACE
    ) {
      const responseId = encodeURIComponent(
        requireOption(options.responseId, "responseId")
      );
      const submissionIdQuery = options.submissionId
        ? `?submissionId=${encodeURIComponent(options.submissionId)}`
        : "";
      return {
        body: {
          data: data.data,
          documentKey,
          ...(action === ACTIONS.SAVE_CORRECTION
            ? { reason: requireOption(reason, "correction reason") }
            : {}),
          ...(options.documentKind === "xlsx"
            ? {
                ...(options.pdmsProjectCatalog?.sessionId
                  ? {
                      pdmsCatalogSessionId:
                        options.pdmsProjectCatalog.sessionId,
                    }
                  : {}),
                ...(requestContext?.pdmsSelection
                  ? { pdmsSelection: requestContext.pdmsSelection }
                  : {}),
              }
            : {}),
        },
        path: `${API_ROUTES.ADMIN_RESULTS}/${responseId}/correction${action === ACTIONS.SAVE_CORRECTION_WORKSPACE ? "/workspace" : ""}${submissionIdQuery}`,
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
    if (
      hasAttachments &&
      !rowChange &&
      !requestContext?.pdmsSelection &&
      [ACTIONS.SAVE_DRAFT, ACTIONS.SUBMIT, ACTIONS.SAVE_CORRECTION].includes(
        action
      )
    ) {
      const snapshotUrl = await office.captureWorkbook();
      attachmentCommitUnresolved = true;
      attachmentOperationId = "";
      try {
        const result = await saveUploadPocSnapshot(window, options, {
          action,
          body: request.body,
          capability,
          snapshotUrl,
        });
        if (result.status === "failed") {
          attachmentCommitUnresolved = false;
        }
        return result;
      } catch (error) {
        if (error.attachmentCommitUnresolved === false) {
          attachmentCommitUnresolved = false;
        }
        throw error;
      }
    }
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

  async function pollOperation(
    operationId,
    label,
    operationCapability,
    readStatus
  ) {
    const operationLabel = label === undefined ? "operation" : label;
    const id = requireOption(operationId, "operationId");
    const capability = readStatus
      ? null
      : requireOption(operationCapability, "operationCapability");
    let previousStatus = "";

    for (let attempt = 0; attempt < MAX_OPERATION_POLLS; attempt += 1) {
      const payload = readStatus
        ? await readStatus()
        : await api.requestJson(
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
        if (id === attachmentOperationId) {
          attachmentCommitUnresolved = false;
        }
        return payload;
      }

      if (
        status === "failed" ||
        status === "failure" ||
        status === "error" ||
        status === "cancelled" ||
        status === "canceled"
      ) {
        if (id === attachmentOperationId) {
          attachmentCommitUnresolved = false;
        }
        const error = new Error(operationFailureMessage(payload, id));
        error.operationTerminal = true;
        throw error;
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
    bridge.retainCompletedEditor();
    if (options.documentKind === "xlsx") {
      callbacks.setActionBusy?.(true);
    }
    let operationId;
    let completedPayload;
    let editorFrozen = false;
    let waitForReload = false;
    let resultAction = action;
    let recoveredCheckpoint = false;
    const tracksDraft =
      Boolean(draftCheckpointKey) &&
      [ACTIONS.SAVE_TEMPLATE, ACTIONS.PUBLISH].includes(action);
    let draftUnresolved = false;
    let expectedDraftRevision;
    let preservedDraftKey;
    const correctionReason = typeof reason === "string" ? reason.trim() : "";
    const attachmentSave =
      hasAttachments &&
      !rowChange &&
      !saveContext?.pdmsSelection &&
      [ACTIONS.SAVE_DRAFT, ACTIONS.SUBMIT, ACTIONS.SAVE_CORRECTION].includes(
        action
      );

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
      if (
        options.documentKind === "xlsx" &&
        [
          ACTIONS.SAVE_DRAFT,
          ACTIONS.SUBMIT,
          ACTIONS.SAVE_CORRECTION,
          ACTIONS.SAVE_CORRECTION_WORKSPACE,
        ].includes(action)
      ) {
        await office.freezeEditor();
        editorFrozen = true;
        bridge.notifyParent(action, "pending");
      }
      let readDraftStatus;
      const storedDraft = tracksDraft
        ? window.sessionStorage.getItem(draftCheckpointKey)
        : null;
      draftUnresolved = Boolean(storedDraft);
      const pendingGuard = storedDraft
        ? null
        : await callbacks.beforeAction?.(action, rowChange, saveContext);
      const needsData =
        action === ACTIONS.SAVE_DRAFT ||
        action === ACTIONS.SAVE_CORRECTION ||
        action === ACTIONS.SAVE_CORRECTION_WORKSPACE ||
        action === ACTIONS.SUBMIT;
      const recovery =
        attachmentSave && isRecord(pendingGuard?.checkpointOperation)
          ? pendingGuard.checkpointOperation
          : null;
      if (
        !recovery &&
        typeof pendingGuard?.mutationNotice === "string" &&
        pendingGuard.mutationNotice
      ) {
        attachmentCommitUnresolved ||= attachmentSave;
        throw new Error(pendingGuard.mutationNotice);
      }
      let response;
      if (recovery) {
        // Read the original result before minting any capability against a possibly superseded native key.
        attachmentCommitUnresolved = true;
        if (
          ![
            ACTIONS.SAVE_DRAFT,
            ACTIONS.SUBMIT,
            ACTIONS.SAVE_CORRECTION,
          ].includes(recovery.action)
        ) {
          throw new Error(
            "ยังยืนยันประเภทของการบันทึกรอบเดิมไม่ได้ กรุณาตรวจผลเดิมอีกครั้ง"
          );
        }
        resultAction = recovery.action;
        recoveredCheckpoint = true;
        await office.freezeEditor();
        editorFrozen = true;
        setStatus("กำลังตรวจผลการบันทึกรอบเดิม…", "pending");
        response = recovery;
      } else if (storedDraft) {
        await office.freezeEditor();
        editorFrozen = true;
        const original = JSON.parse(storedDraft);
        expectedDraftRevision = original.revision;
        preservedDraftKey = original.preservedDocumentKey;
        const capability = await bridge.requestActionCapability(action);
        readDraftStatus = () =>
          api.requestJson(
            api.adminFormPath("xlsx-draft/recover"),
            {
              method: "POST",
              body: JSON.stringify({
                checkpoint: original.checkpoint,
                leaseId: original.leaseId,
              }),
            },
            capability
          );
        response = await readDraftStatus();
        if (response.status === "not-admitted") {
          window.sessionStorage.removeItem(draftCheckpointKey);
          waitForReload = true;
          throw new Error("คำขอเดิมยังไม่เริ่ม กรุณาเปิดต้นแบบใหม่ก่อนแก้ไขต่อ");
        }
        if (response.action !== original.action) {
          throw new Error("ผลบันทึกไม่ตรงกับคำขอเดิม");
        }
        resultAction = response.action;
        recoveredCheckpoint = true;
      } else {
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
          if (options.documentKind === "xlsx" && !editorFrozen) {
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
        if (
          attachmentSave &&
          pendingGuard?.attachmentCommitUnresolved === true
        ) {
          attachmentCommitUnresolved = true;
        }
        const capability = await bridge.requestActionCapability(
          action,
          tracksDraft && action === ACTIONS.PUBLISH
            ? data.xlsxDraft.checkpoint
            : undefined
        );
        if (
          saveContext?.pdmsSelection &&
          saveContext.pdmsSelection.sessionId !==
            options.pdmsProjectCatalog?.sessionId
        ) {
          throw new Error(
            "สิทธิ์ตัวแก้ไขเปลี่ยนแล้ว กรุณาเลือกชื่อโครงการจากรายการปัจจุบันอีกครั้ง"
          );
        }
        if (tracksDraft) {
          expectedDraftRevision = data.xlsxDraft.revision;
          preservedDraftKey =
            saveContext?.preserveEditorSession === true
              ? options.documentKey
              : undefined;
          window.sessionStorage.setItem(
            draftCheckpointKey,
            JSON.stringify({
              action,
              checkpoint: data.xlsxDraft.checkpoint,
              revision: expectedDraftRevision,
              preservedDocumentKey: preservedDraftKey,
              leaseId: requireOption(
                options.xlsxDraftLeaseId,
                "Excel authoring lease"
              ),
            })
          );
          draftUnresolved = true;
        }
        try {
          response = await postAction(
            action,
            data,
            correctionReason,
            capability,
            rowChange,
            saveContext
          );
        } catch (error) {
          if (tracksDraft && error.preAdmission === true) {
            window.sessionStorage.removeItem(draftCheckpointKey);
            draftUnresolved = false;
          }
          throw error;
        }
      }
      if (
        attachmentSave &&
        [ACTIONS.SAVE_DRAFT, ACTIONS.SUBMIT, ACTIONS.SAVE_CORRECTION].includes(
          response?.action
        )
      ) {
        resultAction = response.action;
        recoveredCheckpoint ||= resultAction !== action;
      }
      operationId = operationIdFromResponse(response);
      if (attachmentSave) {
        attachmentOperationId = operationId || "";
      }
      bridge.notifyParent(
        resultAction,
        "pending",
        operationId,
        response,
        undefined,
        recoveredCheckpoint ? action : undefined
      );

      if (operationId) {
        const pollCapability = operationCapabilityFromResponse(response);
        completedPayload = await pollOperation(
          operationId,
          actionLabel(resultAction),
          pollCapability,
          readDraftStatus && !pollCapability
            ? async () => {
                const status =
                  response.status === "completed" ||
                  response.status === "failed"
                    ? response
                    : await readDraftStatus();
                if (
                  status.operationId !== operationId ||
                  status.action !== resultAction
                ) {
                  throw new Error("ผลบันทึกไม่ตรงกับคำขอเดิม");
                }
                return { operation: status };
              }
            : undefined
        );
      }

      const completion = completedPayload || response;
      const result = completion?.operation?.result ?? completion?.result;
      if (tracksDraft) {
        const savedTemplate = resultAction === ACTIONS.SAVE_TEMPLATE;
        if (
          !operationId ||
          !isRecord(result) ||
          typeof result.documentKey !== "string" ||
          !result.documentKey ||
          (savedTemplate &&
            (!Number.isSafeInteger(result.bindingRevision) ||
              (Number.isSafeInteger(expectedDraftRevision) &&
                result.bindingRevision !== expectedDraftRevision + 1) ||
              result.bindingRevision < 1 ||
              !isRecord(result.bindings) ||
              result.bindings.version !== 1 ||
              !Array.isArray(result.bindings.fields))) ||
          (savedTemplate &&
            preservedDraftKey &&
            (result.editorSessionPreserved !== true ||
              result.documentKey !== preservedDraftKey)) ||
          (!savedTemplate &&
            (result.publicId !== options.publicId ||
              !Number.isSafeInteger(result.version) ||
              result.version < 1))
        ) {
          throw new Error(
            preservedDraftKey
              ? "ยังยืนยันการบันทึกต้นแบบในตัวแก้ไขเดิมไม่ได้"
              : "ยังยืนยันผลบันทึกต้นแบบ Excel ไม่ได้"
          );
        }
        window.sessionStorage.removeItem(draftCheckpointKey);
        draftUnresolved = false;
      }
      waitForReload =
        (tracksDraft && recoveredCheckpoint) ||
        resultAction === ACTIONS.SAVE_CORRECTION ||
        (options.documentKind === "xlsx" &&
          (Boolean(options.pdmsProjectCatalog) || attachmentSave) &&
          (resultAction === ACTIONS.SUBMIT ||
            (typeof result?.documentKey === "string" &&
              result.documentKey !== options.documentKey)));
      // Completion can remount the editor or leave the page, so restore editing first.
      if (editorFrozen && !waitForReload) {
        await office.executeMethodResult("SetEditingRestrictions", [
          options.documentKind === "xlsx" ||
          options.action === ACTIONS.TEMPLATE_EDIT
            ? "none"
            : "forms",
        ]);
        editorFrozen = false;
      }
      setStatus(
        recoveredCheckpoint
          ? `ตรวจผล${actionLabel(resultAction)}รอบก่อนสำเร็จ`
          : `${actionLabel(resultAction)} สำเร็จ`,
        "success"
      );
      if (waitForReload && resultAction === ACTIONS.SAVE_DRAFT && operationId) {
        bridge.retainCompletedEditor(
          operationId,
          result?.documentKey,
          async (message) => {
            if (
              message.documentKey !== result?.documentKey ||
              typeof message.documentKey !== "string" ||
              attachmentCommitUnresolved ||
              !actionInFlight
            ) {
              return false;
            }
            try {
              if (
                !isRecord(message.savedData) ||
                typeof callbacks.onDraftContinuation !== "function"
              ) {
                throw new Error("ยืนยันค่าช่องแนบฉบับที่บันทึกแล้วไม่ได้");
              }
              await callbacks.onDraftContinuation(message.savedData);
              options.documentKey = message.documentKey;
              if (isRecord(message.pdmsProjectCatalog)) {
                options.pdmsProjectCatalog = message.pdmsProjectCatalog;
              }
              if (isRecord(message.spreadsheetBindings)) {
                options.spreadsheetBindings = message.spreadsheetBindings;
              }
              await office.executeMethodResult("SetEditingRestrictions", [
                "none",
              ]);
              editorFrozen = false;
              waitForReload = false;
              actionInFlight = false;
              callbacks.setActionBusy?.(false);
              return true;
            } catch {
              setStatus("ไม่สามารถคืนค่าการแก้ไขได้ กรุณารักษาหน้านี้ไว้", "error");
              return false;
            }
          }
        );
      }
      bridge.notifyParent(
        resultAction,
        "completed",
        operationId,
        tracksDraft && recoveredCheckpoint && completion?.operation
          ? {
              ...completion,
              operation: {
                ...completion.operation,
                result: { ...result, editorSessionPreserved: false },
              },
            }
          : completion,
        undefined,
        recoveredCheckpoint ? action : undefined
      );

      if (
        (!tracksDraft || !recoveredCheckpoint) &&
        (needsData || saveContext?.preserveEditorSession === true)
      ) {
        bridge.setDirtyState(false);
      }
      if (!tracksDraft || !recoveredCheckpoint) {
        await callbacks.onTemplateSaveCompleted?.(
          resultAction,
          saveContext,
          result
        );
      }

      return {
        ok: true,
        operationId: operationId || null,
        response,
        completion,
        result,
      };
    } catch (error) {
      if (tracksDraft && error.operationTerminal === true) {
        window.sessionStorage.removeItem(draftCheckpointKey);
        draftUnresolved = false;
      }
      let message = errorMessage(error);
      if (attachmentCommitUnresolved || draftUnresolved) {
        message +=
          " ตัวแก้ไขยังอ่านอย่างเดียว ยังยืนยันผลรอบเดิมไม่ได้ ห้ามส่งซ้ำ ใช้การตรวจผลรอบเดิมก่อนแก้ไขต่อ";
      }
      setStatus(`${actionLabel(resultAction)} ไม่สำเร็จ: ${message}`, "error");
      bridge.notifyParent(
        resultAction,
        "failed",
        operationId,
        completedPayload,
        message,
        recoveredCheckpoint ? action : undefined,
        attachmentCommitUnresolved || draftUnresolved
      );

      return {
        error: message,
        ok: false,
        operationId: operationId || null,
      };
    } finally {
      if (
        editorFrozen &&
        !waitForReload &&
        !attachmentCommitUnresolved &&
        !draftUnresolved
      ) {
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
      actionInFlight = waitForReload;
      if (options.documentKind === "xlsx" && !waitForReload) {
        callbacks.setActionBusy?.(false);
      }
    }
  }

  async function retryPdmsCatalog() {
    const current = options.pdmsProjectCatalog;
    if (!current || actionInFlight) {
      throw new Error("กรุณารอการบันทึกก่อนลองโหลดรายการอีกครั้ง");
    }
    if (current.status === "ready") {
      return current;
    }
    let action = ACTIONS.SAVE_DRAFT;
    if (options.action === ACTIONS.TEMPLATE_EDIT) {
      action = ACTIONS.CONFIGURE_FIELDS;
    } else if (options.action === ACTIONS.CORRECTION) {
      action = ACTIONS.SAVE_CORRECTION;
    } else if (options.action === ACTIONS.SUBMIT) {
      action = ACTIONS.SUBMIT;
    }
    const capability = await bridge.requestActionCapability(action);
    const active = options.pdmsProjectCatalog;
    if (active?.status === "ready") {
      return active;
    }
    const payload = await api.requestJson(
      "/api/editor/pdms-project-catalog/retry",
      {
        method: "POST",
        body: JSON.stringify({
          documentKey: requireOption(options.documentKey, "documentKey"),
          sessionId: active.sessionId,
        }),
      },
      capability
    );
    const loaded = payload?.pdmsProjectCatalog;
    if (
      !isRecord(loaded) ||
      loaded.sessionId !== active.sessionId ||
      !["ready", "error", "loading"].includes(loaded.status) ||
      !Array.isArray(loaded.names) ||
      loaded.names.some((name) => typeof name !== "string")
    ) {
      throw new Error("โหลดรายการโครงการไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
    options.pdmsProjectCatalog = loaded;
    return loaded;
  }

  function submitForm() {
    return runAction(ACTIONS.SUBMIT);
  }

  return { pollOperation, retryPdmsCatalog, runAction, submitForm };
}
