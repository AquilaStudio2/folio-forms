import {
  ApiError,
  apiGet,
  apiPost,
  apiPostFormData,
  waitForOperation,
} from "@/lib/api";
import type { Operation } from "@/lib/api";

import { AttachmentAdmissionRecoveredError } from "./attachment-admission-recovery";
import type { NegativeAdmissionProof } from "./attachment-admission-recovery";
import type { EditorBridgeMessage } from "./editor-protocol";

interface AcceptedAttachmentOperation {
  action: "save-draft" | "submit";
  operationId: string;
  operationCapability: string;
  status: string;
  batchState?: string;
}

const requireOriginalAction = (
  operation: AcceptedAttachmentOperation
): void => {
  if (!["save-draft", "submit"].includes(operation.action)) {
    throw new Error("ยังยืนยันประเภทของการบันทึกรอบเดิมไม่ได้ กรุณาตรวจผลเดิมอีกครั้ง");
  }
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const currentBindingTag = (
  bindings: Record<string, unknown>,
  id: unknown
): unknown => {
  const scalar = Array.isArray(bindings.fields)
    ? bindings.fields.find((field) => record(field) && field.id === id)
    : null;
  const table = record(bindings.table) ? bindings.table : null;
  const column =
    table && Array.isArray(table.columns)
      ? table.columns.find((field) => record(field) && field.id === id)
      : null;
  const field = record(scalar) ? scalar : column;
  if (!record(field) || field.type !== "text" || field.computed === true) {
    return null;
  }
  return record(scalar) ? field.key : `${table?.key}.${field.key}`;
};

export interface UploadPocHostOptions {
  action: string;
  bridgeId: string;
  documentKey: string;
  scopeIdentity: string;
  spreadsheetBindings: unknown;
  savedButtons?: unknown;
  publicId?: string;
  responseId?: string;
  savedData?: unknown;
  cleanupWarning?: string | null;
  mutationNotice?: string | null;
}

interface SubmittedCheckpointRecovery {
  checkpoint: string;
  message: Extract<EditorBridgeMessage, { type: "operation" }>;
  operationId: string;
  storageKey: string;
}

const completedSubmitRecovery = (
  operationId: string,
  checkpoint: string,
  storageKey: string,
  operation: Operation
): SubmittedCheckpointRecovery => {
  const { result } = operation;
  if (!result || typeof result.submissionId !== "string") {
    throw new Error("ยังยืนยันเอกสารที่ส่งในรอบก่อนไม่ได้ กรุณาลองตรวจผลเดิมอีกครั้ง");
  }
  return {
    checkpoint,
    message: {
      action: "submit",
      bridgeId: "attachment-checkpoint-recovery",
      operation: {
        result: {
          submissionId: result.submissionId,
        },
      },
      operationId,
      requestedAction: "submit",
      source: "form-bridge",
      status: "completed",
      type: "operation",
    },
    operationId,
    storageKey,
  };
};

const checkpointStoragePrefix = "folio-attachment-checkpoint:";
const storedCheckpointScope = (
  key: string
): { publicId: string; responseId: string } | null => {
  if (!key.startsWith(checkpointStoragePrefix)) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(
      key.slice(checkpointStoragePrefix.length)
    );
    if (!Array.isArray(value) || value.length !== 3) {
      return null;
    }
    const [actorId, publicId, responseId] = value;
    return typeof actorId === "string" &&
      typeof publicId === "string" &&
      typeof responseId === "string"
      ? { publicId, responseId }
      : null;
  } catch {
    return null;
  }
};
const settleCheckpointOperation = async (
  id: string,
  signal: AbortSignal
): Promise<Operation> => {
  let failed: Operation | undefined;
  try {
    return await waitForOperation(id, (operation) => {
      signal.throwIfAborted();
      if (operation.status === "failed") {
        failed = operation;
      }
    });
  } catch (error) {
    if (failed) {
      return failed;
    }
    throw error;
  }
};
interface PendingAttachmentSnapshot {
  files: Map<string, File>;
  removals: Map<string, { tag: unknown }>;
}

