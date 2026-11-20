import { API_ORIGIN } from "@/lib/api";

import type { AttachmentCategoryPopupScope } from "./attachment-category-popup-relay";
import type { PdmsProjectPopupScope } from "./pdms-popup-relay";
import type { UploadPocHostOptions } from "./upload-poc-pending";

type EditorAction =
  | "save-template"
  | "publish"
  | "save-draft"
  | "save-correction"
  | "save-correction-workspace"
  | "submit"
  | "configure-fields";
type EditorOperationAction = Exclude<EditorAction, "configure-fields">;
type FieldControlType =
  | "text"
  | "checkbox"
  | "date"
  | "dropdown"
  | "combo"
  | "picture"
  | "unsupported";
type EditorOperationStatus = "pending" | "completed" | "failed";
export type OnlyOfficeEditorState = "loading" | "ready" | "blocked" | "error";

export type CaptureWorkbook = () => Promise<{
  capability: string;
  refreshCapability: (signal: AbortSignal) => Promise<string>;
  snapshotUrl: string;
}>;

export interface EditorLease {
  id: string;
  expiresAt: string;
  releaseUrl: string;
  renewUrl: string;
}

export const leaseRenewalIntervalMs = 30_000;

export const editorConfigPath = (
  configUrl: string,
  openingId?: string
): string => {
  const path = configUrl.startsWith("http")
    ? configUrl.replace(API_ORIGIN, "")
    : configUrl;
  return openingId
    ? `${path}${path.includes("?") ? "&" : "?"}pdmsOpeningId=${encodeURIComponent(openingId)}`
    : path;
};

export interface PdmsProjectCatalog {
  names: string[];
  sessionId: string;
  status: "ready" | "error" | "loading";
}

export interface EditorConfig {
  attachmentNotice?: string | null;
  attachmentRoutingPending?: boolean;
  pdmsProjectCatalog?: PdmsProjectCatalog;
  apiScriptUrl?: string;
  apiUrl?: string;
  bridge?: {
    attachmentCategoryPopup?: AttachmentCategoryPopupScope;
    documentKey?: string;
    capabilities?: Partial<Record<EditorAction | "export-workbook", string>>;
    id?: string;
    lease?: EditorLease;
    pluginOrigin?: string;
    pdmsProjectPopup?: PdmsProjectPopupScope;
    uploadPoc?: UploadPocHostOptions;
  };
  config?: Record<string, unknown>;
  editorUrl?: string;
  [key: string]: unknown;
}

interface DirtyStateBridgeMessage {
  bridgeId: string;
  dirty: boolean;
  source: "form-bridge";
  type: "dirty-state";
}
interface BridgeReadyMessage {
  bridgeId: string;
  source: "form-bridge";
  type: "bridge-ready";
}

