import { prisma, Prisma } from "@onlyoffice/db";
import type { FillMethod } from "@onlyoffice/db";
import { z } from "zod";

import type { SpreadsheetBindings } from "../documents/spreadsheets/contract";
import {
  cancelAttachmentBatch,
  cleanupCommittedAttachments,
  requireAttachmentMutationReady,
  uploadAttachments,
} from "../ecm/attachments";
import type { EcmClient } from "../ecm/client";
import type { ActionEditorAuthorization } from "../editor/authorization";
import {
  operationEditorCapability,
  requireEditorScope,
  requireDocumentServerKey,
} from "../editor/authorization";
import {
  editorLeaseBridge,
  lockActiveEditorLease,
  requireActiveEditorLease,
} from "../editor/leases";
import { fail, HttpError } from "../http/errors";
import { requiredString } from "../http/input";
import type { JsonRecord, Operation } from "../model-types";
import type { OnlyOfficeClient } from "../onlyoffice";
import { finalizeCallback } from "../operations/callback";
import { createOperation } from "../operations/create";
import { updateOperationFailed } from "../operations/lifecycle";
import type { OperationMetadata } from "../operations/model";
import { operationTypeForAction } from "../operations/model";
import { objectKey } from "../storage";
import { attachmentSlotKey } from "./attachment-data";

