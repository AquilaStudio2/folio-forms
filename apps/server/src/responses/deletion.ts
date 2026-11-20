import {
  prisma,
  Prisma,
  ResponseStatus,
  OperationStatus,
  OperationTargetType,
  HandoffStatus,
  AuditOutcome,
} from "@onlyoffice/db";

import {
  createResponseAudit,
  createResponseDeletionAudit,
} from "../audit/events";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Identity } from "../auth/identity";
import { isSerializationConflict } from "../db-errors";
import { tokenDigest } from "../digests";
import {
  deleteAttachmentCleanup,
  retireResponseAttachments,
} from "../ecm/attachments";
import type { EcmClient } from "../ecm/client";
import { lockAttachmentLedger } from "../ecm/identity";
import { fail } from "../http/errors";
import { operationMetadata } from "../operations/model";
import {
  deleteObjectUnlessCanonical,
  drainObjectCleanupIntents,
  nativeCaptureCandidateKey,
  uniqueObjectKeys,
} from "../operations/object-cleanup";

interface ResponseDeletionResult {
  alreadyDeleted: boolean;
  deleted: boolean;
  attachmentCleanup: {
    caseReference: string | null;
    state: "complete" | "pending";
    warning: string | null;
  };
}

function responseDeletionPrefixes(
  responseId: string,
  submissionIds: readonly string[],
  operationPrefixes: readonly string[]
): string[] {
  return [
    `responses/${responseId}/`,
    ...submissionIds.map((submissionId) => `submissions/${submissionId}/`),
    ...operationPrefixes,
  ];
}

function responseDeletionKeyBelongs(
  key: string,
  prefixes: readonly string[]
): boolean {
  return prefixes.some((prefix) => key.startsWith(prefix));
}
const deletionWarning =
  "ลบข้อมูลคำตอบแล้ว แต่ยังยืนยันการลบไฟล์แนบไม่ครบ URL อาจยังเปิดได้ กรุณาติดต่อผู้ดูแล ห้ามส่งคำขอลบเดิมซ้ำ รหัสติดตาม";
async function deletionAttachmentOutcome(
  caseReference: string,
  warning = deletionWarning
): Promise<ResponseDeletionResult["attachmentCleanup"]> {
  const pending = await prisma.ecmAttachmentCleanup.count({
    where: {
      deletionCaseId: caseReference,
      state: { in: ["pending", "claimed", "started", "unknown"] },
    },
  });
  return {
    caseReference,
    state: pending ? "pending" : "complete",
    warning: pending ? `${warning} ${caseReference}` : null,
  };
}
export async function responseDeletionWarnings(
  ownerUserId: string
): Promise<ResponseDeletionResult["attachmentCleanup"][]> {
  const cases = await prisma.deletionTombstone.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true },
    where: { ownerUserId },
  });
  const pending = await prisma.ecmAttachmentCleanup.findMany({
    distinct: ["deletionCaseId"],
    select: { deletionCaseId: true },
    where: {
      deletionCaseId: { in: cases.map((item) => item.id) },
      state: { in: ["pending", "claimed", "started", "unknown"] },
    },
  });
  return pending.flatMap(({ deletionCaseId }) =>
    deletionCaseId
      ? [
          {
            caseReference: deletionCaseId,
            state: "pending",
            warning: `${deletionWarning} ${deletionCaseId}`,
          },
        ]
      : []
  );
}

