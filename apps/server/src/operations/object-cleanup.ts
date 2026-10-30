import { prisma, OperationStatus } from "@onlyoffice/db";

import type { Operation } from "../model-types";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import { deleteObject, objectExists } from "../storage";
import { operationMetadata } from "./model";

export const objectCleanupIntentGraceMs = 15 * 60_000;

/** Only server-created captures beside this operation's own staging object are recoverable. */
export function nativeCaptureKey(
  operation: Pick<Operation, "metadata" | "stagingObjectKey">
): string | null {
  const metadata = operationMetadata(operation.metadata);
  return operation.stagingObjectKey &&
    typeof metadata.pdmsCatalogSessionId === "string" &&
    metadata.nativeCaptureObjectKey === `${operation.stagingObjectKey}.native`
    ? metadata.nativeCaptureObjectKey
    : null;
}

/** Keep the latest failed capture only while its exact target revision remains current. */
export async function cleanupNativeCaptures(
  operation: Pick<
    Operation,
    "documentKey" | "formId" | "targetId" | "targetType"
  >
): Promise<void> {
  if (!operation.documentKey) {
    return;
  }
  const attempts = await prisma.operation.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    where: {
      documentKey: operation.documentKey,
      formId: operation.formId,
      targetId: operation.targetId,
      targetType: operation.targetType,
    },
  });
  if (!attempts.some((attempt) => nativeCaptureKey(attempt))) {
    return;
  }
  const current =
    operation.targetType === "template_draft"
      ? await prisma.templateDraft.findFirst({
          where: { documentKey: operation.documentKey, id: operation.targetId },
        })
      : operation.targetType === "response"
        ? await prisma.response.findFirst({
            where: {
              draftDocumentKey: operation.documentKey,
              id: operation.targetId,
            },
          })
        : operation.targetType === "correction"
          ? await prisma.editorLease.findFirst({
              where: {
                targetId: operation.targetId,
                targetType: "correction",
                workspaceDocumentKey: operation.documentKey,
              },
            })
          : null;
  const [latest] = attempts;
  if (
    current &&
    (latest?.status === OperationStatus.pending ||
      latest?.status === OperationStatus.processing)
  ) {
    // An in-flight retry may still need the previous failed attempt's capture.
    return;
  }
  const retained =
    current && latest?.status === OperationStatus.failed
      ? nativeCaptureKey(latest)
      : null;
  await Promise.all(
    attempts
      .map(nativeCaptureKey)
      .filter((key): key is string => Boolean(key) && key !== retained)
      .map((key) => deleteObjectUnlessCanonical(key))
  );
}

export function uniqueObjectKeys(
  keys: readonly (string | null | undefined)[]
): string[] {
  return [
    ...new Set(
      keys.filter(
        (key): key is string => typeof key === "string" && key.length > 0
      )
    ),
  ];
}

export async function deleteObjects(
  keys: readonly (string | null | undefined)[]
): Promise<void> {
  const uniqueKeys = uniqueObjectKeys(keys);
  await Promise.all(
    uniqueKeys.map(async (key) => {
      try {
        await deleteObject(key);
      } catch (error) {
        console.error(`Could not remove object ${key}`, error);
      }
    })
  );
}

export async function drainObjectCleanupIntents(
  objectKeys?: readonly string[],
  deletionResponseLookupDigest?: string,
  removeObject: (key: string) => Promise<void> = deleteObject
): Promise<void> {
  const cleanupAfter = new Date();
  const intents = await prisma.objectCleanupIntent.findMany({
    orderBy: { createdAt: "asc" },
    where: {
      cleanupAfter: { lte: cleanupAfter },
      ...(deletionResponseLookupDigest ? { deletionResponseLookupDigest } : {}),
      ...(objectKeys ? { objectKey: { in: [...objectKeys] } } : {}),
    },
  });
  for (const intent of intents) {
    if (!(await deleteObjectUnlessCanonical(intent.objectKey, removeObject))) {
      continue;
    }
    await prisma.objectCleanupIntent.deleteMany({
      where: { id: intent.id, objectKey: intent.objectKey },
    });
  }
}

export async function deleteObjectUnlessCanonical(
  key: string,
  removeObject: (key: string) => Promise<void> = deleteObject
): Promise<boolean> {
  try {
    const references = await Promise.all([
      prisma.templateDraft.findFirst({
        select: { id: true },
        where: { objectKey: key },
      }),
      prisma.publishedTemplate.findFirst({
        select: { id: true },
        where: { objectKey: key },
      }),
      prisma.response.findFirst({
        select: { id: true },
        where: { draftObjectKey: key },
      }),
      prisma.submission.findFirst({
        select: { id: true },
        where: { objectKey: key },
      }),
      prisma.correction.findFirst({
        select: { id: true },
        where: { objectKey: key },
      }),
      prisma.editorLease.findFirst({
        select: { id: true },
        where: { workspaceObjectKey: key },
      }),
    ]);
    if (references.some((reference) => reference !== null)) {
      return false;
    }
    await removeObject(key);
    return !(await objectExists(key));
  } catch (error) {
    console.error(`Could not verify whether object ${key} is canonical`, error);
    return false;
  }
}

export async function cleanupTerminalOperationObjects(
  operation: Operation
): Promise<void> {
  if (
    operation.status !== OperationStatus.completed &&
    operation.status !== OperationStatus.failed
  ) {
    return;
  }
  const metadata = operationMetadata(operation.metadata);
  await cleanupNativeCaptures(operation);
  if (operation.status === OperationStatus.completed) {
    const keys = metadata.cleanupObjectKeys ?? [metadata.stagedObjectKey];
    await (metadata.action === "save-correction" ||
    metadata.action === "save-correction-workspace"
      ? Promise.all(keys.map((key) => deleteObjectUnlessCanonical(key)))
      : deleteObjects(keys));
    return;
  }
  await deleteObjects([metadata.stagedObjectKey]);
  await deleteObjectUnlessCanonical(metadata.finalObjectKey);
  if (
    (metadata.action === "save-correction" ||
      metadata.action === "save-correction-workspace") &&
    metadata.workspaceDocumentKey
  ) {
    const workspaceLease = await prisma.editorLease.findUnique({
      select: { workspaceObjectKey: true },
      where: { workspaceDocumentKey: metadata.workspaceDocumentKey },
    });
    if (!workspaceLease && metadata.workspaceObjectKey) {
      await deleteObjectUnlessCanonical(metadata.workspaceObjectKey);
    }
  }
}
