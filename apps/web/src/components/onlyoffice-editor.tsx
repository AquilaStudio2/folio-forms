import type { ReactElement, Ref } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui";
import { recoveredAttachmentLease } from "@/features/onlyoffice/attachment-admission-recovery";
import { createAttachmentCategoryPopupRelay } from "@/features/onlyoffice/attachment-category-popup-relay";
import {
  acknowledgeBridge,
  editorConfigPath,
  isBridgeReadyMessage,
  isNonEmptyString,
  isRecord,
  leaseRenewalIntervalMs,
  parseCapabilityRequest,
  parseDirtyStateMessage,
  parseFieldSelectionMessage,
  parseOperationMessage,
  recordOrEmpty,
} from "@/features/onlyoffice/editor-protocol";
import type {
  CapabilityRequestMessage,
  CaptureWorkbook,
  EditorBridgeMessage,
  EditorConfig,
  EditorLease,
  OnlyOfficeEditorState,
} from "@/features/onlyoffice/editor-protocol";
import { EditorSurface } from "@/features/onlyoffice/editor-surface";
import { isEditorWindowSource } from "@/features/onlyoffice/editor-window-source";
import { createPdmsPopupRelay } from "@/features/onlyoffice/pdms-popup-relay";
import type { UploadPocHostOptions } from "@/features/onlyoffice/upload-poc-pending";
import { UploadPocPendingFiles } from "@/features/onlyoffice/upload-poc-pending";
import { ApiError, apiDelete, apiGet, apiPost, getToken } from "@/lib/api";
import { createDeferred } from "@/lib/form-lifecycle";

interface DocsApi {
  DocEditor: new (
    elementId: string,
    config: Record<string, unknown>
  ) => { destroyEditor?: () => void };
}

declare global {
  interface Window {
    DocsAPI?: DocsApi;
  }
}

const changedEditorDocument = (
  current: EditorConfig,
  fresh: EditorConfig
): boolean => {
  const canonicalKey = current.bridge?.documentKey;
  const nativeKey = recordOrEmpty(current.config?.document).key;
  return (
    !isNonEmptyString(canonicalKey) ||
    !isNonEmptyString(nativeKey) ||
    fresh.bridge?.documentKey !== canonicalKey ||
    recordOrEmpty(fresh.config?.document).key !== nativeKey
  );
};

const editorCommandDeadlineMs = 30_000;

const mutationStateMessages = {
  blocked:
    "รอบก่อนบันทึกแล้ว แต่งานที่เลือกภายหลังยังไม่บันทึก ตัวแก้ไขยังอ่านอย่างเดียวเพื่อรักษางานใหม่",
  idle: null,
  saving: "กำลังบันทึก กรุณารอผลก่อนแก้ไขหรือออกจากหน้านี้",
  unresolved:
    "ยังยืนยันผลรอบเดิมไม่ได้ ห้ามส่งซ้ำ ตัวแก้ไขยังอ่านอย่างเดียว ตรวจผลรอบเดิมหรือเปิดสำเนาที่บันทึกไว้ได้",
};