/** Selected bytes stay in host memory; only scoped checkpoint identities survive reload. */
export class UploadPocPendingFiles {
  private scopeIdentity = "";
  private documentKey = "";
  private readonly files = new Map<string, { file: File; tag: unknown }>();
  private readonly invalidFiles = new Map<string, string>();
  private readonly removals = new Map<string, { tag: unknown }>();
  private readonly accepted = new Map<string, PendingAttachmentSnapshot>();
  private readonly failedCheckpoints = new Set<string>();
  private checkpointStorageKey = "";
  private readonly checkpoints = new Map<string, PendingAttachmentSnapshot>();
  private readonly operationCheckpoints = new Map<string, string>();
  private mutationNotice: string | null = null;
  private cleanupWarning: string | null = null;
  private statusFetched = false;

  async refreshStatus(options: UploadPocHostOptions) {
    if (!options.responseId || options.action === "template-edit") {
      return null;
    }
    const status = await apiGet<{
      mutationNotice: string | null;
      cleanupWarning: string | null;
    }>(`/api/responses/${options.responseId}/attachment-status`);
    this.requireScope(options);
    this.mutationNotice = status.mutationNotice;
    this.cleanupWarning = status.cleanupWarning;
    this.statusFetched = true;
    return status;
  }

  complete(
    operationId: string,
    options?: UploadPocHostOptions,
    result?: { documentKey?: string; attachmentTransition?: unknown }
  ): void {
    const snapshot = this.accepted.get(operationId);
    const hasRemaining =
      this.invalidFiles.size > 0 ||
      [...this.files].some(
        ([key, value]) => snapshot?.files.get(key) !== value.file
      ) ||
      [...this.removals].some(
        ([key, value]) => snapshot?.removals.get(key) !== value
      );
    let mapping: (number | null)[] | undefined;
    if (
      options &&
      hasRemaining &&
      typeof result?.documentKey === "string" &&
      result.documentKey !== options.documentKey
    ) {
      if (this.documentKey && this.documentKey !== options.documentKey) {
        throw new Error("ผลบันทึกเป็นของเอกสารเก่า กรุณารักษาไฟล์ในหน้าปัจจุบัน");
      }
      const transition = UploadPocPendingFiles.verifyTransitionScope(
        options,
        result.documentKey,
        result.attachmentTransition
      );
      mapping = UploadPocPendingFiles.verifyRowDestinations(
        transition.rowMapping,
        transition.newRowCount
      );
      this.requirePendingRowsPreserved(mapping);
    }
    if (snapshot) {
      this.acceptSnapshot(snapshot);
    }
    if (mapping) {
      this.remapPendingRows(mapping);
    }
    if (result?.documentKey) {
      this.documentKey = result.documentKey;
    }
    this.accepted.delete(operationId);
    const checkpoint = this.operationCheckpoints.get(operationId);
    if (checkpoint) {
      this.clearCheckpoint(checkpoint);
    }
    this.operationCheckpoints.delete(operationId);
  }

  private static verifyTransitionScope(
    options: UploadPocHostOptions,
    documentKey: string,
    transition: unknown
  ): { rowMapping: unknown[]; newRowCount: number } {
    const bindings = record(options.spreadsheetBindings)
      ? options.spreadsheetBindings
      : {};
    const table = record(bindings.table) ? bindings.table : null;
    const locations = record(bindings.locations) ? bindings.locations : {};
    const bodyValue =
      table && typeof table.anchor === "string"
        ? locations[table.anchor]
        : null;
    const body = record(bodyValue) ? bodyValue : null;
    const oldRowCount = body
      ? Number(body.lastRow) - Number(body.firstRow) + 1
      : 0;
    if (
      !record(transition) ||
      transition.fromDocumentKey !== options.documentKey ||
      transition.toDocumentKey !== documentKey ||
      transition.tableBindingId !== (table?.id ?? null) ||
      transition.oldRowCount !== oldRowCount ||
      !Number.isSafeInteger(transition.newRowCount) ||
      Number(transition.newRowCount) < 0 ||
      !Array.isArray(transition.rowMapping) ||
      transition.rowMapping.length !== oldRowCount
    ) {
      throw new Error(
        "ยังยืนยัน mapping ของไฟล์กับเอกสารใหม่ไม่ได้ กรุณารักษาหน้านี้ไว้ ไม่ต้องโหลดหน้าใหม่"
      );
    }
    return {
      newRowCount: Number(transition.newRowCount),
      rowMapping: transition.rowMapping,
    };
  }