export interface CapabilityRequestMessage {
  action: EditorAction;
  bridgeId: string;
  requestId: string;
  source: "form-bridge";
  type: "capability-request";
}
interface FieldSelectionBridgeMessage {
  bridgeId: string;
  controlType: FieldControlType;
  selectionId: string;
  selected: boolean;
  source: "form-bridge";
  tag: string | null;
  type: "field-selection";
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const recordOrEmpty = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const isEditorOperationAction = (
  value: unknown
): value is EditorOperationAction =>
  value === "save-template" ||
  value === "publish" ||
  value === "save-draft" ||
  value === "save-correction" ||
  value === "save-correction-workspace" ||
  value === "submit";
const isEditorAction = (value: unknown): value is EditorAction =>
  value === "configure-fields" || isEditorOperationAction(value);
const isFieldControlType = (value: unknown): value is FieldControlType =>
  value === "text" ||
  value === "checkbox" ||
  value === "date" ||
  value === "dropdown" ||
  value === "combo" ||
  value === "picture" ||
  value === "unsupported";

const isOperationStatus = (value: unknown): value is EditorOperationStatus =>
  value === "pending" || value === "completed" || value === "failed";

export const isBridgeReadyMessage = (
  value: unknown,
  bridgeId: string
): value is BridgeReadyMessage =>
  isRecord(value) &&
  value.bridgeId === bridgeId &&
  value.source === "form-bridge" &&
  value.type === "bridge-ready";

export const parseDirtyStateMessage = (
  value: unknown,
  bridgeId: string
): DirtyStateBridgeMessage | null =>
  isRecord(value) &&
  value.bridgeId === bridgeId &&
  typeof value.dirty === "boolean" &&
  value.source === "form-bridge" &&
  value.type === "dirty-state"
    ? (value as unknown as DirtyStateBridgeMessage)
    : null;

export const parseCapabilityRequest = (
  value: unknown,
  bridgeId: string
): CapabilityRequestMessage | null => {
  if (
    !isRecord(value) ||
    value.bridgeId !== bridgeId ||
    value.source !== "form-bridge" ||
    value.type !== "capability-request" ||
    typeof value.action !== "string" ||
    !isEditorAction(value.action) ||
    typeof value.requestId !== "string" ||
    !value.requestId
  ) {
    return null;
  }

  return value as unknown as CapabilityRequestMessage;
};

export const parseFieldSelectionMessage = (
  value: unknown,
  bridgeId: string
): FieldSelectionBridgeMessage | null => {
  if (
    !isRecord(value) ||
    value.bridgeId !== bridgeId ||
    value.source !== "form-bridge" ||
    value.type !== "field-selection" ||
    !isNonEmptyString(value.selectionId) ||
    typeof value.selected !== "boolean" ||
    (value.tag !== null && typeof value.tag !== "string") ||
    !isFieldControlType(value.controlType)
  ) {
    return null;
  }

  return value as unknown as FieldSelectionBridgeMessage;
};

const isValidAttachmentTransition = (value: unknown): boolean =>
  isRecord(value) &&
  isNonEmptyString(value.fromDocumentKey) &&
  isNonEmptyString(value.toDocumentKey) &&
  (value.tableBindingId === null || isNonEmptyString(value.tableBindingId)) &&
  Number.isSafeInteger(value.oldRowCount) &&
  Number(value.oldRowCount) >= 0 &&
  Number.isSafeInteger(value.newRowCount) &&
  Number(value.newRowCount) >= (value.tableBindingId === null ? 0 : 1) &&
  Array.isArray(value.rowMapping) &&
  value.rowMapping.length === value.oldRowCount &&
  value.rowMapping.every(
    (row) =>
      row === null ||
      (Number.isSafeInteger(row) && row >= 0 && row < Number(value.newRowCount))
  );

const isValidOperationResult = (value: Record<string, unknown>): boolean =>
  (value.submissionId === undefined ||
    typeof value.submissionId === "string") &&
  (value.documentKey === undefined || isNonEmptyString(value.documentKey)) &&
  (value.editorSessionPreserved === undefined ||
    typeof value.editorSessionPreserved === "boolean") &&
  (value.attachmentTransition === undefined ||
    isValidAttachmentTransition(value.attachmentTransition));

// oxlint-disable-next-line complexity -- Validate original/requested action correlation and terminal payload together at the untrusted bridge boundary.
export const parseOperationMessage = (
  value: unknown,
  bridgeId: string
): EditorOperationBridgeMessage | null => {
  if (
    !isRecord(value) ||
    value.bridgeId !== bridgeId ||
    value.source !== "form-bridge" ||
    value.type !== "operation" ||
    typeof value.action !== "string" ||
    !isEditorOperationAction(value.action) ||
    !isOperationStatus(value.status) ||
    (value.operationId !== undefined && !isNonEmptyString(value.operationId)) ||
    (value.status === "completed" && !isNonEmptyString(value.operationId)) ||
    (value.attachmentCommitUnresolved !== undefined &&
      typeof value.attachmentCommitUnresolved !== "boolean") ||
    (value.error !== undefined && typeof value.error !== "string") ||
    (value.requestedAction !== undefined &&
      (typeof value.requestedAction !== "string" ||
        !isEditorOperationAction(value.requestedAction)))
  ) {
    return null;
  }

  if (value.operation !== undefined) {
    if (!isRecord(value.operation)) {
      return null;
    }
    if (value.operation.result !== undefined) {
      if (!isRecord(value.operation.result)) {
        return null;
      }
      if (!isValidOperationResult(value.operation.result)) {
        return null;
      }
    }
  }

  return value as unknown as EditorOperationBridgeMessage;
};

interface EditorOperationBridgeMessage {
  action: EditorOperationAction;
  bridgeId: string;
  error?: string;
  requestedAction?: EditorOperationAction;
  hasPendingAttachments?: boolean;
  hasAttachmentCandidates?: boolean;
  attachmentCommitUnresolved?: boolean;
  hasUnsavedDocumentChanges?: boolean;
  editorRemountSafe?: boolean;
  operation?: {
    result?: {
      documentKey?: string;
      attachmentTransition?: unknown;
      editorSessionPreserved?: boolean;
      submissionId?: string;
    };
  };
  operationId?: string;
  source: "form-bridge";
  status: EditorOperationStatus;
  type: "operation";
}

export type EditorBridgeMessage =
  | DirtyStateBridgeMessage
  | EditorOperationBridgeMessage
  | FieldSelectionBridgeMessage;

export const acknowledgeBridge = (
  source: MessageEventSource,
  pluginOrigin: string,
  bridgeId: string,
  editorSaveSupported: boolean
) => {
  try {
    (source as Window).postMessage(
      {
        bridgeId,
        editorSaveSupported,
        source: "folio-parent",
        type: "bridge-ack",
      },
      pluginOrigin
    );
  } catch {
    // The plugin may close its frame while the handshake is in flight.
  }
};
