// oxlint-disable no-await-in-loop -- Destination admission and alias checks run sequentially under one transaction fence.
import { Prisma } from "@onlyoffice/db";
import type { EcmAttachmentVersion } from "@onlyoffice/db";

import { fail } from "../http/errors";

// All ledger admission uses this short transaction fence; durable attempts fence external request intervals.
export const lockAttachmentLedger = async (tx: Prisma.TransactionClient) => {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(176117, 3)::text`);
};

export const identityVersionIds = async (
  tx: Prisma.TransactionClient,
  version: Pick<EcmAttachmentVersion, "id" | "identityId">
): Promise<string[]> => {
  if (!version.identityId) {
    return [version.id];
  }
  const aliases = await tx.ecmAttachmentVersion.findMany({
    select: { id: true },
    where: { identityId: version.identityId },
  });
  return aliases.map((entry) => entry.id);
};

const conflict = (): never =>
  fail(
    409,
    "attachment_destination_protected",
    "ปลายทางไฟล์ซ้ำกับข้อมูล ประวัติ หรือคำขอที่ยังยืนยันไม่ได้ ห้ามเขียนทับ กรุณาติดต่อผู้ดูแล"
  );

/** Names fence unresolved requests, not ownership of settled template resources. */
export const admitAttachmentDestination = async (
  tx: Prisma.TransactionClient,
  candidate: Pick<
    EcmAttachmentVersion,
    | "accountKey"
    | "filename"
    | "operationId"
    | "responseId"
    | "bindingId"
    | "rowIndex"
    | "id"
    | "storageMode"
  >
): Promise<string[]> => {
  await lockAttachmentLedger(tx);
  const existing = await tx.ecmAttachmentVersion.findMany({
    where: {
      accountKey: candidate.accountKey,
      filename: candidate.filename,
      id: { not: candidate.id },
      state: { notIn: ["canceled", "deleted"] },
    },
  });
  if (!existing.length) {
    return [];
  }
  const response = await tx.response.findUnique({
    where: { id: candidate.responseId },
  });
  for (const previous of existing) {
    if (
      previous.operationId === candidate.operationId &&
      ["prepared", "started", "received"].includes(previous.state)
    ) {
      continue;
    }
    if (
      candidate.storageMode === "template" &&
      previous.storageMode === "template" &&
      previous.state === "committed" &&
      previous.identityId
    ) {
      const identity = await tx.ecmAttachmentIdentity.findUniqueOrThrow({
        where: { id: previous.identityId },
      });
      if (identity.state !== "active") {
        conflict();
      }
      continue;
    }
    if (
      previous.responseId !== candidate.responseId ||
      previous.state !== "committed" ||
      !previous.identityId
    ) {
      conflict();
    }
    const identity = await tx.ecmAttachmentIdentity.findUniqueOrThrow({
      where: { id: previous.identityId ?? conflict() },
    });
    if (identity.state !== "active") {
      conflict();
    }
    const ids = await identityVersionIds(tx, previous);
    const aliases = await tx.ecmAttachmentVersion.findMany({
      where: { id: { in: ids } },
    });
    if (
      aliases.some(
        (alias) =>
          alias.responseId !== candidate.responseId ||
          !["committed", "canceled", "deleted"].includes(alias.state)
      )
    ) {
      conflict();
    }
    const references = await tx.ecmAttachmentReference.findMany({
      where: { versionId: { in: ids } },
    });
    if (
      references.some(
        (ref) =>
          ref.responseId !== candidate.responseId ||
          ref.snapshotId !== response?.draftDocumentKey
      )
    ) {
      conflict();
    }
    const keys = references.map((ref) => ref.snapshotId);
    const protectedCount =
      (await tx.submission.count({ where: { documentKey: { in: keys } } })) +
      (await tx.correction.count({ where: { documentKey: { in: keys } } })) +
      (await tx.editorLease.count({
        where: {
          OR: [
            { workspaceDocumentKey: { in: keys } },
            { workspaceBaseDocumentKey: { in: keys } },
          ],
        },
      })) +
      (await tx.operation.count({
        where: {
          documentKey: { in: keys },
          id: { not: candidate.operationId },
          status: { in: ["pending", "processing"] },
        },
      }));
    const cleanup = await tx.ecmAttachmentCleanup.count({
      where: {
        state: { in: ["pending", "claimed", "started", "unknown"] },
        versionId: { in: ids },
      },
    });
    if (protectedCount || cleanup) {
      conflict();
    }
  }
  return [
    ...new Set(
      existing.flatMap((version) =>
        version.identityId ? [version.identityId] : []
      )
    ),
  ];
};

/** Keep original-request receipt evidence even when resource ownership cannot be established. */
export const receiveAttachmentIdentity = async (
  tx: Prisma.TransactionClient,
  version: EcmAttachmentVersion,
  receipt: { file_link: string; file_token: string }
): Promise<string | null> => {
  await lockAttachmentLedger(tx);
  const matches = await tx.ecmAttachmentIdentity.findMany({
    where: {
      OR: [{ fileToken: receipt.file_token }, { fileLink: receipt.file_link }],
      accountKey: version.accountKey,
    },
  });
  if (!matches.length) {
    const identity = await tx.ecmAttachmentIdentity.create({
      data: {
        accountKey: version.accountKey,
        fileLink: receipt.file_link,
        fileToken: receipt.file_token,
      },
    });
    return identity.id;
  }
  const [identity] = matches;
  if (
    !identity ||
    matches.length !== 1 ||
    identity.state !== "active" ||
    identity.fileLink !== receipt.file_link ||
    identity.fileToken !== receipt.file_token
  ) {
    await tx.ecmAttachmentIdentity.updateMany({
      data: { state: "held" },
      where: { id: { in: matches.map((match) => match.id) } },
    });
    return null;
  }
  const aliases = await tx.ecmAttachmentVersion.findMany({
    where: { identityId: identity.id },
  });
  if (
    version.storageMode !== "template" &&
    aliases.some(
      (alias) =>
        alias.responseId !== version.responseId ||
        alias.filename !== version.filename
    )
  ) {
    await tx.ecmAttachmentIdentity.update({
      data: { state: "held" },
      where: { id: identity.id },
    });
    return null;
  }
  return identity.id;
};

/** Classify only exact original receipts; incomplete aliases never prove history. */
export const templateReceiptConflict = async (
  tx: Prisma.TransactionClient,
  version: EcmAttachmentVersion,
  identityId: string | null
): Promise<{ code: string; message: string } | null> => {
  if (version.storageMode !== "template") {
    return null;
  }
  const ambiguous = {
    code: "attachment_receipt_conflict",
    message: "ข้อมูลอ้างอิงไฟล์ขัดแย้งหรือยังยืนยันไม่ครบ รอบนี้ยังไม่บันทึก",
  };
  if (!identityId) {
    return ambiguous;
  }
  const aliases = await tx.ecmAttachmentVersion.findMany({
    where: { id: { not: version.id }, identityId },
  });
  if (!aliases.length) {
    return null;
  }
  const references = await tx.ecmAttachmentReference.findMany({
    where: { versionId: { in: aliases.map((alias) => alias.id) } },
  });
  const keys = references.map((reference) => reference.snapshotId);
  const history =
    (await tx.submission.count({ where: { documentKey: { in: keys } } })) +
    (await tx.correction.count({ where: { documentKey: { in: keys } } }));
  let reason = ambiguous;
  if (history) {
    const submissions = await tx.submission.findMany({
      select: { id: true },
      where: { documentKey: { in: keys }, responseId: version.responseId },
    });
    const corrections = await tx.correction.findMany({
      select: { id: true, revision: true },
      where: {
        documentKey: { in: keys },
        responseId: version.responseId,
      },
    });
    reason = {
      code: "attachment_history_receipt_conflict",
      message: `ข้อมูลอ้างอิงไฟล์ตรงกับประวัติเดิม รอบนี้ยังไม่บันทึก${submissions.map((entry) => ` / Submission ${entry.id}`).join("")}${corrections.map((entry) => ` / Correction ${entry.id} / revision ${entry.revision}`).join("")}`,
    };
  } else {
    const response = await tx.response.findUnique({
      where: { id: version.responseId },
    });
    const protectedReferences = references.some(
      (reference) =>
        reference.responseId !== version.responseId ||
        reference.snapshotId !== response?.draftDocumentKey
    );
    const protectedScopes =
      (await tx.editorLease.count({
        where: {
          OR: [
            { workspaceDocumentKey: { in: keys } },
            { workspaceBaseDocumentKey: { in: keys } },
          ],
        },
      })) +
      (await tx.operation.count({
        where: {
          documentKey: { in: keys },
          id: { not: version.operationId },
          status: { in: ["pending", "processing"] },
        },
      })) +
      (await tx.ecmAttachmentCleanup.count({
        where: {
          state: { in: ["pending", "claimed", "started", "unknown"] },
          versionId: { in: aliases.map((alias) => alias.id) },
        },
      }));
    if (
      references.length &&
      !protectedReferences &&
      !protectedScopes &&
      aliases.every(
        (alias) =>
          alias.responseId === version.responseId && alias.state === "committed"
      )
    ) {
      reason = {
        code: "attachment_draft_receipt_conflict",
        message: "ข้อมูลอ้างอิงไฟล์ซ้ำกับไฟล์ร่างเดิม รอบนี้ยังไม่บันทึก",
      };
    }
  }
  // Hold the shared resource before cancellation can schedule any cleanup.
  await tx.ecmAttachmentIdentity.update({
    data: { state: "held" },
    where: { id: identityId },
  });
  return reason;
};

/** Reference admission shares destination and resource fences with upload and DELETE. */
export const requireAttachmentReferenceReady = async (
  tx: Prisma.TransactionClient,
  version: EcmAttachmentVersion,
  operationId: string
): Promise<void> => {
  await lockAttachmentLedger(tx);
  if (!version.identityId) {
    conflict();
  }
  const identity = await tx.ecmAttachmentIdentity.findUniqueOrThrow({
    where: { id: version.identityId ?? conflict() },
  });
  if (identity.state !== "active") {
    conflict();
  }
  const active = await tx.ecmAttachmentVersion.count({
    where: {
      OR: [
        {
          filename: version.filename,
          state: { in: ["prepared", "started", "unknown", "received"] },
        },
        {
          identityId: version.identityId,
          state: {
            in: ["prepared", "started", "unknown", "received", "deleting"],
          },
        },
      ],
      accountKey: version.accountKey,
      operationId: { not: operationId },
    },
  });
  if (active) {
    conflict();
  }
};

export const attachmentIdentityReferenced = async (
  tx: Prisma.TransactionClient,
  version: EcmAttachmentVersion
): Promise<boolean> => {
  const ids = await identityVersionIds(tx, version);
  return Boolean(
    await tx.ecmAttachmentReference.count({ where: { versionId: { in: ids } } })
  );
};

/** A destination or alias still being written cannot be deleted, even before its new reference exists. */
export const requireAttachmentDeleteReady = async (
  tx: Prisma.TransactionClient,
  version: EcmAttachmentVersion
): Promise<void> => {
  await lockAttachmentLedger(tx);
  if (!version.identityId) {
    conflict();
  }
  const identity = await tx.ecmAttachmentIdentity.findUniqueOrThrow({
    where: { id: version.identityId ?? conflict() },
  });
  if (!["active", "deleting"].includes(identity.state)) {
    conflict();
  }
  const attempts = await tx.ecmAttachmentVersion.findMany({
    where: {
      OR: [{ filename: version.filename }, { identityId: version.identityId }],
      accountKey: version.accountKey,
      id: { not: version.id },
      state: { in: ["prepared", "started", "unknown", "received", "deleting"] },
    },
  });
  const batch = await tx.ecmAttachmentBatch.findUnique({
    where: { operationId: version.operationId },
  });
  const unsettled = attempts.some(
    (attempt) =>
      !(
        attempt.operationId === version.operationId &&
        attempt.identityId === version.identityId &&
        attempt.state === "received" &&
        attempt.requestSettledAt &&
        batch &&
        ["canceling", "cleanup-pending"].includes(batch.state)
      )
  );
  const aliases = await identityVersionIds(tx, version);
  const ambiguous = await tx.ecmAttachmentVersion.count({
    where: {
      OR: [{ fileLink: version.fileLink }, { fileToken: version.fileToken }],
      accountKey: version.accountKey,
      identityId: null,
      state: { notIn: ["canceled", "deleted"] },
    },
  });
  const cleanup = await tx.ecmAttachmentCleanup.count({
    where: {
      state: { in: ["claimed", "started", "unknown", "deleted"] },
      versionId: { in: aliases, not: version.id },
    },
  });
  if (unsettled || ambiguous || cleanup) {
    conflict();
  }
};