  private static verifyRowDestinations(
    rows: unknown[],
    newRowCount: number
  ): (number | null)[] {
    const mapping: (number | null)[] = [];
    const destinations = new Set<number>();
    for (const row of rows) {
      if (
        row !== null &&
        (typeof row !== "number" ||
          !Number.isSafeInteger(row) ||
          row < 0 ||
          row >= newRowCount ||
          destinations.has(row))
      ) {
        throw new Error("ตำแหน่งแถวใหม่ไม่ถูกต้อง กรุณารักษาไฟล์ในหน้าปัจจุบัน");
      }
      mapping.push(row);
      if (row !== null) {
        destinations.add(row);
      }
    }
    return mapping;
  }

  private requirePendingRowsPreserved(
    mapping: readonly (number | null)[]
  ): void {
    for (const key of [
      ...this.files.keys(),
      ...this.removals.keys(),
      ...this.invalidFiles.keys(),
    ]) {
      const [, rowIndex] = JSON.parse(key) as [string, number | null];
      if (
        rowIndex !== null &&
        (mapping[rowIndex] === null || mapping[rowIndex] === undefined)
      ) {
        throw new Error(
          "แถวที่มีไฟล์ค้างถูกนำออก จึงยังเปลี่ยนเอกสารไม่ได้ กรุณารักษาหน้านี้ไว้"
        );
      }
    }
  }

  private remapPendingRows(rowMapping: readonly (number | null)[]): void {
    const remap = <T>(entries: Map<string, T>): void => {
      const next = [...entries].map(([key, value]) => {
        const [bindingId, rowIndex] = JSON.parse(key) as [
          string,
          number | null,
        ];
        return [
          JSON.stringify([
            bindingId,
            rowIndex === null ? null : rowMapping[rowIndex],
          ]),
          value,
        ] as const;
      });
      entries.clear();
      for (const [key, value] of next) {
        entries.set(key, value);
      }
    };
    remap(this.files);
    remap(this.removals);
    remap(this.invalidFiles);
  }

  private clearCheckpoint(
    checkpoint: string,
    storageKey = this.checkpointStorageKey
  ): void {
    if (sessionStorage.getItem(storageKey) === checkpoint) {
      sessionStorage.removeItem(storageKey);
    }
    this.checkpoints.delete(checkpoint);
    this.failedCheckpoints.delete(checkpoint);
  }

  private remember(
    checkpoint: string,
    operation: AcceptedAttachmentOperation
  ): void {
    const snapshot = this.checkpoints.get(checkpoint);
    if (snapshot) {
      this.accepted.set(operation.operationId, snapshot);
    }
    this.operationCheckpoints.set(operation.operationId, checkpoint);
    if (operation.status === "failed") {
      this.failedCheckpoints.add(checkpoint);
    } else {
      this.failedCheckpoints.delete(checkpoint);
    }
  }

  private async original(
    checkpoint: string,
    value: Record<string, unknown>,
    options: UploadPocHostOptions,
    signal?: AbortSignal
  ): Promise<AcceptedAttachmentOperation> {
    const path = `/api/responses/${options.responseId}/attachment-operations/${checkpoint}`;
    try {
      const operation = await apiGet<AcceptedAttachmentOperation>(
        path,
        signal ? { signal } : undefined
      );
      signal?.throwIfAborted();
      this.requireScope(options);
      requireOriginalAction(operation);
      return operation;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
      signal?.throwIfAborted();
      this.requireScope(options);
      if (typeof value.capability !== "string") {
        throw new TypeError("ยังยืนยันสิทธิ์ตรวจผลบันทึกรอบก่อนเพื่อเปิดตัวแก้ไขไม่ได้", {
          cause: error,
        });
      }
      const recovered = await apiPost<
        AcceptedAttachmentOperation | NegativeAdmissionProof
      >(
        `${path}/recover`,
        { action: value.action, documentKey: options.documentKey },
        value.capability
      );
      signal?.throwIfAborted();
      this.requireScope(options);
      if ("admission" in recovered) {
        this.clearCheckpoint(checkpoint);
        throw new AttachmentAdmissionRecoveredError(recovered);
      }
      requireOriginalAction(recovered);
      return recovered;
    }
  }

  private requireScope(options: UploadPocHostOptions): void {
    if (this.scopeIdentity !== options.scopeIdentity) {
      throw new Error("ขอบเขตตัวแก้ไขเปลี่ยนแล้ว กรุณารักษาไฟล์และข้อมูลในหน้าปัจจุบัน");
    }
  }

  hasUnresolvedCommit(): boolean {
    const checkpoint = this.checkpointStorageKey
      ? sessionStorage.getItem(this.checkpointStorageKey)
      : null;
    return checkpoint !== null && !this.failedCheckpoints.has(checkpoint);
  }

