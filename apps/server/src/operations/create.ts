import type {
  DocumentKind,
  FillMethod,
  OperationTargetType,
  OperationType,
} from "@onlyoffice/db";
import { prisma, Prisma, OperationStatus } from "@onlyoffice/db";

import { databaseErrorCode } from "../db-errors";
import { requireAttachmentMutationReady } from "../ecm/attachments";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type {
  ActionEditorAuthorization,
  EditorCapabilityScope,
} from "../editor/authorization";
import { requireDocumentServerKey } from "../editor/authorization";
import { lockActiveEditorLease } from "../editor/leases";
import { fail } from "../http/errors";
import type { Operation } from "../model-types";
import { jsonValue } from "../responses/data";
import type { OperationMetadata } from "./model";
import { objectCleanupIntentGraceMs } from "./object-cleanup";

export async function createOperation(input: {
  actorId: string;
  attachmentCheckpoint?: string;
  authorization: ActionEditorAuthorization;
  capabilityScope: Omit<EditorCapabilityScope, "action" | "operationId">;
  documentKey: string;
  formId: string;
  expectedFillMethod?: FillMethod;
  metadata: OperationMetadata;
  ownerUserId: string;
  responseId?: string;
  stagingObjectKey: string;
  submissionId?: string;
  targetId: string;
  targetType: OperationTargetType;
  type: OperationType;
}): Promise<Operation> {
  try {
    return await prisma.$transaction(async (tx) => {
      const [lockedForm] = await tx.$queryRaw<
        {
          fillMethod: FillMethod;
          documentKind: DocumentKind;
          id: string;
        }[]
      >(
        Prisma.sql`
          SELECT "id", "document_kind" AS "documentKind", "fill_method" AS "fillMethod"
          FROM "forms"
          WHERE "id" = ${input.formId}::uuid
          FOR UPDATE
        `
      );
      if (!lockedForm) {
        fail(404, "not_found", "Form was not found");
      }
      if (
        input.expectedFillMethod !== undefined &&
        lockedForm.fillMethod !== input.expectedFillMethod
      ) {
        fail(409, "fill_method_changed", "The form Fill Method changed");
      }
      await lockActiveEditorLease(
        tx,
        input.authorization,
        input.capabilityScope
      );
      const candidate = input.metadata.xlsxDraft;
      if (candidate) {
        const draft = await tx.templateDraft.findFirst({
          where: {
            bindingRevision: candidate.revision,
            documentKey: input.documentKey,
            form: { publishedTemplate: null, status: { not: "published" } },
            formId: input.formId,
            id: input.targetId,
          },
        });
        if (!draft) {
          fail(
            409,
            "stale_document",
            "The saved Excel draft changed; reopen before saving"
          );
        }
        if (
          await tx.operation.findFirst({
            select: { id: true },
            where: {
              formId: input.formId,
              metadata: {
                equals: candidate.checkpoint,
                path: ["xlsxDraft", "checkpoint"],
              },
            },
          })
        ) {
          fail(
            409,
            "checkpoint_reused",
            "This Excel save checkpoint was already admitted"
          );
        }
        candidate.baseObjectKey = draft.objectKey;
        candidate.baseContentHash = draft.contentHash;
        candidate.leaseId = input.authorization.capability.leaseId;
        const lease = await tx.editorLease.findUniqueOrThrow({
          select: { holderSessionId: true },
          where: { id: candidate.leaseId },
        });
        candidate.sessionId = lease.holderSessionId;
        input.metadata.bindingRevision = draft.bindingRevision;
        await tx.objectCleanupIntent.createMany({
          data: [input.stagingObjectKey, input.metadata.finalObjectKey].map(
            (objectKey) => ({
              cleanupAfter: new Date(Date.now() + objectCleanupIntentGraceMs),
              objectKey,
            })
          ),
        });
      }
      if (
        input.metadata.action === "save-correction" ||
        input.metadata.action === "save-correction-workspace"
      ) {
        const [actor, workspace, response] = await Promise.all([
          tx.user.findFirst({
            where: { enabled: true, id: input.actorId, role: "admin" },
          }),
          tx.editorLease.findFirst({
            where: {
              holderUserId: input.actorId,
              id: input.metadata.workspaceLeaseId,
              targetId: input.targetId,
              targetType: "correction",
              workspaceBaseDocumentKey: input.metadata.baseDocumentKey,
              workspaceBaseRevision: input.metadata.baseRevision,
              workspaceDocumentKey: input.documentKey,
              workspaceObjectKey: input.metadata.workspaceObjectKey,
            },
          }),
          tx.response.findUnique({
            include: {
              submissions: {
                include: {
                  corrections: { orderBy: { revision: "desc" }, take: 1 },
                },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 1,
              },
            },
            where: { id: input.responseId },
          }),
        ]);
        const submission = response?.submissions[0];
        const latest = submission?.corrections[0];
        if (
          !actor ||
          !input.metadata.workspaceLeaseId ||
          !workspace ||
          !response ||
          response.formId !== input.formId ||
          response.status !== "submitted" ||
          !submission ||
          submission.id !== input.submissionId ||
          (latest?.revision ?? 0) !== input.metadata.baseRevision ||
          (latest?.documentKey ?? submission.documentKey) !==
            input.metadata.baseDocumentKey
        ) {
          fail(409, "stale_document", "The correction workspace is stale");
        }
      }
      if (input.metadata.spreadsheetSaveCheckpoint) {
        const reused = await tx.operation.findFirst({
          select: { id: true },
          where: {
            formId: input.formId,
            metadata: {
              equals: input.metadata.spreadsheetSaveCheckpoint,
              path: ["spreadsheetSaveCheckpoint"],
            },
          },
        });
        if (reused) {
          fail(
            409,
            "stale_document",
            "จุดตรวจสอบการบันทึกนี้ใช้แล้ว กรุณาลองบันทึกอีกครั้ง"
          );
        }
      }
      const activeOperation = await tx.operation.findFirst({
        select: { id: true },
        where: {
          status: { in: [OperationStatus.pending, OperationStatus.processing] },
          targetId: input.targetId,
          targetType: input.targetType,
        },
      });
      if (activeOperation) {
        fail(
          409,
          "operation_in_progress",
          "Another document operation is already in progress"
        );
      }
      if (input.responseId) {
        await requireAttachmentMutationReady(input.responseId, tx);
      }
      const metadata = {
        ...input.metadata,
        documentKind: lockedForm.documentKind,
        documentServerKey:
          lockedForm.documentKind === "xlsx"
            ? requireDocumentServerKey(input.authorization)
            : undefined,
      };
      const operation = await tx.operation.create({
        data: {
          actorId: input.actorId,
          documentKey: input.documentKey,
          errorCode: null,
          formId: input.formId,
          metadata: jsonValue(metadata),
          ownerUserId: input.ownerUserId,
          responseId: input.responseId,
          stagingObjectKey: input.stagingObjectKey,
          status: OperationStatus.pending,
          submissionId: input.submissionId,
          targetId: input.targetId,
          targetType: input.targetType,
          type: input.type,
        },
      });
      if (input.attachmentCheckpoint && input.responseId) {
        const response = await tx.response.findUnique({
          where: { id: input.responseId },
        });
        const lease = await tx.editorLease.findUnique({
          where: {
            targetType_targetId: {
              targetId: input.responseId,
              targetType: input.targetType,
            },
          },
        });
        if (
          !response ||
          (input.targetType !== "correction" &&
            (response.userId !== input.actorId ||
              response.status !== "draft" ||
              response.draftDocumentKey !== input.documentKey)) ||
          !lease
        ) {
          fail(409, "stale_response", "คำตอบหรือสิทธิ์ตัวแก้ไขเปลี่ยนแล้ว");
        }
        await tx.ecmAttachmentBatch.create({
          data: {
            actorId: input.actorId,
            authSessionId: lease.holderSessionId,
            checkpoint: input.attachmentCheckpoint,
            documentKey: input.documentKey,
            formId: input.formId,
            leaseId: lease.id,
            operationId: operation.id,
            responseId: input.responseId,
          },
        });
        if (input.metadata.action === "submit") {
          await tx.response.update({
            data: { status: "submitting" },
            where: { id: input.responseId },
          });
        }
      }
      return operation;
    });
  } catch (error) {
    if (databaseErrorCode(error) === "P2002") {
      fail(
        409,
        "operation_in_progress",
        "Another document operation is already in progress"
      );
    }
    throw error;
  }
}
