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
      if (uploadPocFilesRef.current?.hasPending()) {
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
    if (saveRequest === 0) {
      return;
    }
    const timer = setTimeout(() => {
      pendingCommandRef.current = null;
      // A late handshake must not deliver a command the page has reported failed.
      lastSaveRequestRef.current = Math.max(
        lastSaveRequestRef.current,
        saveRequest
      );
      onBridgeMessageRef.current?.({
        action: saveAction,
        bridgeId: "editor-command",
        error:
          "ตัวแก้ไขยังไม่ตอบรับคำสั่ง กรุณารอให้เชื่อมต่อพร้อมแล้วลองใหม่ เก็บหน้านี้ไว้เพื่อรักษาการเปลี่ยนแปลง",
        source: "form-bridge",
        status: "failed",
        type: "operation",
      });
    }, 30_000);
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
        const path = editorConfigPath(configUrl, pdmsOpeningId);
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

    const refreshUploadPocOptions = async (
      options: UploadPocHostOptions
    ): Promise<UploadPocHostOptions> => {
      const requestedLeaseId = leaseRef.current?.id;
      if (!configUrl || !requestedLeaseId) {
        throw new Error("ยืนยันการตั้งค่าปุ่มล่าสุดไม่ได้ กรุณาเปิดตัวแก้ไขใหม่");
      }
      const fresh = await apiGet<EditorConfig>(
        editorConfigPath(configUrl, pdmsOpeningId)
      );
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
          await holder.refreshStatus(currentOptions);
          result = await holder.save(data, currentOptions);
        } else {
          result = holder.handle(data, currentOptions);
          if (typeof result.hasPending === "boolean") {
            onDirtyChangeRef.current?.(
              documentDirtyRef.current || holder.hasPending()
            );
          }
          const status = await holder.refreshStatus(currentOptions);
          if (status) {
            Object.assign(result, status);
          }
        }
        if (
          data.type === "pending-file-check" &&
          ["save-draft", "submit"].includes(String(data.action))
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
          documentKey: options.documentKey,
          requestId: data.requestId,
          source: "folio-upload-poc-host",
          type: "pending-file-result",
        },
        pluginOrigin
      );
      const hasPending = holder.hasPending();
      if (hasPending) {
        onDirtyChangeRef.current?.(true);
      }
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
      if (pdmsPopupRelay.isPopupSource(event.source)) {
        return;
      }
      if (isRecord(data) && data.source === "folio-upload-poc") {
        const options = config.bridge?.uploadPoc;
        if (
          !options ||
          readOnly ||
          !isEditorWindowSource(event.source, surfaceRef.current) ||
          data.bridgeId !== bridgeId ||
          data.documentKey !== options.documentKey ||
          data.scopeIdentity !== options.scopeIdentity ||
          typeof data.requestId !== "string"
        ) {
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
          pendingCaptureRef.current?.reject(
            new Error("The workbook editor reconnected during capture")
          );
          respondToEditorSave(
            "The plugin closed before native saving completed"
          );
        }
        pinnedSourceRef.current = event.source;
        onCommandReadyChangeRef.current?.(true);
        acknowledgeBridge(
          event.source,
          pluginOrigin,
          bridgeId,
          !config.editorUrl && !readOnly
        );
        pdmsPopupRelay.primaryReady();
        setBridgeReadyVersion((value) => value + 1);
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
        documentDirtyRef.current = dirtyMessage.dirty;
        onDirtyChangeRef.current?.(
          dirtyMessage.dirty || uploadPocFilesRef.current?.hasPending() === true
        );
        return;
      }
      let message = parseOperationMessage(data, bridgeId);
      if (!message) {
        return;
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
          uploadPocFilesRef.current?.complete(
            completedOperationId,
            config.bridge?.uploadPoc,
            message.operation?.result
          );
        } catch (transitionError) {
          const detail =
            transitionError instanceof Error
              ? transitionError.message
              : "ยังยืนยันตำแหน่งไฟล์หลังบันทึกไม่ได้ กรุณารักษาหน้านี้ไว้";
          setAttachmentNotice(detail);
          terminalOperationIdsRef.current.delete(completedOperationId);
          onBridgeMessageRef.current?.({
            ...message,
            error: detail,
            hasPendingAttachments: true,
            status: "failed",
          });
          return;
        }
        setAttachmentNotice(
          uploadPocFilesRef.current?.hasPending()
            ? "มีไฟล์ที่เลือกใหม่ยังไม่อยู่ในรอบบันทึกที่สำเร็จ กรุณารักษาหน้านี้ไว้"
            : null
        );
      }
      if (message.status === "failed" && config.bridge?.uploadPoc) {
        const options = config.bridge.uploadPoc;
        const refreshFailureStatus = async () => {
          try {
            const status =
              await uploadPocFilesRef.current?.refreshStatus(options);
            if (!cancelled && status?.mutationNotice) {
              setAttachmentNotice(status.mutationNotice);
            }
          } catch {
            // Keep the original failure and checkpoint when durable status cannot be read.
          }
        };
        refreshFailureStatus();
      }
      message = {
        ...message,
        hasPendingAttachments: uploadPocFilesRef.current?.hasPending() ?? false,
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
      cancelled = true;
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
      {(activeAttachmentNotice || (checkpointPending && error)) &&
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
      {activeCleanupWarning ? (
        <p
          className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          {activeCleanupWarning}
        </p>
      ) : null}
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
    </>
  );
};