// oxlint-disable-next-line complexity -- Coordinate native editor refs, lease scope and persistent notices without splitting their lifecycle ownership.
export const OnlyOfficeEditor = ({
  captureWorkbookRef,
  clearDirtyRequest = 0,
  configUrl,
  onBridgeMessage,
  onDirtyChange,
  onCommandReadyChange,
  onStateChange,
  openingRevision = 0,
  readOnly = false,
  revision = 0,
  saveAction = "save-draft",
  saveReason = "",
  saveRequest = 0,
  trackNativeDirty = false,
  title,
}: {
  captureWorkbookRef?: Ref<CaptureWorkbook>;
  clearDirtyRequest?: number;
  configUrl?: string;
  onBridgeMessage?: (message: EditorBridgeMessage) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onCommandReadyChange?: (ready: boolean) => void;
  onStateChange?: (state: OnlyOfficeEditorState) => void;
  openingRevision?: number;
  readOnly?: boolean;
  revision?: number;
  saveAction?:
    | "save-draft"
    | "save-correction"
    | "submit"
    | "save-template"
    | "publish";
  saveReason?: string;
  saveRequest?: number;
  trackNativeDirty?: boolean;
  title: string;
}): ReactElement => {
  const [retryToken, setRetryToken] = useState(0);
  const editorOpeningRef = useRef<{
    url: string | undefined;
    id: string;
    revision: number;
    openingRevision: number;
    retryToken: number;
    readOnly: boolean;
  } | null>(null);
  if (
    !editorOpeningRef.current ||
    editorOpeningRef.current.url !== configUrl ||
    editorOpeningRef.current.revision !== revision ||
    editorOpeningRef.current.openingRevision !== openingRevision ||
    editorOpeningRef.current.retryToken !== retryToken ||
    editorOpeningRef.current.readOnly !== readOnly
  ) {
    editorOpeningRef.current = {
      id: crypto.randomUUID(),
      openingRevision,
      readOnly,
      retryToken,
      revision,
      url: configUrl,
    };
  }
  const pdmsOpeningId = editorOpeningRef.current.id;
  const uploadPocFilesRef = useRef<UploadPocPendingFiles | null>(null);
  if (!uploadPocFilesRef.current) {
    uploadPocFilesRef.current = new UploadPocPendingFiles();
  }
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const onBridgeMessageRef = useRef(onBridgeMessage);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onCommandReadyChangeRef = useRef(onCommandReadyChange);
  const pendingCommandRef = useRef<{
    action: typeof saveAction;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const pinnedSourceRef = useRef<MessageEventSource | null>(null);
  const pendingCaptureRef = useRef<{
    requestId: string;
    resolve: (snapshotUrl: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const lastClearDirtyRequestRef = useRef(0);
  const documentDirtyRef = useRef(false);
  const documentEditVersionRef = useRef(0);
  const capturedEditVersionRef = useRef<number | null>(null);
  const pendingEditVersionRef = useRef(0);
  const capturedPendingVersionRef = useRef<number | null>(null);
  const retiredCorrectionRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const liveConfigPathRef = useRef<(() => string) | null>(null);
  const [mutationState, setMutationState] = useState<
    "idle" | "saving" | "unresolved" | "blocked"
  >("idle");
  const mutationFeedbackRef = useRef<HTMLParagraphElement>(null);
  const candidateSourcesRef = useRef(new Set<MessageEventSource>());
  const lastSaveRequestRef = useRef(0);
  const terminalOperationIdsRef = useRef(new Set<string>());
  const mountGenerationRef = useRef(0);
  const editorId = useId().replaceAll(":", "");
  const surfaceId = `${editorId}-surface`;
  const keyboardHelpId = `${editorId}-keyboard-help`;
  const leaseRef = useRef<EditorLease | null>(null);
  const exportScopeRef = useRef<{
    capability: string;
    config: EditorConfig;
    sessionToken: string | null;
  } | null>(null);
  const loadedConfigUrlRef = useRef<string | null>(null);
  const [config, setConfig] = useState<EditorConfig | null>(null);
  const [checkpointPending, setCheckpointPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<
    string | null | undefined
  >();
  const [routingPending, setRoutingPending] = useState<boolean>();
  const [cleanupWarning, setCleanupWarning] = useState<
    string | null | undefined
  >();
  const [showSavedCopy, setShowSavedCopy] = useState(false);
  const [editorState, setEditorState] =
    useState<OnlyOfficeEditorState>("loading");
  const [expanded, setExpanded] = useState(false);
  const [bridgeReadyVersion, setBridgeReadyVersion] = useState(0);

  useImperativeHandle(captureWorkbookRef, () => {
    const bridge = config?.bridge;
    const documentKey = bridge?.documentKey;
    return async () => {
      if (
        uploadPocFilesRef.current?.hasPending() ||
        candidateSourcesRef.current.size > 0
      ) {
        throw new Error("มีไฟล์แนบที่ยังไม่บันทึก กรุณากดบันทึกฉบับร่างหรือส่งก่อนดาวน์โหลด");
      }
      if (uploadPocFilesRef.current?.hasUnresolvedCommit()) {
        throw new Error(
          "ยังยืนยันผลบันทึกไฟล์แนบรอบเดิมไม่ได้ กรุณาตรวจผลเดิมก่อนดาวน์โหลด"
        );
      }
      const source = pinnedSourceRef.current;
      const scope = exportScopeRef.current;
      if (
        scope?.config !== config ||
        !scope ||
        !configUrl ||
        loadedConfigUrlRef.current !== configUrl ||
        !isNonEmptyString(documentKey) ||
        !bridge?.id ||
        !bridge.pluginOrigin ||
        !leaseRef.current ||
        scope.sessionToken !== getToken() ||
        !isEditorWindowSource(source, surfaceRef.current) ||
        pendingCaptureRef.current
      ) {
        throw new Error("The workbook editor is unavailable");
      }

      const { id, pluginOrigin } = bridge;
      const requestId = crypto.randomUUID();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let snapshotUrl: string;
      try {
        // oxlint-disable-next-line promise/avoid-new -- Resolve the one correlated plugin reply or time out.
        snapshotUrl = await new Promise<string>((resolve, reject) => {
          pendingCaptureRef.current = { reject, requestId, resolve };
          timeout = setTimeout(
            () => reject(new Error("Workbook capture timed out")),
            20_000
          );
          source.postMessage(
            {
              bridgeId: id,
              requestId,
              source: "folio-parent",
              type: "capture-workbook",
            },
            pluginOrigin
          );
        });
      } finally {
        clearTimeout(timeout);
        pendingCaptureRef.current = null;
      }

      const isCurrentScope = () =>
        exportScopeRef.current === scope &&
        loadedConfigUrlRef.current === configUrl &&
        editorOpeningRef.current?.id === pdmsOpeningId &&
        scope.sessionToken === getToken() &&
        pinnedSourceRef.current === source &&
        isEditorWindowSource(source, surfaceRef.current);
      if (!isCurrentScope()) {
        throw new Error("The workbook editor session has changed");
      }
      const refreshCapability = async (signal: AbortSignal) => {
        const requestedLeaseId = leaseRef.current?.id;
        if (!requestedLeaseId || !isCurrentScope()) {
          throw new Error("The workbook editor session has changed");
        }
        const fresh = await apiGet<EditorConfig>(
          liveConfigPathRef.current?.() ??
            editorConfigPath(configUrl, pdmsOpeningId),
          { signal, timeoutMs: 10_000 }
        );
        signal.throwIfAborted();
        const freshLease = fresh.bridge?.lease;
        const activeLeaseId = leaseRef.current?.id;
        const capability = fresh.bridge?.capabilities?.["export-workbook"];
        if (
          !isCurrentScope() ||
          !freshLease ||
          !isNonEmptyString(capability) ||
          changedEditorDocument(scope.config, fresh) ||
          (activeLeaseId !== requestedLeaseId &&
            activeLeaseId !== freshLease.id)
        ) {
          throw new Error("The workbook editor session has changed");
        }
        leaseRef.current = freshLease;
        scope.capability = capability;
        return capability;
      };
      return { capability: scope.capability, refreshCapability, snapshotUrl };
    };
  }, [config, configUrl, pdmsOpeningId]);

  const reportState = useCallback((nextState: OnlyOfficeEditorState) => {
    setEditorState(nextState);
    onStateChangeRef.current?.(nextState);
  }, []);

  const restore = useCallback(() => {
    setExpanded(false);
    surfaceRef.current?.querySelector("button")?.focus();
  }, []);

  const releaseCurrentLease = useCallback(async (): Promise<void> => {
    const lease = leaseRef.current;
    leaseRef.current = null;
    if (!lease) {
      return;
    }
    try {
      await apiDelete(lease.releaseUrl, undefined, { keepalive: true });
    } catch {
      // Lease expiry remains the fallback if best-effort release is unavailable.
    }
  }, []);

  useEffect(() => {
    if (
      leaseRef.current &&
      loadedConfigUrlRef.current !== (configUrl ?? null)
    ) {
      void releaseCurrentLease();
    }
  }, [configUrl, releaseCurrentLease]);

  useEffect(
    () => () => {
      void releaseCurrentLease();
    },
    [releaseCurrentLease]
  );
  useEffect(() => {
    if (editorState === "blocked" || editorState === "error") {
      feedbackRef.current?.focus();
    }
  }, [editorState]);

  useEffect(() => {
    const lease =
      loadedConfigUrlRef.current === (configUrl ?? null)
        ? config?.bridge?.lease
        : undefined;
    if (!lease) {
      return;
    }

    let cancelled = false;
    leaseRef.current = lease;

    const renewLease = async () => {
      const currentLease = leaseRef.current;
      if (cancelled || !currentLease) {
        return;
      }

      try {
        const response = await apiPost<{
          lease: Pick<EditorLease, "expiresAt" | "id">;
        }>(currentLease.renewUrl);
        const activeLease = leaseRef.current;
        if (
          !cancelled &&
          activeLease?.id === currentLease.id &&
          response.lease.id === currentLease.id
        ) {
          leaseRef.current = {
            ...activeLease,
            expiresAt: response.lease.expiresAt,
          };
        }
      } catch {
        // A transient heartbeat failure must not tear down unsaved editor state.
      }
    };

    const renewalTimer = window.setInterval(() => {
      void renewLease();
    }, leaseRenewalIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(renewalTimer);
      // Preserve the lease reference across a same-document config refresh.
    };
  }, [config, configUrl]);

  useEffect(() => {
    onBridgeMessageRef.current = onBridgeMessage;
    onDirtyChangeRef.current = onDirtyChange;
    onCommandReadyChangeRef.current = onCommandReadyChange;
    onStateChangeRef.current = onStateChange;
  }, [onBridgeMessage, onDirtyChange, onCommandReadyChange, onStateChange]);
  useEffect(() => {
    if (mutationState !== "idle") {
      mutationFeedbackRef.current?.focus();
    }
  }, [mutationState]);
  useEffect(() => {
    if (saveRequest === 0) {
      return;
    }
    capturedEditVersionRef.current = documentEditVersionRef.current;
    capturedPendingVersionRef.current = pendingEditVersionRef.current;
    requestSequenceRef.current += 1;
    setMutationState("saving");
    const timer = setTimeout(() => {
      const dispatched = lastSaveRequestRef.current >= saveRequest;
      pendingCommandRef.current = null;
      // A late handshake must not deliver a command the page has reported failed.
      lastSaveRequestRef.current = Math.max(
        lastSaveRequestRef.current,
        saveRequest
      );
      setMutationState(dispatched ? "unresolved" : "idle");
      onBridgeMessageRef.current?.({
        action: saveAction,
        attachmentCommitUnresolved: dispatched,
        bridgeId: "editor-command",
        error: dispatched
          ? "ยังยืนยันการตอบรับคำสั่งไม่ได้ กรุณาตรวจผลรอบเดิมก่อนดำเนินการต่อ ห้ามส่งซ้ำ"
          : "ตัวแก้ไขยังไม่พร้อม คำสั่งยังไม่ถูกส่ง กรุณารอการเชื่อมต่อแล้วลองใหม่",
        source: "form-bridge",
        status: "failed",
        type: "operation",
      });
    }, editorCommandDeadlineMs);
    pendingCommandRef.current = { action: saveAction, timer };
    return () => {
      clearTimeout(timer);
      if (pendingCommandRef.current?.timer === timer) {
        pendingCommandRef.current = null;
      }
    };
  }, [saveRequest, saveAction]);
  useEffect(() => {
    const bridgeId = config?.bridge?.id;
    const pluginOrigin = config?.bridge?.pluginOrigin;
    const source = pinnedSourceRef.current;
    if (
      !source ||
      typeof bridgeId !== "string" ||
      !bridgeId ||
      typeof pluginOrigin !== "string" ||
      !pluginOrigin
    ) {
      return;
    }
    const postCommand = (message: Record<string, unknown>) => {
      try {
        (source as Window).postMessage(
          { ...message, bridgeId, source: "folio-parent" },
          pluginOrigin
        );
      } catch {
        // The editor may close while a command is in flight.
      }
    };
    if (saveRequest > lastSaveRequestRef.current) {
      lastSaveRequestRef.current = saveRequest;
      postCommand({
        action: saveAction,
        ...(saveAction === "save-correction" ? { reason: saveReason } : {}),
        type: "run-action",
      });
    }
    if (clearDirtyRequest > lastClearDirtyRequestRef.current) {
      lastClearDirtyRequestRef.current = clearDirtyRequest;
      postCommand({ type: "clear-dirty" });
    }
  }, [
    bridgeReadyVersion,
    clearDirtyRequest,
    config,
    saveAction,
    saveReason,
    saveRequest,
  ]);

  useEffect(() => {
    let cancelled = false;
    exportScopeRef.current = null;
    if (!configUrl) {
      setConfig(null);
      setError("ไม่มีการตั้งค่าตัวแก้ไขเอกสาร");
      reportState("error");
      return () => {
        cancelled = true;
      };
    }

    const checkpointController = new AbortController();
    const path = editorConfigPath(configUrl, pdmsOpeningId);
    onCommandReadyChangeRef.current?.(false);
    loadedConfigUrlRef.current = null;
    setConfig(null);
    setAttachmentNotice(undefined);
    setRoutingPending(undefined);
    setCleanupWarning(undefined);
    setCheckpointPending(true);
    setError(null);
    reportState("loading");

    // oxlint-disable-next-line complexity -- Resolve actor-scoped checkpoints and cancellation before constructing any editable native frame.
    const loadConfig = async () => {
      try {
        const sessionToken = getToken();
        const pendingFiles = uploadPocFilesRef.current;
        const recoveredSubmit =
          pendingFiles && onBridgeMessageRef.current
            ? await pendingFiles.submittedBeforeConfig(
                path,
                checkpointController.signal
              )
            : null;
        if (recoveredSubmit) {
          checkpointController.signal.throwIfAborted();
          pendingFiles?.prepareSubmittedRecovery(recoveredSubmit);
          await onBridgeMessageRef.current?.(recoveredSubmit.message);
          if (recoveredSubmit.message.hasPendingAttachments) {
            throw new ApiError(
              409,
              "attachment_checkpoint_unresolved",
              "รอบก่อนส่งสำเร็จแล้ว แต่ยังมีไฟล์ที่เลือกใหม่ค้างอยู่ กรุณารักษาหน้านี้ไว้ก่อน"
            );
          }
          pendingFiles?.confirmSubmittedRecovery(recoveredSubmit);
          return;
        }
        let nextConfig = await apiGet<EditorConfig>(path);
        checkpointController.signal.throwIfAborted();
        // Renew the existing lease while reconciliation waits, without constructing an editable native frame.
        loadedConfigUrlRef.current = configUrl;
        setConfig(nextConfig);
        const attachmentOptions = nextConfig.bridge?.uploadPoc;
        const reconciliation =
          attachmentOptions && pendingFiles
            ? await pendingFiles.reconcileBeforeEdit(
                attachmentOptions,
                nextConfig.bridge?.capabilities,
                checkpointController.signal
              )
            : false;
        if (typeof reconciliation === "object") {
          if (!onBridgeMessageRef.current) {
            throw new ApiError(
              409,
              "attachment_checkpoint_unresolved",
              "ตรวจพบผลการส่งรอบก่อนแล้ว กรุณากลับไปหน้ากรอกเพื่อตรวจผลเดิม"
            );
          }
          pendingFiles?.prepareSubmittedRecovery(reconciliation);
          await onBridgeMessageRef.current(reconciliation.message);
          if (reconciliation.message.hasPendingAttachments) {
            throw new ApiError(
              409,
              "attachment_checkpoint_unresolved",
              "รอบก่อนส่งสำเร็จแล้ว แต่ยังมีไฟล์ที่เลือกใหม่ค้างอยู่ กรุณารักษาหน้านี้ไว้ก่อน"
            );
          }
          pendingFiles?.confirmSubmittedRecovery(reconciliation);
          return;
        }
        if (reconciliation) {
          nextConfig = await apiGet<EditorConfig>(path);
        }
        if (cancelled) {
          return;
        }
        const capability = nextConfig.bridge?.capabilities?.["export-workbook"];
        if (isNonEmptyString(capability)) {
          exportScopeRef.current = {
            capability,
            config: nextConfig,
            sessionToken,
          };
        }
        setConfig(nextConfig);
        const mutationHold =
          nextConfig.attachmentNotice ||
          nextConfig.bridge?.uploadPoc?.mutationNotice;
        setMutationState(mutationHold ? "unresolved" : "idle");
        if (mutationHold) {
          onBridgeMessageRef.current?.({
            action:
              nextConfig.bridge?.uploadPoc?.action === "correction"
                ? "save-correction"
                : "save-draft",
            attachmentCommitUnresolved: true,
            bridgeId: nextConfig.bridge?.id ?? "editor-checkpoint",
            error: mutationHold,
            source: "form-bridge",
            status: "failed",
            type: "operation",
          });
        }
        setCheckpointPending(false);
        if (nextConfig.editorUrl) {
          reportState("ready");
        }
      } catch (caughtError) {
        if (cancelled) {
          return;
        }
        if (
          caughtError instanceof ApiError &&
          caughtError.code === "editor_in_use"
        ) {
          setError(null);
          reportState("blocked");
          return;
        }
        setError(
          caughtError instanceof ApiError &&
            caughtError.code === "attachment_checkpoint_unresolved"
            ? caughtError.message
            : "ไม่สามารถโหลดตัวแก้ไขเอกสารได้ กรุณาลองใหม่อีกครั้ง"
        );
        reportState("error");
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
      checkpointController.abort();
    };
  }, [configUrl, pdmsOpeningId, reportState, retryToken, revision]);

  useEffect(() => {
    if (editorState === "blocked" || editorState === "error") {
      feedbackRef.current?.focus();
    }
  }, [editorState]);

  // oxlint-disable-next-line complexity -- Guard and coordinate one native editor generation, its bridge and save acknowledgements.
  useEffect(() => {
    if (
      !config ||
      checkpointPending ||
      loadedConfigUrlRef.current !== configUrl
    ) {
      return;
    }

    const bridgeId = isNonEmptyString(config.bridge?.id)
      ? config.bridge.id
      : "";
    const pluginOrigin = isNonEmptyString(config.bridge?.pluginOrigin)
      ? config.bridge.pluginOrigin
      : "";
    const hasBridge = bridgeId.length > 0 && pluginOrigin.length > 0;
    if (
      (readOnly && config.bridge !== undefined) ||
      (!readOnly && !hasBridge && !config.editorUrl)
    ) {
      setError("การตั้งค่าตัวแก้ไขเอกสารไม่ถูกต้อง");
      reportState("error");
      return;
    }
    let cancelled = false;
    let mountedHost: HTMLDivElement | null = null;
    const nativeSessionDocumentKey = config.bridge?.documentKey;
    let continuedOperationId: string | null = null;
    let continuationBlocked = false;
    let pendingContinuation: {
      operationId: string;
      documentKey: string;
      timer: number;
      resolve: (accepted: boolean) => void;
      reject: (error: Error) => void;
    } | null = null;
    const settleContinuation = (failure?: Error) => {
      const pending = pendingContinuation;
      if (!pending) {
        return;
      }
      pendingContinuation = null;
      clearTimeout(pending.timer);
      if (failure) {
        pending.reject(failure);
      } else {
        pending.resolve(true);
      }
    };
    const liveConfigPath = () => {
      const path = editorConfigPath(configUrl ?? "", pdmsOpeningId);
      if (!continuedOperationId || !nativeSessionDocumentKey) {
        return path;
      }
      const url = new URL(path, window.location.origin);
      url.searchParams.set("continuedOperationId", continuedOperationId);
      url.searchParams.set(
        "nativeSessionDocumentKey",
        nativeSessionDocumentKey
      );
      return `${url.pathname}${url.search}`;
    };
    liveConfigPathRef.current = liveConfigPath;

    const scriptUrl =
      config.apiScriptUrl ??
      `${config.apiUrl ?? "http://localhost:8080"}/web-apps/apps/api/documents/api.js`;
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptUrl}"]`
    );
    pinnedSourceRef.current = null;
    terminalOperationIdsRef.current.clear();
    let nativeDocumentDirty: boolean | null = null;
    let nativeSaveError: string | null = null;
    let pendingEditorSaveId: string | null = null;
    const pdmsPopupRelay = createPdmsPopupRelay({
      bridgeId,
      getPrimary: () => pinnedSourceRef.current,
      isLive: (source): source is Window =>
        !cancelled && isEditorWindowSource(source, surfaceRef.current),
      pluginOrigin,
      scope: readOnly ? undefined : config.bridge?.pdmsProjectPopup,
    });
    const attachmentCategoryPopupRelay = createAttachmentCategoryPopupRelay({
      bridgeId,
      getPrimary: () => pinnedSourceRef.current,
      isLive: (source): source is Window =>
        !cancelled && isEditorWindowSource(source, surfaceRef.current),
      pluginOrigin,
      scope: readOnly ? undefined : config.bridge?.attachmentCategoryPopup,
    });
    const respondToEditorSave = (saveFailure?: string) => {
      const requestId = pendingEditorSaveId;
      const source = pinnedSourceRef.current;
      if (!requestId || !source || cancelled) {
        return;
      }
      pendingEditorSaveId = null;
      try {
        (source as Window).postMessage(
          {
            bridgeId,
            requestId,
            source: "folio-parent",
            type: "editor-save-response",
            ...(saveFailure ? { error: saveFailure } : { saved: true }),
          },
          pluginOrigin
        );
      } catch {
        // The plugin may close its frame while native saving is in flight.
      }
    };
    const respondToCapabilityRequest = (
      request: CapabilityRequestMessage,
      response:
        | {
            capability: string;
            pdmsProjectCatalog?: EditorConfig["pdmsProjectCatalog"];
          }
        | { error: string },
      requestedSource: MessageEventSource
    ) => {
      if (cancelled) {
        return;
      }
      const pinnedSource = pinnedSourceRef.current;
      if (
        !pinnedSource ||
        pinnedSource !== requestedSource ||
        !isEditorWindowSource(pinnedSource, surfaceRef.current)
      ) {
        return;
      }
      try {
        (pinnedSource as Window).postMessage(
          {
            action: request.action,
            bridgeId,
            requestId: request.requestId,
            source: "folio-parent",
            type: "capability-response",
            ...response,
          },
          pluginOrigin
        );
      } catch {
        // The plugin may close its frame while renewal is in flight.
      }
    };

    const renewCapability = async (
      request: CapabilityRequestMessage,
      requestedSource: MessageEventSource
    ) => {
      if (!configUrl) {
        respondToCapabilityRequest(
          request,
          {
            error: "ไม่พบสิทธิ์สำหรับตัวแก้ไขเอกสาร",
          },
          requestedSource
        );
        return;
      }

      const requestedLeaseId = leaseRef.current?.id;
      try {
        const path = liveConfigPath();
        const fresh = await apiGet<EditorConfig>(path);
        if (cancelled || pinnedSourceRef.current !== requestedSource) {
          return;
        }
        if (changedEditorDocument(config, fresh)) {
          respondToCapabilityRequest(
            request,
            { error: "เอกสารเปลี่ยนแล้ว กรุณาเก็บข้อมูลในตัวแก้ไขก่อนเปิดใหม่" },
            requestedSource
          );
          return;
        }
        const freshLease = fresh.bridge?.lease;
        if (
          !freshLease ||
          !requestedLeaseId ||
          leaseRef.current?.id !== requestedLeaseId
        ) {
          respondToCapabilityRequest(
            request,
            { error: "สิทธิ์ตัวแก้ไขเปลี่ยนระหว่างยืนยัน กรุณากดอีกครั้ง" },
            requestedSource
          );
          return;
        }
        leaseRef.current = freshLease;

        const capability = fresh.bridge?.capabilities?.[request.action];
        if (typeof capability !== "string" || !capability) {
          respondToCapabilityRequest(
            request,
            {
              error: "ไม่พบสิทธิ์สำหรับตัวแก้ไขเอกสาร",
            },
            requestedSource
          );
          return;
        }
        respondToCapabilityRequest(
          request,
          {
            capability,
            ...(fresh.pdmsProjectCatalog
              ? { pdmsProjectCatalog: fresh.pdmsProjectCatalog }
              : {}),
          },
          requestedSource
        );
      } catch {
        if (!cancelled) {
          respondToCapabilityRequest(
            request,
            {
              error: "ไม่สามารถยืนยันสิทธิ์ตัวแก้ไขเอกสารได้",
            },
            requestedSource
          );
        }
      }
    };
    const holdEditor = (source: MessageEventSource | null) => {
      try {
        (source as Window | null)?.postMessage(
          { bridgeId, source: "folio-parent", type: "hold-editor" },
          pluginOrigin
        );
      } catch {
        // The inert host preserves later work if the native frame closed.
      }
    };
    // oxlint-disable-next-line complexity -- Verify canonical, native-session, lease and request ownership together before retaining the live editor.
    const continueDraftEditor = async (
      message: Extract<EditorBridgeMessage, { type: "operation" }>,
      source: MessageEventSource
    ) => {
      const { operationId } = message;
      try {
        const nextDocumentKey = message.operation?.result?.documentKey;
        const previousLease = leaseRef.current?.id;
        if (
          !operationId ||
          !nextDocumentKey ||
          !config.bridge?.uploadPoc ||
          !configUrl ||
          !nativeSessionDocumentKey ||
          !previousLease
        ) {
          throw new Error("ยังยืนยันตัวแก้ไขรอบถัดไปไม่ได้ กรุณารักษาหน้านี้ไว้");
        }
        continuedOperationId = operationId;
        const expectedRequest = requestSequenceRef.current;
        const fresh = await apiGet<EditorConfig>(liveConfigPath(), {
          timeoutMs: editorCommandDeadlineMs,
        });
        if (
          cancelled ||
          pinnedSourceRef.current !== source ||
          requestSequenceRef.current !== expectedRequest
        ) {
          throw new Error("ตัวแก้ไขเปลี่ยนระหว่างตรวจผล กรุณารักษาหน้านี้ไว้");
        }
        const uploadPoc = fresh.bridge?.uploadPoc;
        if (
          !uploadPoc ||
          fresh.bridge?.documentKey !== nextDocumentKey ||
          uploadPoc.documentKey !== nextDocumentKey ||
          uploadPoc.scopeIdentity !== config.bridge.uploadPoc.scopeIdentity ||
          fresh.bridge?.lease?.id !== previousLease ||
          leaseRef.current?.id !== previousLease ||
          recordOrEmpty(fresh.config?.document).key !==
            recordOrEmpty(config.config?.document).key
        ) {
          throw new Error("สิทธิ์หรือเอกสารเปลี่ยนแล้ว กรุณารักษาหน้านี้ไว้");
        }
        leaseRef.current = fresh.bridge.lease;
        // Replacing config would destroy the live native frame and newer browser work.
        config.bridge.documentKey = nextDocumentKey;
        config.bridge.capabilities = fresh.bridge.capabilities;
        config.bridge.uploadPoc = { ...uploadPoc, bridgeId };
        config.bridge.lease = fresh.bridge.lease;
        pdmsPopupRelay.continueDocument(nextDocumentKey);
        config.pdmsProjectCatalog = fresh.pdmsProjectCatalog;
        if (exportScopeRef.current?.config === config) {
          const capability = fresh.bridge.capabilities?.["export-workbook"];
          if (capability) {
            exportScopeRef.current.capability = capability;
          }
        }
        onCommandReadyChangeRef.current?.(false);
        const { promise, resolve, reject } = createDeferred<boolean>();
        const timer = window.setTimeout(() => {
          settleContinuation(
            new Error("รอบก่อนบันทึกแล้ว แต่ตัวแก้ไขยังไม่ยืนยันค่าช่องแนบ")
          );
        }, editorCommandDeadlineMs);
        pendingContinuation = {
          documentKey: nextDocumentKey,
          operationId,
          reject,
          resolve,
          timer,
        };
        try {
          (source as Window).postMessage(
            {
              bridgeId,
              documentKey: nextDocumentKey,
              operationId,
              pdmsProjectCatalog: fresh.pdmsProjectCatalog,
              savedData: uploadPoc.savedData,
              source: "folio-parent",
              spreadsheetBindings: uploadPoc.spreadsheetBindings,
              type: "retain-completed-editor",
            },
            pluginOrigin
          );
        } catch {
          settleContinuation(new Error("ตัวแก้ไขปิดระหว่างคืนค่าช่องแนบ"));
        }
        await promise;
        if (
          cancelled ||
          pinnedSourceRef.current !== source ||
          requestSequenceRef.current !== expectedRequest
        ) {
          throw new Error("ตัวแก้ไขเปลี่ยนระหว่างคืนค่าช่องแนบ");
        }
        onCommandReadyChangeRef.current?.(true);
      } catch {
        if (cancelled) {
          return;
        }
        continuationBlocked = true;
        onCommandReadyChangeRef.current?.(false);
        setAttachmentNotice(
          "รอบก่อนบันทึกแล้ว แต่ยังคืนค่าช่องแนบในตัวแก้ไขไม่ได้ กรุณารักษางานที่เลือกภายหลังไว้ก่อน"
        );
        holdEditor(pinnedSourceRef.current);
      }
    };

    const refreshUploadPocOptions = async (
      options: UploadPocHostOptions
    ): Promise<UploadPocHostOptions> => {
      const requestedLeaseId = leaseRef.current?.id;
      if (!configUrl || !requestedLeaseId) {
        throw new Error("ยืนยันการตั้งค่าปุ่มล่าสุดไม่ได้ กรุณาเปิดตัวแก้ไขใหม่");
      }
      const fresh = await apiGet<EditorConfig>(liveConfigPath());
      const refreshed = fresh.bridge?.uploadPoc;
      if (
        !refreshed ||
        changedEditorDocument(config, fresh) ||
        refreshed.action !== options.action ||
        refreshed.documentKey !== options.documentKey ||
        refreshed.scopeIdentity !== options.scopeIdentity ||
        fresh.bridge?.lease?.id !== requestedLeaseId ||
        leaseRef.current?.id !== requestedLeaseId
      ) {
        throw new Error("ต้นแบบหรือสิทธิ์ตัวแก้ไขเปลี่ยนไป กรุณาเปิดตัวแก้ไขใหม่");
      }
      return {
        ...options,
        savedButtons: refreshed.savedButtons,
        spreadsheetBindings: refreshed.spreadsheetBindings,
      };
    };

    // oxlint-disable-next-line complexity -- Keep scope, lease adoption and File identity checks in this asynchronous bridge boundary.
    const respondToUploadPoc = async (
      event: MessageEvent<unknown>,
      data: Record<string, unknown>
    ) => {
      const options = config.bridge?.uploadPoc;
      const holder = uploadPocFilesRef.current;
      if (!options || !event.source || !holder) {
        return;
      }
      const requestedLeaseId = leaseRef.current?.id;
      let result: Record<string, unknown>;
      try {
        if (continuationBlocked) {
          throw new Error(
            "รอบก่อนบันทึกแล้ว แต่ยังเปลี่ยนตัวแก้ไขโดยรักษางานใหม่ไม่ได้ กรุณารักษาหน้านี้ไว้"
          );
        }
        if (
          data.type === "pending-file-check" &&
          candidateSourcesRef.current.size > 0 &&
          !holder.hasUnresolvedCommit()
        ) {
          throw new Error(
            "มีการเลือกในกล่องที่ยังไม่ยืนยัน กรุณายืนยันหรือยกเลิกในกล่องก่อนดำเนินการ"
          );
        }
        const currentOptions =
          options.action === "template-edit"
            ? await refreshUploadPocOptions(options)
            : options;
        if (
          cancelled ||
          !isEditorWindowSource(event.source, surfaceRef.current)
        ) {
          return;
        }
        holder.setScope(currentOptions.scopeIdentity);
        if (data.type === "pending-file-save") {
          capturedEditVersionRef.current = documentEditVersionRef.current;
          await holder.refreshStatus(currentOptions);
          result = await holder.save(
            { ...data, documentKey: currentOptions.documentKey },
            currentOptions
          );
        } else {
          result = holder.handle(
            { ...data, documentKey: currentOptions.documentKey },
            currentOptions
          );
          if (
            [
              "pending-file-set",
              "pending-file-remove",
              "pending-file-cancel",
            ].includes(String(data.type)) &&
            !result.error
          ) {
            pendingEditVersionRef.current += 1;
          }
          if (typeof result.hasPending === "boolean") {
            onDirtyChangeRef.current?.(
              documentDirtyRef.current ||
                holder.hasPending() ||
                candidateSourcesRef.current.size > 0
            );
          }
          const status = await holder.refreshStatus(currentOptions);
          if (status) {
            Object.assign(result, status);
          }
        }
        if (
          data.type === "pending-file-check" &&
          ["save-draft", "submit", "save-correction"].includes(
            String(data.action)
          )
        ) {
          result.checkpointOperation =
            await holder.pendingOperation(currentOptions);
        }
      } catch (caughtError) {
        const recoveredLease = recoveredAttachmentLease(
          caughtError,
          requestedLeaseId,
          leaseRef.current
        );
        if (
          recoveredLease &&
          !cancelled &&
          isEditorWindowSource(event.source, surfaceRef.current)
        ) {
          leaseRef.current = recoveredLease;
        }
        result = {
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "เลือกไฟล์ไม่ได้ กรุณาลองใหม่",
        };
        setAttachmentNotice(config.attachmentNotice || String(result.error));
      }
      if (
        cancelled ||
        !isEditorWindowSource(event.source, surfaceRef.current)
      ) {
        return;
      }
      result.attachmentCommitUnresolved = holder.hasUnresolvedCommit();
      event.source.postMessage(
        {
          ...result,
          bridgeId,
          documentKey: data.documentKey,
          requestId: data.requestId,
          source: "folio-upload-poc-host",
          type: "pending-file-result",
        },
        pluginOrigin
      );
      const hasPending = holder.hasPending();
      onDirtyChangeRef.current?.(
        documentDirtyRef.current ||
          hasPending ||
          candidateSourcesRef.current.size > 0
      );
      if (!result.error) {
        if (
          typeof result.cleanupWarning === "string" ||
          result.cleanupWarning === null
        ) {
          setCleanupWarning(result.cleanupWarning);
        }
        if (
          typeof result.mutationNotice === "string" &&
          result.mutationNotice
        ) {
          setAttachmentNotice(result.mutationNotice);
        } else if (
          typeof result.commitNotice === "string" &&
          result.commitNotice
        ) {
          setAttachmentNotice(result.commitNotice);
        } else if (typeof result.validationError === "string") {
          setAttachmentNotice(result.validationError);
        } else if (hasPending) {
          const slot = typeof data.tag === "string" ? ` ในช่อง ${data.tag}` : "";
          setAttachmentNotice(
            `มีการเปลี่ยนไฟล์แนบค้างไว้${slot} ยังไม่บันทึก กรุณากดบันทึกฉบับร่างหรือส่ง การปิดหรือรีเฟรชหน้าจะทิ้งการเปลี่ยนที่ยังไม่บันทึก`
          );
        } else {
          setAttachmentNotice(null);
        }
      }
    };

    // oxlint-disable-next-line complexity -- Dispatches the trusted bridge protocol and capability renewal in one handler.
    const handleBridgeMessage = async (event: MessageEvent<unknown>) => {
      if (event.origin !== pluginOrigin) {
        return;
      }

      const { data } = event;
      pdmsPopupRelay.handle(event);
      attachmentCategoryPopupRelay.handle(event);
      if (
        pdmsPopupRelay.isPopupSource(event.source) ||
        attachmentCategoryPopupRelay.isPopupSource(event.source) ||
        (isRecord(data) && data.source === "folio-attachment-category-popup")
      ) {
        return;
      }
      if (isRecord(data) && data.source === "folio-upload-poc") {
        const options = config.bridge?.uploadPoc;
        if (
          !options ||
          readOnly ||
          !isEditorWindowSource(event.source, surfaceRef.current) ||
          data.bridgeId !== bridgeId ||
          (data.documentKey !== options.documentKey &&
            (data.documentKey !== nativeSessionDocumentKey ||
              data.type === "pending-file-save" ||
              data.type === "pending-file-check")) ||
          data.scopeIdentity !== options.scopeIdentity ||
          typeof data.requestId !== "string"
        ) {
          return;
        }
        if (data.type === "pending-file-candidate") {
          if (typeof data.dirty !== "boolean" || !event.source) {
            return;
          }
          if (data.dirty) {
            candidateSourcesRef.current.add(event.source);
          } else {
            candidateSourcesRef.current.delete(event.source);
          }
          onDirtyChangeRef.current?.(
            documentDirtyRef.current ||
              uploadPocFilesRef.current?.hasPending() === true ||
              candidateSourcesRef.current.size > 0
          );
          return;
        }
        void respondToUploadPoc(event, data);
        return;
      }
      if (isBridgeReadyMessage(data, bridgeId)) {
        if (!isEditorWindowSource(event.source, surfaceRef.current)) {
          return;
        }
        if (
          pinnedSourceRef.current &&
          pinnedSourceRef.current !== event.source
        ) {
          settleContinuation(new Error("ตัวแก้ไขเชื่อมต่อใหม่ระหว่างคืนค่าช่องแนบ"));
          pendingCaptureRef.current?.reject(
            new Error("The workbook editor reconnected during capture")
          );
          respondToEditorSave(
            "The plugin closed before native saving completed"
          );
        }
        pinnedSourceRef.current = event.source;
        onCommandReadyChangeRef.current?.(!continuationBlocked);
        acknowledgeBridge(
          event.source,
          pluginOrigin,
          bridgeId,
          !config.editorUrl && !readOnly
        );
        pdmsPopupRelay.primaryReady();
        attachmentCategoryPopupRelay.primaryReady();
        setBridgeReadyVersion((value) => value + 1);
        if (
          continuationBlocked ||
          retiredCorrectionRef.current ||
          config.attachmentNotice ||
          config.bridge?.uploadPoc?.mutationNotice
        ) {
          holdEditor(event.source);
        }
        return;
      }

      const pinnedSource = pinnedSourceRef.current;
      if (
        !pinnedSource ||
        event.source !== pinnedSource ||
        !isEditorWindowSource(pinnedSource, surfaceRef.current)
      ) {
        return;
      }

      if (
        isRecord(data) &&
        data.source === "form-bridge" &&
        data.bridgeId === bridgeId &&
        data.type === "retained-editor-result" &&
        data.operationId === continuedOperationId &&
        data.documentKey === config.bridge?.documentKey
      ) {
        if (continuationBlocked) {
          holdEditor(pinnedSource);
          return;
        }
        if (
          !pendingContinuation ||
          pendingContinuation.operationId !== data.operationId ||
          pendingContinuation.documentKey !== data.documentKey ||
          typeof data.ok !== "boolean"
        ) {
          return;
        }
        settleContinuation(
          data.ok ? undefined : new Error("คืนค่าช่องแนบที่บันทึกแล้วไม่ได้")
        );
        return;
      }
      if (
        isRecord(data) &&
        data.bridgeId === bridgeId &&
        data.source === "form-bridge" &&
        data.type === "workbook-capture"
      ) {
        const pending = pendingCaptureRef.current;
        if (pending && data.requestId === pending.requestId) {
          if (isNonEmptyString(data.snapshotUrl)) {
            pending.resolve(data.snapshotUrl);
          } else {
            pending.reject(new Error("The workbook could not be captured"));
          }
        }
        return;
      }

      if (
        isRecord(data) &&
        data.bridgeId === bridgeId &&
        data.source === "form-bridge" &&
        data.type === "editor-save-request" &&
        isNonEmptyString(data.requestId)
      ) {
        // Native save synchronization means the plugin accepted the command;
        // its own save/operation deadlines now govern completion.
        if (pendingCommandRef.current) {
          clearTimeout(pendingCommandRef.current.timer);
          pendingCommandRef.current = null;
        }
        capturedEditVersionRef.current = documentEditVersionRef.current;
        setMutationState("saving");
        pendingEditorSaveId = data.requestId;
        if (config.editorUrl || readOnly || nativeDocumentDirty === null) {
          respondToEditorSave(
            "Native editor save synchronization is unavailable"
          );
        } else if (nativeSaveError) {
          respondToEditorSave(nativeSaveError);
        } else if (!nativeDocumentDirty) {
          respondToEditorSave();
        }
        return;
      }

      const capabilityRequest = parseCapabilityRequest(data, bridgeId);
      if (capabilityRequest) {
        void renewCapability(capabilityRequest, pinnedSource);
        return;
      }
      const fieldSelection = parseFieldSelectionMessage(data, bridgeId);
      if (fieldSelection) {
        onBridgeMessageRef.current?.(fieldSelection);
        return;
      }
      const dirtyMessage = parseDirtyStateMessage(data, bridgeId);
      if (dirtyMessage) {
        if (dirtyMessage.dirty) {
          documentEditVersionRef.current += 1;
        }
        documentDirtyRef.current =
          dirtyMessage.dirty ||
          (capturedEditVersionRef.current !== null &&
            documentEditVersionRef.current > capturedEditVersionRef.current);
        onDirtyChangeRef.current?.(
          documentDirtyRef.current ||
            uploadPocFilesRef.current?.hasPending() === true ||
            candidateSourcesRef.current.size > 0
        );
        return;
      }
      let message = parseOperationMessage(data, bridgeId);
      if (!message) {
        return;
      }
      if (
        retiredCorrectionRef.current &&
        message.action === "save-correction-workspace"
      ) {
        return;
      }
      if (message.status === "pending" && !message.operationId) {
        requestSequenceRef.current += 1;
      }
      const requestSequence = requestSequenceRef.current;
      if (message.status === "pending") {
        if (message.operationId) {
          capturedEditVersionRef.current ??= documentEditVersionRef.current;
        } else {
          capturedEditVersionRef.current = documentEditVersionRef.current;
          capturedPendingVersionRef.current = pendingEditVersionRef.current;
        }
        setMutationState("saving");
      }
      const result = message.operation?.result;
      if (result?.editorSessionPreserved === true) {
        const uploadPoc = config.bridge?.uploadPoc;
        const canonicalDocumentKey = config.bridge?.documentKey;
        // Keeping an iframe is valid only for the same editable Excel session.
        // A changed/missing key falls back to the normal save-and-remount flow.
        const preserved =
          !readOnly &&
          message.action === "save-template" &&
          message.status === "completed" &&
          uploadPoc?.action === "template-edit" &&
          isNonEmptyString(result.documentKey) &&
          result.documentKey === canonicalDocumentKey &&
          result.documentKey === uploadPoc.documentKey;
        if (!preserved) {
          message = {
            ...message,
            operation: {
              ...message.operation,
              result: { ...result, editorSessionPreserved: false },
            },
          };
        }
      }
      if (
        pendingCommandRef.current?.action === message.action ||
        (message.requestedAction !== undefined &&
          pendingCommandRef.current?.action === message.requestedAction)
      ) {
        clearTimeout(pendingCommandRef.current.timer);
        pendingCommandRef.current = null;
      }
      if (message.status === "pending" && message.operationId) {
        terminalOperationIdsRef.current.delete(message.operationId);
      }
      const isTerminal =
        message.status === "completed" || message.status === "failed";
      if (
        isTerminal &&
        message.operationId &&
        terminalOperationIdsRef.current.has(message.operationId)
      ) {
        return;
      }
      if (isTerminal && message.operationId) {
        terminalOperationIdsRef.current.add(message.operationId);
      }
      let editorRemountSafe = false;
      if (message.status === "completed" && message.operationId) {
        const completedOperationId = message.operationId;
        try {
          const options = config.bridge?.uploadPoc;
          if (
            options &&
            uploadPocFilesRef.current?.hasPending() &&
            ["save-draft", "save-correction-workspace"].includes(message.action)
          ) {
            const verified = await apiGet<{
              operation: {
                id: string;
                responseId: string;
                status: string;
                type: string;
                result: unknown;
              };
            }>(`/api/operations/${message.operationId}`);
            if (cancelled || pinnedSourceRef.current !== event.source) {
              return;
            }
            if (
              verified.operation.id !== message.operationId ||
              verified.operation.responseId !== options.responseId ||
              verified.operation.status !== "completed" ||
              verified.operation.type !==
                (message.action === "save-draft"
                  ? "save_draft"
                  : "save_correction")
            ) {
              throw new Error(
                "ยังยืนยัน Operation ที่เปลี่ยนตำแหน่งไฟล์ไม่ได้ กรุณารักษาหน้านี้ไว้"
              );
            }
            const trusted = parseOperationMessage(
              {
                ...message,
                operation: { result: verified.operation.result },
              },
              bridgeId
            );
            if (!trusted) {
              throw new Error(
                "ผล mapping ของเอกสารใหม่ไม่ถูกต้อง กรุณารักษาไฟล์ในหน้าปัจจุบัน"
              );
            }
            message = trusted;
          }
          if (requestSequence !== requestSequenceRef.current) {
            return;
          }
          const capturedSnapshot = uploadPocFilesRef.current?.complete(
            completedOperationId,
            config.bridge?.uploadPoc,
            message.operation?.result
          );
          editorRemountSafe =
            !capturedSnapshot &&
            candidateSourcesRef.current.size === 0 &&
            (capturedPendingVersionRef.current === null ||
              pendingEditVersionRef.current ===
                capturedPendingVersionRef.current) &&
            (capturedEditVersionRef.current === null ||
              documentEditVersionRef.current ===
                capturedEditVersionRef.current);
          if (
            !capturedSnapshot &&
            !editorRemountSafe &&
            message.operation?.result?.documentKey &&
            message.operation.result.documentKey !== config.bridge?.documentKey
          ) {
            continuationBlocked = true;
            onCommandReadyChangeRef.current?.(false);
            holdEditor(event.source);
            setAttachmentNotice(
              "รอบก่อนบันทึกแล้ว แต่มีงานที่เลือกภายหลัง ตัวแก้ไขยังอ่านอย่างเดียวเพื่อไม่ทิ้งหรือย้ายงานใหม่ กรุณารักษาหน้านี้ไว้"
            );
          }
          if (
            capturedSnapshot &&
            message.action === "save-draft" &&
            (uploadPocFilesRef.current?.hasPending() ||
              candidateSourcesRef.current.size > 0 ||
              (capturedEditVersionRef.current !== null &&
                documentEditVersionRef.current >
                  capturedEditVersionRef.current))
          ) {
            await continueDraftEditor(message, event.source);
          }
        } catch (transitionError) {
          if (cancelled || requestSequence !== requestSequenceRef.current) {
            return;
          }
          const detail =
            transitionError instanceof Error
              ? transitionError.message
              : "ยังยืนยันตำแหน่งไฟล์หลังบันทึกไม่ได้ กรุณารักษาหน้านี้ไว้";
          setAttachmentNotice(detail);
          setMutationState("unresolved");
          terminalOperationIdsRef.current.delete(completedOperationId);
          onBridgeMessageRef.current?.({
            ...message,
            attachmentCommitUnresolved: true,
            error: detail,
            hasPendingAttachments: true,
            status: "failed",
          });
          return;
        }
        if (!continuationBlocked) {
          setAttachmentNotice(
            uploadPocFilesRef.current?.hasPending() ||
              candidateSourcesRef.current.size > 0
              ? "มีไฟล์ที่เลือกใหม่ยังไม่อยู่ในรอบบันทึกที่สำเร็จ กรุณารักษาหน้านี้ไว้"
              : null
          );
        }
      }
      if (requestSequence !== requestSequenceRef.current) {
        return;
      }
      if (message.status === "completed") {
        documentDirtyRef.current =
          capturedEditVersionRef.current !== null &&
          documentEditVersionRef.current > capturedEditVersionRef.current;
        if (message.action === "save-correction") {
          retiredCorrectionRef.current = true;
        }
        setMutationState(continuationBlocked ? "blocked" : "idle");
        const options = config.bridge?.uploadPoc;
        if (options) {
          void (async () => {
            try {
              const status =
                await uploadPocFilesRef.current?.refreshStatus(options);
              if (
                !cancelled &&
                requestSequence === requestSequenceRef.current
              ) {
                if (status?.cleanupWarning) {
                  setCleanupWarning(status.cleanupWarning);
                }
                setRoutingPending(status?.attachmentRoutingPending);
              }
            } catch {
              // Keep the last durable cleanup warning when its refresh is unavailable.
            }
          })();
        }
      }
      if (message.status === "failed" && !config.bridge?.uploadPoc) {
        setMutationState(
          message.attachmentCommitUnresolved ? "unresolved" : "idle"
        );
      }
      if (message.status === "failed" && config.bridge?.uploadPoc) {
        let unresolved = message.attachmentCommitUnresolved === true;
        try {
          const status = await uploadPocFilesRef.current?.refreshStatus(
            config.bridge.uploadPoc
          );
          unresolved ||= Boolean(status?.mutationNotice);
          if (status?.mutationNotice) {
            setAttachmentNotice(status.mutationNotice);
          }
          if (status?.cleanupWarning) {
            setCleanupWarning(status.cleanupWarning);
          }
        } catch {
          // A lost status response is not evidence that the original checkpoint settled.
          unresolved ||=
            uploadPocFilesRef.current?.hasUnresolvedCommit() === true;
        }
        if (cancelled || requestSequence !== requestSequenceRef.current) {
          return;
        }
        if (unresolved) {
          holdEditor(event.source);
        }
        setMutationState(unresolved ? "unresolved" : "idle");
        message = { ...message, attachmentCommitUnresolved: unresolved };
      }
      message = {
        ...message,
        editorRemountSafe,
        hasAttachmentCandidates: candidateSourcesRef.current.size > 0,
        hasPendingAttachments:
          uploadPocFilesRef.current?.hasPending() === true ||
          candidateSourcesRef.current.size > 0,
        hasUnsavedDocumentChanges: documentDirtyRef.current,
      };
      onBridgeMessageRef.current?.(message);
    };

    if (hasBridge) {
      window.addEventListener("message", handleBridgeMessage);
    }
    const detachBridge = () => {
      pendingCaptureRef.current?.reject(
        new Error("The workbook editor closed during capture")
      );
      respondToEditorSave("The native editor closed before changes were saved");
      attachmentCategoryPopupRelay.close();
      cancelled = true;
      settleContinuation(new Error("ตัวแก้ไขปิดระหว่างคืนค่าช่องแนบ"));
      pdmsPopupRelay.close();
      window.removeEventListener("message", handleBridgeMessage);
      pinnedSourceRef.current = null;
      onCommandReadyChangeRef.current?.(false);
    };

    if (config.editorUrl || !hostRef.current) {
      return detachBridge;
    }

    if (!isRecord(config.config)) {
      setError("การตั้งค่าตัวแก้ไขเอกสารไม่ถูกต้อง");
      reportState("error");
      return detachBridge;
    }

    const documentEditorConfig = recordOrEmpty(config.config.editorConfig);
    const editorConfig = {
      ...config.config,
      editorConfig: {
        ...documentEditorConfig,
        customization: {
          ...recordOrEmpty(documentEditorConfig.customization),
          close: { text: "คืนค่าขนาดปกติ", visible: true },
        },
      },
      events: {
        ...recordOrEmpty(config.config.events),
        onDocumentReady: () => {
          // A newly loaded, untouched document has no pending local changes.
          nativeDocumentDirty ??= false;
        },
        onDocumentStateChange: (event: unknown) => {
          if (!isRecord(event) || typeof event.data !== "boolean") {
            respondToEditorSave(
              "The native editor returned an invalid save state"
            );
            return;
          }
          nativeDocumentDirty = event.data;
          if (
            !readOnly &&
            (config.config?.documentType === "cell" || trackNativeDirty) &&
            nativeDocumentDirty
          ) {
            // Office autosave is separate from Folio's saved draft/submission.
            documentDirtyRef.current = true;
            documentEditVersionRef.current += 1;
            onDirtyChangeRef.current?.(true);
          }
          if (!nativeDocumentDirty) {
            // ONLYOFFICE defines false as changes sent to its editing service.
            nativeSaveError = null;
            respondToEditorSave();
          }
        },
        onError: () => {
          nativeSaveError = "The native editor could not save document changes";
          respondToEditorSave(nativeSaveError);
        },
        onRequestClose: restore,
      },
    };
    const mount = () => {
      if (cancelled) {
        return;
      }
      if (!window.DocsAPI || !hostRef.current) {
        setError("ไม่สามารถเปิดตัวแก้ไขเอกสารได้ กรุณาตรวจสอบบริการ ONLYOFFICE");
        reportState("error");
        return;
      }

      const host = hostRef.current;
      const placeholder = document.createElement("div");
      mountGenerationRef.current += 1;
      const placeholderId = `${editorId}-mount-${mountGenerationRef.current}`;
      placeholder.id = placeholderId;
      placeholder.className = "h-full w-full";
      host.replaceChildren(placeholder);
      mountedHost = host;
      editorRef.current = new window.DocsAPI.DocEditor(
        placeholderId,
        editorConfig
      );
      reportState("ready");
    };
    const handleScriptError = () => {
      if (!cancelled) {
        setError("ไม่สามารถโหลดตัวแก้ไขเอกสารได้ กรุณาลองใหม่อีกครั้ง");
        reportState("error");
      }
    };

    if (window.DocsAPI) {
      mount();
    } else if (existing) {
      existing.addEventListener("load", mount, { once: true });
      existing.addEventListener("error", handleScriptError, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.addEventListener("load", mount, { once: true });
      script.addEventListener("error", handleScriptError, { once: true });
      document.head.append(script);
    }

    return () => {
      detachBridge();
      const editor = editorRef.current;
      editorRef.current = null;
      try {
        editor?.destroyEditor?.();
      } finally {
        mountedHost?.replaceChildren();
      }
    };
  }, [
    config,
    checkpointPending,
    configUrl,
    pdmsOpeningId,
    editorId,
    readOnly,
    reportState,
    restore,
    trackNativeDirty,
  ]);

  const retry = () => {
    setError(null);
    setConfig(null);
    reportState("loading");
    setRetryToken((value) => value + 1);
  };

  const activeAttachmentNotice =
    attachmentNotice === undefined
      ? config?.attachmentNotice
      : attachmentNotice;
  const activeCleanupWarning =
    cleanupWarning === undefined
      ? config?.bridge?.uploadPoc?.cleanupWarning
      : cleanupWarning;

  return (
    <>
      {activeAttachmentNotice ? (
        <p
          className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          {activeAttachmentNotice}
        </p>
      ) : null}
      {(activeAttachmentNotice ||
        mutationState === "unresolved" ||
        (checkpointPending && error)) &&
      config?.bridge?.uploadPoc?.responseId ? (
        <div className="mb-3">
          <p className="mb-2 text-sm text-[var(--ink-soft)]">
            เปิดสำเนาเดิมได้โดยไม่ตรวจรับรอบใหม่ ไม่ส่งไฟล์ซ้ำ และไม่ทิ้งไฟล์ที่เลือกค้างในหน้านี้
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowSavedCopy((visible) => !visible)}
          >
            {showSavedCopy ? "ปิดสำเนาที่บันทึกไว้" : "เปิดอ่าน Excel ฉบับที่บันทึกไว้"}
          </Button>
          {showSavedCopy ? (
            <OnlyOfficeEditor
              configUrl={`/api/responses/${encodeURIComponent(config.bridge.uploadPoc.responseId)}/draft/viewer-config`}
              readOnly
              title="Excel ฉบับที่บันทึกไว้ — อ่านอย่างเดียว"
            />
          ) : null}
        </div>
      ) : null}
      {(routingPending ?? config?.attachmentRoutingPending) ? (
        <p
          className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          บันทึกข้อมูลคำตอบแล้ว แต่ไฟล์แนบที่บันทึกไว้ยังอยู่ที่ปลายทางเดิม
          กดบันทึกร่างหรือส่งคำตอบเพื่อใช้ปลายทางใหม่
          ไฟล์ที่เพิ่งเลือกจะยังไม่ถูกอัปโหลดจนกว่าจะกดบันทึกร่างหรือส่งคำตอบ
        </p>
      ) : null}
      {activeCleanupWarning ? (
        <p
          className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          {activeCleanupWarning}
        </p>
      ) : null}
      {mutationState !== "idle" && (
        <p
          ref={mutationFeedbackRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm outline-none"
        >
          {mutationStateMessages[mutationState]}
        </p>
      )}
      <div
        inert={mutationState !== "idle" || retiredCorrectionRef.current}
        aria-busy={mutationState === "saving"}
      >
        <EditorSurface
          config={checkpointPending ? null : config}
          editorState={editorState}
          error={error}
          title={title}
          expanded={expanded}
          hostRef={hostRef}
          surfaceRef={surfaceRef}
          feedbackRef={feedbackRef}
          surfaceId={surfaceId}
          keyboardHelpId={keyboardHelpId}
          onRetry={retry}
          onToggleExpanded={() => setExpanded((value) => !value)}
          onRestore={restore}
        />
      </div>
    </>
  );
};