  async pendingOperation(
    options: UploadPocHostOptions
  ): Promise<AcceptedAttachmentOperation | null> {
    const checkpoint = this.checkpointStorageKey
      ? sessionStorage.getItem(this.checkpointStorageKey)
      : null;
    if (!checkpoint || !options.responseId) {
      return null;
    }
    try {
      const operation = await apiGet<AcceptedAttachmentOperation>(
        `/api/responses/${options.responseId}/attachment-operations/${checkpoint}`
      );
      this.requireScope(options);
      requireOriginalAction(operation);
      this.remember(checkpoint, operation);
      if (
        operation.status === "failed" &&
        operation.batchState === "canceled"
      ) {
        this.accepted.delete(operation.operationId);
        this.operationCheckpoints.delete(operation.operationId);
        this.clearCheckpoint(checkpoint);
        return null;
      }
      return operation;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /** A completed Submit can close the old editor-config endpoint; resolve it using authenticated evidence first. */
  async submittedBeforeConfig(
    configUrl: string,
    signal: AbortSignal
  ): Promise<SubmittedCheckpointRecovery | null> {
    if (this.hasPending()) {
      return null;
    }
    const url = new URL(configUrl, window.location.origin);
    const form = /^\/api\/forms\/(?<publicId>[^/]+)\/editor-config$/u.exec(
      url.pathname
    );
    const publicId = form?.groups?.publicId;
    const responseId = url.searchParams.get("responseId");
    if (!publicId || !responseId) {
      return null;
    }
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      const stored = key ? storedCheckpointScope(key) : null;
      if (
        !key ||
        !stored ||
        stored.publicId !== publicId ||
        stored.responseId !== responseId
      ) {
        continue;
      }
      const checkpoint = sessionStorage.getItem(key);
      if (!checkpoint) {
        continue;
      }
      let original: AcceptedAttachmentOperation;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Storage names are routing hints; authenticate each candidate before trusting its result.
        original = await apiGet<AcceptedAttachmentOperation>(
          `/api/responses/${responseId}/attachment-operations/${checkpoint}`,
          { signal }
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          continue;
        }
        throw error;
      }
      requireOriginalAction(original);
      if (original.action !== "submit" || original.status !== "completed") {
        return null;
      }
      // oxlint-disable-next-line no-await-in-loop -- Only the authenticated original Submit may drive the existing new-entry transition.
      const terminal = await settleCheckpointOperation(
        original.operationId,
        signal
      );
      signal.throwIfAborted();
      if (sessionStorage.getItem(key) !== checkpoint) {
        return null;
      }
      if (terminal.status !== "completed") {
        return null;
      }
      return completedSubmitRecovery(
        original.operationId,
        checkpoint,
        key,
        terminal
      );
    }
    return null;
  }

  prepareSubmittedRecovery(recovery: SubmittedCheckpointRecovery): void {
    const snapshot = this.accepted.get(recovery.operationId);
    if (snapshot) {
      this.acceptSnapshot(snapshot);
    }
    recovery.message.hasPendingAttachments = this.hasPending();
  }

  confirmSubmittedRecovery(recovery: SubmittedCheckpointRecovery): void {
    this.clearCheckpoint(recovery.checkpoint, recovery.storageKey);
    this.accepted.delete(recovery.operationId);
    this.operationCheckpoints.delete(recovery.operationId);
  }