export async function deleteResponseData({
  actor,
  intent,
  ecm,
  removeObject,
  responseId,
}: {
  actor: Identity;
  intent: "confirmed-admin-delete" | "discard-own-draft";
  ecm: EcmClient;
  removeObject: (key: string) => Promise<void>;
  responseId: string;
}): Promise<ResponseDeletionResult> {
  const confirmedAdminDelete = intent === "confirmed-admin-delete";
  if (confirmedAdminDelete && actor.role !== "admin") {
    fail(403, "forbidden", "Administrator access is required");
  }
  const emptyCleanup: ResponseDeletionResult["attachmentCleanup"] = {
    caseReference: null,
    state: "complete",
    warning: null,
  };
  const responseLookupDigest = tokenDigest(responseId);
  const existingTombstone = await prisma.deletionTombstone.findUnique({
    where: { responseLookupDigest },
  });
  if (existingTombstone) {
    if (!confirmedAdminDelete && existingTombstone.ownerUserId !== actor.id) {
      fail(403, "forbidden", "You may only discard your own Draft");
    }
    await drainObjectCleanupIntents(
      undefined,
      responseLookupDigest,
      removeObject
    );
    const remaining = await prisma.objectCleanupIntent.count({
      where: { deletionResponseLookupDigest: responseLookupDigest },
    });
    if (remaining > 0) {
      fail(503, "deletion_cleanup_failed", "Response objects remain");
    }
    return {
      alreadyDeleted: true,
      attachmentCleanup: await deletionAttachmentOutcome(existingTombstone.id),
      deleted: true,
    };
  }
  const deletion = prisma.$transaction(
    async (tx) => {
      await lockAttachmentLedger(tx);
      // Admission locks Form before editor lease; deletion uses the same outer fence.
      const scope = await tx.response.findUnique({
        select: { formId: true },
        where: { id: responseId },
      });
      if (scope) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "forms" WHERE "id" = ${scope.formId}::uuid FOR UPDATE`
        );
      }
      const [lockedResponse] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT "id"
          FROM "responses"
          WHERE "id" = ${responseId}::uuid
          FOR UPDATE
        `
      );
      if (!lockedResponse) {
        if (!confirmedAdminDelete) {
          return {
            alreadyDeleted: false,
            attachmentCleanup: emptyCleanup,
            deleted: false,
            deletionCaseId: null,
            initial: [],
          };
        }
        fail(404, "not_found", "Response was not found");
      }
      const response = await tx.response.findUnique({
        include: {
          corrections: { orderBy: { revision: "asc" } },
          submissions: true,
        },
        where: { id: responseId },
      });
      if (!response) {
        if (!confirmedAdminDelete) {
          return {
            alreadyDeleted: false,
            attachmentCleanup: emptyCleanup,
            deleted: false,
            deletionCaseId: null,
            initial: [],
          };
        }
        fail(404, "not_found", "Response was not found");
      }
      if (!confirmedAdminDelete && response.userId !== actor.id) {
        fail(403, "forbidden", "You may only delete your own Draft");
      }
      if (!confirmedAdminDelete && response.status !== ResponseStatus.draft) {
        fail(409, "draft_unavailable", "Only a Draft can be discarded");
      }
      if (!confirmedAdminDelete && response.submissions.length > 0) {
        fail(
          409,
          "draft_has_history",
          "A Draft with Submission history cannot be discarded"
        );
      }
      const operations = await tx.operation.findMany({
        select: {
          documentKey: true,
          id: true,
          metadata: true,
          stagingObjectKey: true,
          status: true,
        },
        where: {
          OR: [
            { responseId: response.id },
            ...(response.submissions.length > 0
              ? [
                  {
                    submissionId: {
                      in: response.submissions.map(
                        (submission) => submission.id
                      ),
                    },
                  },
                ]
              : []),
            ...(response.corrections.length > 0
              ? [
                  {
                    correctionId: {
                      in: response.corrections.map(
                        (correction) => correction.id
                      ),
                    },
                  },
                ]
              : []),
          ],
        },
      });
      if (
        operations.some(
          (operation) =>
            operation.status === OperationStatus.pending ||
            operation.status === OperationStatus.processing
        )
      ) {
        fail(409, "operation_in_progress", "The Response operation is active");
      }
      const correctionIds = response.corrections.map(
        (correction) => correction.id
      );
      const leases = await tx.editorLease.findMany({
        select: {
          id: true,
          workspaceBaseDocumentKey: true,
          workspaceBaseRevision: true,
          workspaceDocumentKey: true,
          workspaceObjectKey: true,
        },
        where: {
          OR: [
            {
              targetId: response.id,
              targetType: OperationTargetType.response,
            },
            {
              targetId: response.id,
              targetType: OperationTargetType.correction,
            },
          ],
        },
      });
      if (leases.length > 0 && confirmedAdminDelete) {
        fail(409, "editor_in_use", "The Response is open in an editor");
      }
      const deletionCaseId = crypto.randomUUID();
      const attachments = await retireResponseAttachments(
        tx,
        response.id,
        response.formId,
        deletionCaseId
      );

      const candidateKeys = [
        response.draftObjectKey,
        ...response.submissions.map((submission) => submission.objectKey),
        ...response.corrections.map((correction) => correction.objectKey),
        ...leases.map((lease) => lease.workspaceObjectKey),
        ...operations.flatMap((operation) => {
          const metadata = operationMetadata(operation.metadata);
          return [
            operation.stagingObjectKey,
            metadata.finalObjectKey,
            metadata.stagedObjectKey,
            nativeCaptureCandidateKey(operation),
            ...(metadata.cleanupObjectKeys ?? []),
            metadata.workspaceObjectKey,
          ];
        }),
      ];
      const linkedObjectPrefixes = [
        ...new Set(
          uniqueObjectKeys(candidateKeys).flatMap((key) => {
            const [scope, pathId] = key.split("/", 3);
            return (scope === "operations" || scope === "submissions") && pathId
              ? [`${scope}/${pathId}/`]
              : [];
          })
        ),
      ];
      const prefixes = responseDeletionPrefixes(
        response.id,
        response.submissions.map((submission) => submission.id),
        linkedObjectPrefixes
      );
      for (const key of uniqueObjectKeys(candidateKeys)) {
        if (!responseDeletionKeyBelongs(key, prefixes)) {
          fail(
            500,
            "invalid_object_key",
            "Response object ownership is invalid"
          );
        }
      }
      const cleanupIntents = await tx.objectCleanupIntent.findMany({
        select: { objectKey: true },
        where: {
          OR: prefixes.map((prefix) => ({
            objectKey: { startsWith: prefix },
          })),
        },
      });
      const objectKeys = uniqueObjectKeys([
        ...candidateKeys,
        ...cleanupIntents.map((intent) => intent.objectKey),
      ]);
      for (const objectKeyValue of objectKeys) {
        await tx.objectCleanupIntent.upsert({
          create: {
            deletionOwnerUserId: response.userId,
            deletionResponseLookupDigest: responseLookupDigest,
            objectKey: objectKeyValue,
          },
          update: {
            cleanupAfter: new Date(),
            deletionOwnerUserId: response.userId,
            deletionResponseLookupDigest: responseLookupDigest,
          },
          where: { objectKey: objectKeyValue },
        });
      }

      const handoffs = await tx.handoff.findMany({
        select: { id: true },
        where: {
          OR: [
            { responseId: response.id },
            ...(response.externalReferenceDigest
              ? [
                  {
                    externalReferenceDigest: response.externalReferenceDigest,
                  },
                ]
              : []),
          ],
        },
      });
      if (handoffs.length > 0) {
        const handoffIds = handoffs.map((handoff) => handoff.id);
        await tx.pendingClaim.deleteMany({
          where: { handoffId: { in: handoffIds } },
        });
        await tx.handoff.updateMany({
          data: {
            codeDigest: null,
            configurationHash: null,
            consumedAt: null,
            deletionResponseLookupDigest: responseLookupDigest,
            filteredValues: Prisma.JsonNull,
            formId: null,
            normalizedEmail: null,
            reservedAt: null,
            responseId: null,
            status: HandoffStatus.deleted,
          },
          where: { id: { in: handoffIds } },
        });
      }
      await tx.editorLease.deleteMany({
        where: {
          OR: [
            {
              targetId: response.id,
              targetType: OperationTargetType.response,
            },
            {
              targetId: response.id,
              targetType: OperationTargetType.correction,
            },
          ],
        },
      });
      await tx.operation.deleteMany({
        where: {
          OR: [
            { responseId: response.id },
            ...(response.submissions.length > 0
              ? [
                  {
                    submissionId: {
                      in: response.submissions.map(
                        (submission) => submission.id
                      ),
                    },
                  },
                ]
              : []),
            ...(correctionIds.length > 0
              ? [{ correctionId: { in: correctionIds } }]
              : []),
          ],
        },
      });
      if (confirmedAdminDelete) {
        await tx.session.deleteMany({ where: { userId: response.userId } });
      }
      await tx.correction.deleteMany({ where: { responseId: response.id } });
      await tx.submission.deleteMany({ where: { responseId: response.id } });
      await tx.prefillSnapshot.deleteMany({
        where: { responseId: response.id },
      });
      await tx.response.delete({ where: { id: response.id } });
      await tx.deletionTombstone.create({
        data: {
          actorId: actor.id,
          attachmentContext: {
            ...attachments.context,
            operations: operations.map((operation) => ({
              documentKey: operation.documentKey,
              id: operation.id,
              status: operation.status,
            })),
            workspaces: leases,
          },
          externalReferenceDigest: response.externalReferenceDigest,
          id: deletionCaseId,
          outcome: AuditOutcome.success,
          ownerUserId: response.userId,
          responseLookupDigest,
        },
      });
      await createResponseDeletionAudit({
        action: "delete_response_pending",
        actorId: actor.id,
        outcome: AuditOutcome.success,
        targetId: response.id,
        tx,
      });
      return {
        alreadyDeleted: false,
        attachmentCleanup: emptyCleanup,
        deleted: true,
        deletionCaseId,
        initial: attachments.initial,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  const result = await deletion.catch((error: unknown) => {
    // Only the aborted database phase is translated: no provider or object DELETE
    // has been dispatched. Post-commit cleanup failures retain their own outcome.
    if (isSerializationConflict(error)) {
      fail(
        409,
        "operation_in_progress",
        "Another response operation changed the data. Review the Response before explicitly requesting deletion again."
      );
    }
    throw error;
  });
  if (!result.deleted || !result.deletionCaseId) {
    return result;
  }
  for (const cleanup of result.initial) {
    try {
      await deleteAttachmentCleanup(
        cleanup.operationId,
        cleanup.versionId,
        ecm
      );
    } catch {
      // Rows stay deleted; existing durable cleanup evidence retains the incomplete outcome.
    }
  }
  await drainObjectCleanupIntents(
    undefined,
    responseLookupDigest,
    removeObject
  );
  const remaining = await prisma.objectCleanupIntent.count({
    where: { deletionResponseLookupDigest: responseLookupDigest },
  });
  if (remaining > 0) {
    fail(503, "deletion_cleanup_failed", "Response objects remain");
  }
  await createResponseDeletionAudit({
    actorId: actor.id,
    outcome: AuditOutcome.success,
    targetId: responseId,
  });
  return {
    ...result,
    attachmentCleanup: await deletionAttachmentOutcome(result.deletionCaseId),
  };
}

export async function deleteSubmissionData({
  actor,
  ecm,
  removeObject,
  submissionId,
}: {
  actor: Identity;
  ecm: EcmClient;
  removeObject: (key: string) => Promise<void>;
  submissionId: string;
}): Promise<Pick<ResponseDeletionResult, "attachmentCleanup" | "deleted">> {
  if (actor.role !== "admin") {
    fail(403, "forbidden", "Administrator access is required");
  }
  const deletionCaseId = crypto.randomUUID();
  const deletion = prisma.$transaction(
    async (tx) => {
      await lockAttachmentLedger(tx);
      const scope = await tx.submission.findUnique({
        select: { formId: true, responseId: true },
        where: { id: submissionId },
      });
      if (!scope) {
        fail(404, "not_found", "Submission was not found");
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "forms" WHERE "id" = ${scope.formId}::uuid FOR UPDATE`
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "responses" WHERE "id" = ${scope.responseId}::uuid FOR UPDATE`
      );
      const [locked] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT "id"
          FROM "submissions"
          WHERE "id" = ${submissionId}::uuid
          FOR UPDATE
        `
      );
      if (!locked) {
        fail(404, "not_found", "Submission was not found");
      }
      const submission = await tx.submission.findUnique({
        include: { corrections: true },
        where: { id: submissionId },
      });
      if (!submission) {
        fail(404, "not_found", "Submission was not found");
      }
      const siblingCount = await tx.submission.count({
        where: { responseId: submission.responseId },
      });
      if (siblingCount <= 1) {
        fail(
          409,
          "only_submission",
          "This is the only Submission for its Response; delete the Response instead"
        );
      }
      const correctionIds = submission.corrections.map(
        (correction) => correction.id
      );
      const snapshotIds = [
        submission.documentKey,
        ...submission.corrections.map(({ documentKey }) => documentKey),
      ];
      const operationsWhere = {
        OR: [
          { submissionId: submission.id },
          ...(correctionIds.length > 0
            ? [{ correctionId: { in: correctionIds } }]
            : []),
        ],
      };
      const [operations, activeOperation] = await Promise.all([
        tx.operation.findMany({ select: { id: true }, where: operationsWhere }),
        tx.operation.findFirst({
          select: { id: true },
          where: {
            OR: [...operationsWhere.OR, { documentKey: { in: snapshotIds } }],
            status: {
              in: [OperationStatus.pending, OperationStatus.processing],
            },
          },
        }),
      ]);
      if (activeOperation) {
        fail(
          409,
          "operation_in_progress",
          "The Submission operation is active"
        );
      }
      const activeLease = await tx.editorLease.findFirst({
        select: { id: true },
        where: {
          OR: [
            { workspaceBaseDocumentKey: { in: snapshotIds } },
            { workspaceDocumentKey: { in: snapshotIds } },
            {
              targetId: submission.responseId,
              targetType: OperationTargetType.correction,
              workspaceBaseDocumentKey: null,
            },
          ],
        },
      });
      if (activeLease) {
        fail(409, "editor_in_use", "The Response is open in an editor");
      }
      await tx.operation.deleteMany({ where: operationsWhere });
      await tx.correction.deleteMany({
        where: { submissionId: submission.id },
      });
      await tx.submission.delete({ where: { id: submission.id } });
      const [drafts, siblings, corrections] = await Promise.all([
        tx.response.findMany({
          select: { draftDocumentKey: true },
          where: { draftDocumentKey: { in: snapshotIds } },
        }),
        tx.submission.findMany({
          select: { documentKey: true },
          where: { documentKey: { in: snapshotIds } },
        }),
        tx.correction.findMany({
          select: { documentKey: true },
          where: { documentKey: { in: snapshotIds } },
        }),
      ]);
      const retainedSnapshots = new Set([
        ...drafts.map(({ draftDocumentKey }) => draftDocumentKey),
        ...siblings.map(({ documentKey }) => documentKey),
        ...corrections.map(({ documentKey }) => documentKey),
      ]);
      const { initial } = await retireResponseAttachments(
        tx,
        submission.responseId,
        submission.formId,
        deletionCaseId,
        {
          operationIds: operations.map(({ id }) => id),
          snapshotIds: snapshotIds.filter((id) => !retainedSnapshots.has(id)),
        }
      );
      return {
        initial,
        objectKeys: uniqueObjectKeys([
          submission.objectKey,
          ...submission.corrections.map((correction) => correction.objectKey),
        ]),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  const { initial, objectKeys } = await deletion.catch((error: unknown) => {
    if (isSerializationConflict(error)) {
      fail(
        409,
        "operation_in_progress",
        "The Submission changed before deletion"
      );
    }
    throw error;
  });
  for (const cleanup of initial) {
    try {
      await deleteAttachmentCleanup(
        cleanup.operationId,
        cleanup.versionId,
        ecm
      );
    } catch {
      // The committed deletion and durable cleanup evidence survive provider failure.
    }
  }
  await Promise.all(
    objectKeys.map((key) => deleteObjectUnlessCanonical(key, removeObject))
  );
  await createResponseAudit({
    action: "delete_submission",
    actorId: actor.id,
    outcome: AuditOutcome.success,
    safeMetadata: { state: "submitted" },
    targetId: submissionId,
    targetType: "submission",
  });
  return {
    attachmentCleanup: await deletionAttachmentOutcome(
      deletionCaseId,
      "ลบ Submission แล้ว แต่ยังยืนยันการลบไฟล์แนบไม่ครบ URL อาจยังเปิดได้ กรุณาติดต่อผู้ดูแล ห้ามส่งคำขอลบเดิมซ้ำ รหัสติดตาม"
    ),
    deleted: true,
  };
}