const checkpoint = (input: JsonRecord): string => {
  const result = z.uuid().safeParse(input.checkpoint);
  if (!result.success) {
    fail(
      400,
      "invalid_attachment_checkpoint",
      "ไม่พบจุดตรวจสอบรอบบันทึก กรุณาเก็บหน้านี้ไว้แล้วลองอีกครั้ง"
    );
  }
  return result.data;
};
const scopeFor = (
  formId: string,
  responseId: string,
  documentKey: string,
  targetType: "response" | "correction" = "response"
) => ({ documentKey, formId, targetId: responseId, targetType });
export const attachmentOperationAction = (
  operation: Pick<Operation, "type">
): "save-draft" | "submit" | "save-correction" => {
  if (operation.type === "save_draft") {
    return "save-draft";
  }
  if (operation.type === "submit_response") {
    return "submit";
  }
  if (operation.type === "save_correction") {
    return "save-correction";
  }
  return fail(
    500,
    "invalid_attachment_operation",
    "Attachment operation has an invalid action"
  );
};
const envelope = (
  authorization: ActionEditorAuthorization,
  operation: Operation
) => {
  const { documentKey } = operation;
  if (!documentKey) {
    fail(500, "invalid_operation", "Attachment operation has no document key");
  }
  return {
    action: attachmentOperationAction(operation),
    operationCapability: operationEditorCapability(
      authorization.actor,
      scopeFor(
        operation.formId,
        operation.targetId,
        documentKey,
        operation.targetType === "correction" ? "correction" : "response"
      ),
      operation.id
    ),
    operationId: operation.id,
    responseId: operation.responseId,
    status: operation.status,
  };
};
export const replayAttachmentOperation = async (
  authorization: ActionEditorAuthorization,
  input: JsonRecord,
  formId: string,
  responseId: string,
  action: "save-draft" | "submit" | "save-correction"
) => {
  if (input.checkpoint === undefined) {
    return null;
  }
  const batch = await prisma.ecmAttachmentBatch.findUnique({
    where: {
      responseId_actorId_checkpoint: {
        actorId: authorization.actor.id,
        checkpoint: checkpoint(input),
        responseId,
      },
    },
  });
  if (!batch) {
    return null;
  }
  requireEditorScope(authorization, {
    ...scopeFor(
      formId,
      responseId,
      batch.documentKey,
      action === "save-correction" ? "correction" : "response"
    ),
    action,
  });
  const operation = await prisma.operation.findUniqueOrThrow({
    where: { id: batch.operationId },
  });
  if (
    operation.documentKey !== input.documentKey ||
    operation.type !== operationTypeForAction[action] ||
    operation.formId !== formId ||
    batch.leaseId !== authorization.capability.leaseId
  ) {
    fail(409, "attachment_checkpoint_conflict", "จุดตรวจสอบไม่ตรงกับการบันทึกเดิม");
  }
  return envelope(authorization, operation);
};
/** Absence is settled only while holding the same admission locks as the original sender. */
export const recoverAttachmentAdmission = (
  authorization: ActionEditorAuthorization,
  responseId: string,
  acceptedCheckpoint: string,
  input: JsonRecord
) => {
  const request = z
    .object({
      action: z.enum(["save-draft", "submit", "save-correction"]),
      documentKey: z.string().min(1),
    })
    .strict()
    .parse(input);
  const scope = scopeFor(
    authorization.capability.formId,
    responseId,
    request.documentKey,
    request.action === "save-correction" ? "correction" : "response"
  );
  requireEditorScope(authorization, { ...scope, action: request.action });
  const revokedLeaseId = authorization.capability.leaseId;
  if (!revokedLeaseId) {
    fail(409, "editor_lease_inactive", "The editor lease is no longer active");
  }
  return prisma.$transaction(async (tx) => {
    const [form] = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "forms" WHERE "id" = ${scope.formId}::uuid FOR UPDATE`
    );
    if (!form) {
      fail(404, "not_found", "Form was not found");
    }
    const response = await tx.response.findFirst({
      where: {
        formId: scope.formId,
        id: responseId,
        ...(request.action === "save-correction"
          ? { status: "submitted" }
          : { userId: authorization.actor.id }),
      },
    });
    if (!response) {
      fail(404, "not_found", "Response was not found");
    }
    const batch = await tx.ecmAttachmentBatch.findUnique({
      where: {
        responseId_actorId_checkpoint: {
          actorId: authorization.actor.id,
          checkpoint: acceptedCheckpoint,
          responseId,
        },
      },
    });
    if (batch) {
      const operation = await tx.operation.findUniqueOrThrow({
        where: { id: batch.operationId },
      });
      if (
        batch.documentKey !== request.documentKey ||
        operation.formId !== scope.formId ||
        operation.type !== operationTypeForAction[request.action]
      ) {
        fail(
          409,
          "attachment_checkpoint_conflict",
          "จุดตรวจสอบไม่ตรงกับการบันทึกเดิม"
        );
      }
      return { ...envelope(authorization, operation), batchState: batch.state };
    }
    await lockActiveEditorLease(tx, authorization, scope);
    const active = await tx.operation.findFirst({
      select: { id: true },
      where: {
        status: { in: ["pending", "processing"] },
        targetId: responseId,
        targetType: scope.targetType,
      },
    });
    if (active) {
      fail(
        409,
        "operation_in_progress",
        "Another document operation is already in progress"
      );
    }
    await requireAttachmentMutationReady(responseId, tx);
    if (
      request.action === "save-correction"
        ? authorization.actor.role !== "admin" ||
          response.status !== "submitted" ||
          !(await tx.editorLease.findFirst({
            where: {
              holderUserId: authorization.actor.id,
              id: revokedLeaseId,
              targetId: responseId,
              targetType: "correction",
              workspaceDocumentKey: request.documentKey,
            },
          }))
        : response.status !== "draft" ||
          response.draftDocumentKey !== request.documentKey
    ) {
      fail(409, "stale_document", "เอกสารเปลี่ยนแล้ว กรุณารักษาข้อมูลในตัวแก้ไขไว้");
    }
    // createOperation rechecks this original UUID under our form→lease lock before durable admission.
    const lease = await tx.editorLease.update({
      data: { id: crypto.randomUUID() },
      where: { id: revokedLeaseId },
    });
    return {
      admission: "not-admitted" as const,
      lease: editorLeaseBridge(lease),
      revokedLeaseId,
    };
  });
};

export const startAttachmentOperation = async (options: {
  authorization: ActionEditorAuthorization;
  input: JsonRecord;
  action: "save-draft" | "submit" | "save-correction";
  form: { id: string; publicId: string; fillMethod: FillMethod };
  responseId: string;
  bindings: SpreadsheetBindings;
  files: ReadonlyMap<string, File>;
  onlyOffice: OnlyOfficeClient;
  ecm: EcmClient;
  pdmsContext: Partial<OperationMetadata>;
  correctionMetadata?: OperationMetadata;
}) => {
  const {
    authorization,
    input,
    form,
    action,
    responseId,
    files,
    onlyOffice,
    ecm,
  } = options;
  const documentKey = requiredString(input, "documentKey");
  const scope = scopeFor(
    form.id,
    responseId,
    documentKey,
    action === "save-correction" ? "correction" : "response"
  );
  requireEditorScope(authorization, { ...scope, action });
  await requireActiveEditorLease(authorization, scope);
  await requireAttachmentMutationReady(responseId);
  const acceptedCheckpoint = checkpoint(input);
  const documentServerKey = requireDocumentServerKey(authorization);
  // Capture is the same signed native snapshot download used by Excel Fill Download, never a client answer JSON.
  const snapshot = await onlyOffice.downloadEditorWorkbook({
    documentServerKey,
    signal: AbortSignal.timeout(30_000),
    snapshotUrl: requiredString(input, "snapshotUrl"),
  });
  const id = crypto.randomUUID();
  const submissionId = action === "submit" ? crypto.randomUUID() : undefined;
  const metadata: OperationMetadata = {
    ...options.pdmsContext,
    action,
    data: {},
    documentKind: "xlsx",
    finalObjectKey: objectKey(
      action === "submit" ? "submissions" : "responses",
      submissionId ?? responseId,
      "filled",
      crypto.randomUUID(),
      "xlsx"
    ),
    formId: form.id,
    nextDocumentKey: `response-${responseId}-${crypto.randomUUID()}`,
    publicId: form.publicId,
    responseId,
    stagedObjectKey: objectKey(
      "operations",
      id,
      "attachment",
      crypto.randomUUID(),
      "xlsx"
    ),
    ...(submissionId
      ? {
          submissionDocumentKey: `submission-${submissionId}-${crypto.randomUUID()}`,
          submissionId,
        }
      : {}),
    ...options.correctionMetadata,
  };
  let operation: Operation;
  try {
    operation = await createOperation({
      actorId: authorization.actor.id,
      attachmentCheckpoint: acceptedCheckpoint,
      authorization,
      capabilityScope: scope,
      documentKey,
      expectedFillMethod: form.fillMethod,
      formId: form.id,
      metadata,
      ownerUserId: authorization.actor.id,
      responseId,
      stagingObjectKey: metadata.stagedObjectKey,
      // Submit's planned identity is created atomically at completion; only Correction references an existing Submission.
      submissionId:
        action === "save-correction" ? metadata.submissionId : undefined,
      targetId: responseId,
      targetType: scope.targetType,
      type: operationTypeForAction[action],
    });
  } catch (error) {
    const original = await replayAttachmentOperation(
      authorization,
      input,
      form.id,
      responseId,
      action
    );
    if (original) {
      return original;
    }
    throw error;
  }
  const run = async () => {
    // Heartbeats cover native processing and sequential 90-second uploads, not auth's independent budget.
    const heartbeat = setInterval(async () => {
      try {
        await prisma.operation.updateMany({
          data: { updatedAt: new Date() },
          where: {
            id: operation.id,
            status: { in: ["pending", "processing"] },
          },
        });
      } catch {
        // Heartbeats are best-effort; the sender must still retain late receipts and its durable mutation fence.
      }
    }, 15_000);
    try {
      await finalizeCallback(
        operation.id,
        { key: documentServerKey },
        snapshot,
        new Set(),
        undefined,
        (contract, savedData, workbook) =>
          uploadAttachments({
            contract,
            ecm,
            files,
            operation,
            removals: new Set(
              z
                .array(
                  z
                    .object({
                      bindingId: z.string(),
                      rowIndex: z.number().int().nonnegative().nullable(),
                    })
                    .strict()
                )
                .parse(input.attachmentRemovals ?? [])
                .map((removal) =>
                  attachmentSlotKey(removal.bindingId, removal.rowIndex)
                )
            ),
            savedData,
            workbook,
          })
      );
      await cleanupCommittedAttachments(operation.id, ecm);
    } catch (error) {
      // A lost commit acknowledgement must be resolved from this original Operation before deleting any provider file.
      const persisted = await prisma.operation.findUnique({
        where: { id: operation.id },
      });
      if (persisted?.status === "completed") {
        return;
      }
      await cancelAttachmentBatch(operation.id, ecm);
      const batch = await prisma.ecmAttachmentBatch.findUnique({
        where: { operationId: operation.id },
      });
      let errorMessage = "แนบไฟล์ไม่สำเร็จ ข้อมูลเดิมยังอยู่ กรุณาตรวจช่องแนบหรือติดต่อผู้ดูแล";
      if (
        error instanceof HttpError ||
        (error instanceof Error && error.name === "SpreadsheetValidationError")
      ) {
        errorMessage = error.message;
      }
      if (batch && batch.state !== "canceled") {
        const detail = error instanceof HttpError ? `${error.message} ` : "";
        errorMessage = `${detail}ยังยืนยันผลไฟล์แนบหรือการลบรอบที่ยกเลิกไม่ได้ ข้อมูลเดิมยังอยู่ กรุณาติดต่อผู้ดูแลก่อนบันทึก ส่ง หรือลบคำตอบ ห้ามส่งไฟล์ซ้ำ`;
      }
      await updateOperationFailed(
        operation.id,
        "document_save_failed",
        undefined,
        { errorMessage }
      );
    } finally {
      clearInterval(heartbeat);
    }
  };
  // Bytes remain only in this accepted request task; a crashed sender cannot be retried from durable names.
  void (async function settleAcceptedSnapshot() {
    try {
      await run();
    } catch {
      // An unavailable original checkpoint cannot prove rollback: retain the durable fence, never resend or clean speculatively.
    }
  })();
  return envelope(authorization, operation);
};