  /** Reconcile an earlier page's receipt before any new ordinary edits can exist. */
  async reconcileBeforeEdit(
    options: UploadPocHostOptions,
    capabilities: Partial<Record<string, string>> | undefined,
    signal: AbortSignal
  ): Promise<boolean | SubmittedCheckpointRecovery> {
    if (
      !["fill", "draft", "submit"].includes(options.action) ||
      !options.responseId
    ) {
      return false;
    }
    this.setScope(options.scopeIdentity);
    this.bindDocument(options);
    this.checkpointStorageKey = `${checkpointStoragePrefix}${options.scopeIdentity}`;
    const checkpoint = sessionStorage.getItem(this.checkpointStorageKey);
    if (!checkpoint) {
      return false;
    }
    const action = capabilities?.["save-draft"] ? "save-draft" : "submit";
    try {
      let terminal: Operation | undefined;
      let operation = await this.original(
        checkpoint,
        {
          action,
          capability: capabilities?.[action],
        },
        options,
        signal
      );
      if (["pending", "processing"].includes(operation.status)) {
        terminal = await settleCheckpointOperation(
          operation.operationId,
          signal
        );
        operation = await apiGet<AcceptedAttachmentOperation>(
          `/api/responses/${options.responseId}/attachment-operations/${checkpoint}`,
          { signal }
        );
      }
      signal.throwIfAborted();
      this.requireScope(options);
      if (sessionStorage.getItem(this.checkpointStorageKey) !== checkpoint) {
        throw new Error("รอบบันทึกเปลี่ยนระหว่างตรวจผล กรุณาตรวจผลรอบปัจจุบันอีกครั้ง");
      }
      requireOriginalAction(operation);
      this.remember(checkpoint, operation);
      if (operation.status === "completed") {
        if (operation.action === "submit") {
          terminal ??= await settleCheckpointOperation(
            operation.operationId,
            signal
          );
          signal.throwIfAborted();
          return completedSubmitRecovery(
            operation.operationId,
            checkpoint,
            this.checkpointStorageKey,
            terminal
          );
        }
        this.complete(operation.operationId);
      } else if (operation.status === "failed") {
        if (operation.batchState === "canceled") {
          this.accepted.delete(operation.operationId);
          this.operationCheckpoints.delete(operation.operationId);
          this.clearCheckpoint(checkpoint);
        }
      } else {
        throw new Error("ยังไม่พบผลสิ้นสุดของการบันทึกรอบก่อน");
      }
      return true;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AttachmentAdmissionRecoveredError) {
        return true;
      }
      throw new ApiError(
        503,
        "attachment_checkpoint_unresolved",
        "ยังตรวจผลบันทึกรอบก่อนไม่ได้ ตัวแก้ไขยังไม่เปิดเพื่อรักษาข้อมูล กรุณากดลองใหม่เพื่อตรวจผลเดิม ไม่มีการส่งไฟล์ซ้ำ"
      );
    }
  }

  async save(
    value: Record<string, unknown>,
    options: UploadPocHostOptions
  ): Promise<Record<string, unknown>> {
    this.handle({ ...value, type: "pending-file-check" }, options);
    if (
      !["fill", "draft", "submit"].includes(options.action) ||
      !["save-draft", "submit"].includes(String(value.action)) ||
      !options.publicId ||
      !options.responseId ||
      typeof value.capability !== "string" ||
      !record(value.body) ||
      typeof value.snapshotUrl !== "string"
    ) {
      throw new Error("สิทธิ์บันทึกไฟล์ไม่ตรงกับหน้ากรอกปัจจุบัน");
    }
    this.checkpointStorageKey = `${checkpointStoragePrefix}${options.scopeIdentity}`;
    const previous = sessionStorage.getItem(this.checkpointStorageKey);
    if (previous) {
      const original = await this.original(previous, value, options);
      if (original.status !== "failed" || original.batchState !== "canceled") {
        this.remember(previous, original);
        if (original.status === "completed") {
          throw new Error(
            "พบผลสำเร็จของรอบก่อนแล้ว ไม่ใช่ผลของข้อมูลปัจจุบัน กรุณากดบันทึกอีกครั้งเพื่อตรวจผลเดิมก่อนแก้ไขต่อ"
          );
        }
        return { ...original };
      }
      this.accepted.delete(original.operationId);
      this.operationCheckpoints.delete(original.operationId);
      this.clearCheckpoint(previous);
    }
    const snapshot: PendingAttachmentSnapshot = {
      files: this.snapshot(),
      removals: new Map(this.removals),
    };
    const attachmentRemovals = [...snapshot.removals.keys()].map((key) => {
      const [bindingId, rowIndex] = JSON.parse(key) as [string, number | null];
      if (
        typeof bindingId !== "string" ||
        (rowIndex !== null && !Number.isSafeInteger(rowIndex))
      ) {
        throw new Error("ตำแหน่งไฟล์แนบไม่ถูกต้อง กรุณารักษาหน้านี้ไว้");
      }
      return { bindingId, rowIndex };
    });
    const checkpoint = crypto.randomUUID();
    const body = new FormData();
    body.set(
      "payload",
      JSON.stringify({
        ...value.body,
        attachmentRemovals,
        checkpoint,
        documentKey: options.documentKey,
        responseId: options.responseId,
        snapshotUrl: value.snapshotUrl,
      })
    );
    for (const [key, file] of snapshot.files) {
      const [bindingId, rowIndex] = JSON.parse(key) as [string, number | null];
      // A relayed disk File's renderer grant cannot serialize directly; this Blob part preserves bytes without replacing pending File identity.
      // Multipart field names escape quotes; encode only the wire name, not the pending slot key.
      body.set(
        `attachment:${rowIndex === null ? bindingId : encodeURIComponent(key)}`,
        new Blob([file], { type: file.type }),
        file.name
      );
    }
    this.checkpoints.set(checkpoint, snapshot);
    sessionStorage.setItem(this.checkpointStorageKey, checkpoint);
    let accepted: AcceptedAttachmentOperation;
    try {
      accepted = await apiPostFormData<AcceptedAttachmentOperation>(
        `/api/forms/${options.publicId}/${value.action === "submit" ? "submit" : "draft"}`,
        body,
        value.capability
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "attachment_outcome_unresolved"
      ) {
        this.mutationNotice = error.message;
        throw error;
      }
      // A missing lookup is not settlement: only the shared admission fence can prove safe recovery.
      accepted = await this.original(checkpoint, value, options);
    }
    this.requireScope(options);
    this.remember(checkpoint, accepted);
    return { ...accepted };
  }

  hasPending(): boolean {
    return (
      this.files.size > 0 ||
      this.invalidFiles.size > 0 ||
      this.removals.size > 0
    );
  }

  snapshot(): Map<string, File> {
    const invalid = this.invalidFiles.values().next().value;
    if (invalid) {
      throw new Error(invalid);
    }
    return new Map([...this.files].map(([key, value]) => [key, value.file]));
  }

  accept(snapshot: ReadonlyMap<string, File>): void {
    for (const [key, file] of snapshot) {
      if (this.files.get(key)?.file === file) {
        this.files.delete(key);
      }
    }
  }

  private acceptSnapshot(snapshot: PendingAttachmentSnapshot): void {
    this.accept(snapshot.files);
    for (const [key, removal] of snapshot.removals) {
      if (this.removals.get(key) === removal) {
        this.removals.delete(key);
      }
    }
  }

  setScope(scopeIdentity: string): void {
    if (scopeIdentity !== this.scopeIdentity && this.hasPending()) {
      throw new Error("มีไฟล์ค้างในเอกสารเดิม กรุณาบันทึกหรือยกเลิกก่อนเปลี่ยนขอบเขต");
    }
    if (scopeIdentity !== this.scopeIdentity) {
      this.files.clear();
      this.invalidFiles.clear();
      this.removals.clear();
      this.checkpoints.clear();
      this.operationCheckpoints.clear();
      this.accepted.clear();
      this.failedCheckpoints.clear();
      this.checkpointStorageKey = "";
      this.mutationNotice = null;
      this.cleanupWarning = null;
      this.statusFetched = false;
      this.scopeIdentity = scopeIdentity;
      this.documentKey = "";
    }
  }

  private bindDocument(options: UploadPocHostOptions): void {
    if (
      this.documentKey &&
      this.documentKey !== options.documentKey &&
      this.hasPending()
    ) {
      throw new Error("ยังยืนยันการย้ายไฟล์ไปเอกสารนี้ไม่ได้ กรุณารักษาหน้าปัจจุบันไว้");
    }
    this.documentKey = options.documentKey;
  }

  // oxlint-disable-next-line complexity -- Validate every scope, binding, row and File at this browser-only message boundary.
  handle(
    value: unknown,
    options: UploadPocHostOptions
  ): Record<string, unknown> {
    if (
      !record(value) ||
      value.source !== "folio-upload-poc" ||
      value.bridgeId !== options.bridgeId ||
      value.documentKey !== options.documentKey ||
      value.scopeIdentity !== options.scopeIdentity ||
      typeof value.requestId !== "string" ||
      !value.requestId ||
      ![
        "pending-file-get",
        "pending-file-set",
        "pending-file-cancel",
        "pending-file-remove",
        "pending-file-check",
      ].includes(String(value.type))
    ) {
      throw new Error("การเชื่อมต่อไฟล์ในหน้านี้ไม่ตรงกับเอกสารปัจจุบัน");
    }
    this.setScope(options.scopeIdentity);
    this.bindDocument(options);
    const bindings = record(options.spreadsheetBindings)
      ? options.spreadsheetBindings
      : {};
    const table = record(bindings.table) ? bindings.table : null;
    const locations = record(bindings.locations) ? bindings.locations : {};
    const bodyValue =
      table && typeof table.anchor === "string"
        ? locations[table.anchor]
        : null;
    const body = record(bodyValue) ? bodyValue : null;
    const rowCount =
      body &&
      Number.isSafeInteger(body.firstRow) &&
      Number.isSafeInteger(body.lastRow)
        ? Number(body.lastRow) - Number(body.firstRow) + 1
        : null;
    // A changed contract cannot discard selected bytes or silently retarget a pending removal.
    for (const [key, pending] of this.files) {
      const [bindingId, rowIndex] = JSON.parse(key) as [string, number | null];
      if (
        currentBindingTag(bindings, bindingId) !== pending.tag ||
        (rowIndex !== null && (rowCount === null || rowIndex >= rowCount))
      ) {
        throw new Error("ตำแหน่งไฟล์ที่เลือกเปลี่ยนแล้ว กรุณารักษาหน้าปัจจุบันไว้");
      }
    }
    for (const [key, pending] of this.removals) {
      const [bindingId, rowIndex] = JSON.parse(key) as [string, number | null];
      if (
        currentBindingTag(bindings, bindingId) !== pending.tag ||
        (rowIndex !== null && (rowCount === null || rowIndex >= rowCount))
      ) {
        throw new Error("ตำแหน่งนำไฟล์ออกเปลี่ยนแล้ว กรุณารักษาหน้าปัจจุบันไว้");
      }
    }
    const hasPending = this.hasPending();
    if (value.type === "pending-file-check") {
      if (
        this.hasUnresolvedCommit() &&
        !["save-draft", "submit"].includes(String(value.action))
      ) {
        throw new Error(
          "ยังยืนยันผลรอบเดิมไม่ได้ กรุณากดบันทึกเพื่อตรวจผลเดิมก่อนเปลี่ยนเอกสาร"
        );
      }
      if (
        ![
          "change-project",
          "append-row",
          "delete-row",
          "save-draft",
          "submit",
          "save-template",
          "publish",
          "save-correction",
        ].includes(String(value.action)) &&
        !(
          value.action === "save-correction-workspace" &&
          options.action === "correction"
        )
      ) {
        throw new Error("คำสั่ง POC ไม่ถูกต้อง");
      }
      if (value.action === "append-row") {
        if (rowCount === null || value.rowIndex !== rowCount) {
          throw new Error("POC เพิ่มแถวได้เฉพาะท้ายตาราง เพื่อรักษาไฟล์ที่เลือกไว้");
        }
      } else if (value.action === "delete-row") {
        if (
          rowCount === null ||
          !Number.isSafeInteger(value.rowIndex) ||
          Number(value.rowIndex) < 0 ||
          Number(value.rowIndex) >= rowCount
        ) {
          throw new Error("ตำแหน่งแถวที่จะลบไม่ตรงกับตารางปัจจุบัน");
        }
        const pendingKeys = [
          ...this.files.keys(),
          ...this.removals.keys(),
          ...this.invalidFiles.keys(),
        ];
        if (
          pendingKeys.some(
            (key) =>
              (JSON.parse(key) as [string, number | null])[1] === value.rowIndex
          )
        ) {
          throw new Error(
            "แถวนี้มีไฟล์หรือการนำไฟล์ออกที่ยังไม่บันทึก กรุณาบันทึกหรือยกเลิกก่อนลบแถว"
          );
        }
      } else if (
        hasPending &&
        ![
          "save-draft",
          "submit",
          "change-project",
          "save-correction-workspace",
        ].includes(String(value.action))
      ) {
        throw new Error("มีไฟล์ค้างที่ยังไม่ได้บันทึก กรุณารักษาหน้านี้ไว้");
      }
      return {
        allowed: true,
        hasPending,
        mutationNotice: this.statusFetched
          ? this.mutationNotice
          : (options.mutationNotice ?? null),
      };
    }
    const fields = Array.isArray(bindings.fields) ? bindings.fields : [];
    const scalar = fields.find(
      (field) => record(field) && field.id === value.bindingId
    );
    const columns = table && Array.isArray(table.columns) ? table.columns : [];
    const column = columns.find(
      (field) => record(field) && field.id === value.bindingId
    );
    let field = record(scalar) ? scalar : null;
    if (!field && record(column)) {
      field = column;
    }
    const expectedTag = record(scalar)
      ? field?.key
      : `${table?.key}.${field?.key}`;
    if (
      !field ||
      field.type !== "text" ||
      field.computed === true ||
      value.tag !== expectedTag ||
      (record(scalar)
        ? value.rowIndex !== null
        : !Number.isSafeInteger(value.rowIndex) ||
          Number(value.rowIndex) < 0 ||
          Number(value.rowIndex) >= (rowCount ?? 1_048_576))
    ) {
      throw new Error("ตำแหน่งเลือกไฟล์ไม่ตรงกับช่องหรือแถวปัจจุบัน กรุณาเปิดแบบฟอร์มใหม่");
    }
    if (!record(field.attachment)) {
      return {
        error:
          "ฟอร์ม PoC เดิมไม่รองรับการแนบไฟล์ถาวร คำตอบข้อความและ URL เดิมยังใช้ตามกติกาเดิม กรุณาประสาน Admin ทำสำเนาและตั้งค่า Form ใหม่",
        unavailable: true,
      };
    }
    if (options.action === "template-edit") {
      return {
        error:
          "เลือกไฟล์ได้เฉพาะหน้ากรอก Form เท่านั้น ต้นแบบใช้สำหรับตั้งค่าช่องแนบและ Document Category ไม่อัปโหลดไฟล์",
        unavailable: true,
      };
    }
    if (options.action === "correction") {
      throw new Error("POC ยังไม่รองรับการเปลี่ยนไฟล์ระหว่างแก้ไขข้อมูลที่ส่งแล้ว");
    }
    const key = JSON.stringify([value.bindingId, value.rowIndex]);
    const slotLabel = `ช่อง ${String(value.tag)}${value.rowIndex === null ? "" : ` / แถว ${Number(value.rowIndex) + 1}`}`;
    if (
      ["pending-file-cancel", "pending-file-remove"].includes(
        String(value.type)
      )
    ) {
      this.files.delete(key);
      this.invalidFiles.delete(key);
      this.removals.delete(key);
      if (value.type === "pending-file-remove") {
        this.removals.set(key, { tag: value.tag });
      }
    }
    if (value.type === "pending-file-set") {
      if (!(value.file instanceof File) || value.file.size > 10_000_000) {
        this.invalidFiles.set(
          key,
          `${slotLabel}: กรุณาเลือกไฟล์จริงขนาดไม่เกิน 10,000,000 ไบต์ใหม่ก่อนบันทึก`
        );
        throw new Error(
          `${slotLabel}: ไฟล์ ${value.file instanceof File ? value.file.size : "ไม่ทราบ"} ไบต์ เกินขนาด 10,000,000 ไบต์หรือไม่ใช่ไฟล์จริง`
        );
      }
      this.invalidFiles.delete(key);
      this.removals.delete(key);
      this.files.set(key, { file: value.file, tag: value.tag });
    }
    const file = this.files.get(key)?.file;
    const savedData = record(options.savedData) ? options.savedData : {};
    const savedRows =
      table &&
      typeof table.key === "string" &&
      Array.isArray(savedData[table.key])
        ? savedData[table.key]
        : [];
    const saved = record(scalar)
      ? savedData[String(value.tag)]
      : ((savedRows as unknown[]).flatMap((row) => {
          if (!record(row)) {
            return [];
          }
          const attachment = row[String(field.key)];
          return record(attachment) && attachment.row_index === value.rowIndex
            ? [attachment]
            : [];
        })[0] ?? null);
    return {
      cleanupWarning: this.statusFetched
        ? this.cleanupWarning
        : (options.cleanupWarning ?? null),
      commitNotice: this.hasUnresolvedCommit()
        ? "ยังยืนยันผลบันทึก Folio รอบเดิมไม่ได้ ไฟล์อาจส่งแล้ว กรุณาตรวจผลเดิมด้วยปุ่มบันทึก ห้ามส่งไฟล์ซ้ำหรือปิดหน้านี้"
        : null,
      filename: file?.name ?? null,
      hasPending: this.hasPending(),
      mutationNotice: this.statusFetched
        ? this.mutationNotice
        : (options.mutationNotice ?? null),
      removal: this.removals.has(key),
      saved: record(saved)
        ? {
            file_link: saved.file_link,
            original_name: saved.original_name,
            size_bytes: saved.size_bytes,
          }
        : null,
      size: file?.size ?? null,
      validationError: this.invalidFiles.get(key) ?? null,
    };
  }
}
