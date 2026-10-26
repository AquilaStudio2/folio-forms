import { useCallback, useEffect, useId, useRef, useState } from "react";

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
  EditorBridgeMessage,
  EditorConfig,
  EditorLease,
  OnlyOfficeEditorState,
} from "@/features/onlyoffice/editor-protocol";
import { EditorSurface } from "@/features/onlyoffice/editor-surface";
import { isEditorWindowSource } from "@/features/onlyoffice/editor-window-source";
import type { UploadPocHostOptions } from "@/features/onlyoffice/upload-poc-pending";
import { UploadPocPendingFiles } from "@/features/onlyoffice/upload-poc-pending";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/api";

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

export const OnlyOfficeEditor = ({
  clearDirtyRequest = 0,
  configUrl,
  onBridgeMessage,
  onDirtyChange,
  onCommandReadyChange,
  onStateChange,
  readOnly = false,
  revision = 0,
  saveAction = "save-draft",
  saveReason = "",
  saveRequest = 0,
  trackNativeDirty = false,
  title,
}: {
  clearDirtyRequest?: number;
  configUrl?: string;
  onBridgeMessage?: (message: EditorBridgeMessage) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onCommandReadyChange?: (ready: boolean) => void;
  onStateChange?: (state: OnlyOfficeEditorState) => void;
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
}) => {
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
  const lastClearDirtyRequestRef = useRef(0);
  const lastSaveRequestRef = useRef(0);
  const terminalOperationIdsRef = useRef(new Set<string>());
  const mountGenerationRef = useRef(0);
  const editorId = useId().replaceAll(":", "");
  const surfaceId = `${editorId}-surface`;
  const keyboardHelpId = `${editorId}-keyboard-help`;
  const leaseRef = useRef<EditorLease | null>(null);
  const loadedConfigUrlRef = useRef<string | null>(null);
  const [config, setConfig] = useState<EditorConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorState, setEditorState] =
    useState<OnlyOfficeEditorState>("loading");
  const [expanded, setExpanded] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [bridgeReadyVersion, setBridgeReadyVersion] = useState(0);

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
    if (!configUrl) {
      setConfig(null);
      setError("ไม่มีการตั้งค่าตัวแก้ไขเอกสาร");
      reportState("error");
      return () => {
        cancelled = true;
      };
    }

    const path = editorConfigPath(configUrl);
    onCommandReadyChangeRef.current?.(false);
    loadedConfigUrlRef.current = null;
    setConfig(null);
    setError(null);
    reportState("loading");

    const loadConfig = async () => {
      try {
        const nextConfig = await apiGet<EditorConfig>(path);
        if (cancelled) {
          return;
        }
        loadedConfigUrlRef.current = configUrl;
        setConfig(nextConfig);
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
        setError("ไม่สามารถโหลดตัวแก้ไขเอกสารได้ กรุณาลองใหม่อีกครั้ง");
        reportState("error");
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [configUrl, reportState, retryToken, revision]);

  useEffect(() => {
    if (editorState === "blocked" || editorState === "error") {
      feedbackRef.current?.focus();
    }
  }, [editorState]);

  useEffect(() => {
    if (!config) {
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
      response: { capability: string } | { error: string },
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
        const path = editorConfigPath(configUrl);
        const fresh = await apiGet<EditorConfig>(path);
        if (cancelled || pinnedSourceRef.current !== requestedSource) {
          return;
        }
        const freshLease = fresh.bridge?.lease;
        if (
          freshLease &&
          requestedLeaseId &&
          leaseRef.current?.id === requestedLeaseId
        ) {
          leaseRef.current = freshLease;
        }

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
        respondToCapabilityRequest(request, { capability }, requestedSource);
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
      const fresh = await apiGet<EditorConfig>(editorConfigPath(configUrl));
      const refreshed = fresh.bridge?.uploadPoc;
      if (
        !refreshed ||
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

    const respondToUploadPoc = async (
      event: MessageEvent<unknown>,
      data: Record<string, unknown>
    ) => {
      const options = config.bridge?.uploadPoc;
      if (!options || !event.source) {
        return;
      }
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
        result = uploadPocFilesRef.current?.handle(data, currentOptions) ?? {
          error: "ยังเชื่อมต่อไฟล์ในหน้านี้ไม่ได้",
        };
      } catch (caughtError) {
        result = {
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "เลือกไฟล์ไม่ได้ กรุณาลองใหม่",
        };
      }
      if (
        cancelled ||
        !isEditorWindowSource(event.source, surfaceRef.current)
      ) {
        return;
      }
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
    };

    // oxlint-disable-next-line complexity -- Dispatches the trusted bridge protocol and capability renewal in one handler.
    const handleBridgeMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== pluginOrigin) {
        return;
      }

      const { data } = event;
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
        onDirtyChangeRef.current?.(dirtyMessage.dirty);
        return;
      }
      let message = parseOperationMessage(data, bridgeId);
      if (!message) {
        return;
      }
      const result = message.operation?.result;
      if (result?.editorSessionPreserved === true) {
        const uploadPoc = config.bridge?.uploadPoc;
        const nativeDocumentKey = recordOrEmpty(
          recordOrEmpty(config.config).document
        ).key;
        // Keeping an iframe is valid only for the same editable Excel session.
        // A changed/missing key falls back to the normal save-and-remount flow.
        const preserved =
          !readOnly &&
          message.action === "save-template" &&
          message.status === "completed" &&
          uploadPoc?.action === "template-edit" &&
          isNonEmptyString(result.documentKey) &&
          result.documentKey === nativeDocumentKey &&
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
      if (pendingCommandRef.current?.action === message.action) {
        clearTimeout(pendingCommandRef.current.timer);
        pendingCommandRef.current = null;
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
      onBridgeMessageRef.current?.(message);
    };

    if (hasBridge) {
      window.addEventListener("message", handleBridgeMessage);
    }
    const detachBridge = () => {
      respondToEditorSave("The native editor closed before changes were saved");
      cancelled = true;
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
    configUrl,
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

  return (
    <EditorSurface
      config={config}
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
  );
};
