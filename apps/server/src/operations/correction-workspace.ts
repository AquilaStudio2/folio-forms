import { OperationTargetType } from "@onlyoffice/db";
import type { Prisma } from "@onlyoffice/db";

import { fail } from "../http/errors";
import type { Operation } from "../model-types";
import type { OperationMetadata } from "./model";

/** Accepted operations may finish after expiry, but never after actor or workspace replacement. */
export const requireCorrectionWorkspace = async (
  tx: Prisma.TransactionClient,
  operation: Operation,
  metadata: OperationMetadata
) => {
  if (
    !metadata.workspaceLeaseId ||
    !metadata.workspaceDocumentKey ||
    !metadata.workspaceObjectKey ||
    !metadata.baseDocumentKey ||
    typeof metadata.baseRevision !== "number" ||
    !metadata.submissionId ||
    operation.targetType !== OperationTargetType.correction ||
    operation.targetId !== metadata.responseId ||
    operation.formId !== metadata.formId ||
    operation.responseId !== metadata.responseId ||
    operation.documentKey !== metadata.workspaceDocumentKey ||
    !operation.actorId
  ) {
    fail(
      409,
      "stale_operation",
      "The correction workspace is no longer current"
    );
  }
  const [actor, workspace] = await Promise.all([
    tx.user.findFirst({
      where: { enabled: true, id: operation.actorId, role: "admin" },
    }),
    tx.editorLease.findFirst({
      where: {
        holderUserId: operation.actorId,
        id: metadata.workspaceLeaseId,
        targetId: metadata.responseId,
        targetType: OperationTargetType.correction,
        workspaceBaseDocumentKey: metadata.baseDocumentKey,
        workspaceBaseRevision: metadata.baseRevision,
        workspaceDocumentKey: metadata.workspaceDocumentKey,
        workspaceObjectKey: metadata.workspaceObjectKey,
      },
    }),
  ]);
  if (!actor || !workspace) {
    fail(
      409,
      "stale_operation",
      "The correction workspace is no longer current"
    );
  }
  if (metadata.pdmsCatalogSessionId) {
    const catalog = await tx.pdmsProjectCatalogSession.findFirst({
      where: {
        actorId: actor.id,
        documentKey: operation.documentKey,
        formId: metadata.formId,
        id: metadata.pdmsCatalogSessionId,
        leaseId: workspace.id,
        targetId: metadata.responseId,
        targetType: "correction",
        ...(metadata.action === "save-correction" || metadata.pdmsSelection
          ? { status: "ready" }
          : {}),
      },
    });
    if (!catalog) {
      fail(409, "pdms_session_stale", "รายการโครงการเปลี่ยนระหว่างบันทึก");
    }
  }
  return workspace;
};
