import { prisma } from "@onlyoffice/db";

import { fail } from "../http/errors";
import { updateOperationFailed } from "../operations/lifecycle";
import {
  deleteAttachmentCleanup,
  fenceAttachmentBatch,
  lockBatch,
  settleCanceledAttachmentBatch,
} from "./attachments";
import type { EcmClient } from "./client";

/** Tracking is independent of live Responses and never returns answer JSON or provider tokens. */
export const attachmentFollowUps = async (formPublicId?: string) => {
  const form = formPublicId
    ? await prisma.form.findUnique({
        select: { id: true },
        where: { publicId: formPublicId },
      })
    : null;
  if (formPublicId && !form) {
    return [];
  }
  const batches = await prisma.ecmAttachmentBatch.findMany({
    orderBy: { createdAt: "desc" },
    where: form ? { formId: form.id } : {},
  });
  const cleanups = await prisma.ecmAttachmentCleanup.findMany({
    orderBy: { createdAt: "desc" },
    where: form ? { formId: form.id } : {},
  });
  const operationIds = [
    ...new Set([
      ...batches.map((batch) => batch.operationId),
      ...cleanups.map((cleanup) => cleanup.operationId),
    ]),
  ];
  if (!operationIds.length) {
    return [];
  }
  const versions = await prisma.ecmAttachmentVersion.findMany({
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
    where: {
      OR: [
        { operationId: { in: operationIds } },
        { id: { in: cleanups.map((cleanup) => cleanup.versionId) } },
      ],
    },
  });
  const responseIds = [
    ...new Set([
      ...batches.map((batch) => batch.responseId),
      ...cleanups.map((cleanup) => cleanup.responseId),
    ]),
  ];
  const responses = await prisma.response.findMany({
    select: { formId: true, id: true },
    where: { id: { in: responseIds } },
  });
  const forms = await prisma.form.findMany({
    select: { id: true, publicId: true, title: true },
    where: {
      id: {
        in: [
          ...new Set([
            ...batches.map((batch) => batch.formId),
            ...cleanups.flatMap((cleanup) =>
              cleanup.formId ? [cleanup.formId] : []
            ),
          ]),
        ],
      },
    },
  });
  const references = await prisma.ecmAttachmentReference.findMany({
    select: { versionId: true },
    where: { versionId: { in: versions.map((version) => version.id) } },
  });
  return operationIds.flatMap((operationId) => {
    const batch = batches.find(
      (candidate) => candidate.operationId === operationId
    );
    const intents = cleanups.filter(
      (candidate) => candidate.operationId === operationId
    );
    const context = batch ?? intents[0];
    if (!context) {
      return [];
    }
    const { responseId } = context;
    const response = responses.find((candidate) => candidate.id === responseId);
    const formId = context.formId ?? response?.formId;
    if (form && formId !== form.id) {
      return [];
    }
    const scope = forms.find((candidate) => candidate.id === formId);
    const entries = versions.filter(
      (version) =>
        version.operationId === operationId ||
        intents.some((intent) => intent.versionId === version.id)
    );
    const held =
      batch &&
      [
        "prepared",
        "sending",
        "unknown",
        "canceling",
        "cleanup-pending",
      ].includes(batch.state);
    const cleanupPending = intents.some((intent) =>
      ["pending", "claimed", "started", "unknown"].includes(intent.state)
    );
    if (!held && !intents.length) {
      return [];
    }
    let reason = "ยืนยันการจัดการไฟล์ค้างแล้ว ไฟล์รอบยกเลิกไม่ได้กลายเป็นคำตอบใหม่";
    if (held) {
      reason =
        "ข้อมูลเดิมยังอ่านได้ แต่ยังยืนยันคำขอหรือการลบรอบที่ยกเลิกไม่ได้ ห้ามบันทึก ส่ง หรือลบคำตอบ";
    } else if (cleanupPending) {
      reason = "ข้อมูลใหม่บันทึกแล้ว URL เก่าอาจยังเปิดได้จนกว่าจะยืนยันการลบ";
    }
    const original = batch
      ? {
          actorId: batch.actorId,
          checkpoint: batch.checkpoint,
          documentKey: batch.documentKey,
          generation: batch.generation,
          state: batch.state,
        }
      : {
          actorId: null,
          checkpoint: null,
          documentKey: null,
          generation: null,
          state: "cleanup-only",
        };
    const formDetails = scope
      ? { formPublicId: scope.publicId, formTitle: scope.title }
      : { formPublicId: null, formTitle: null };
    return [
      {
        ...original,
        ...formDetails,
        canFence: Boolean(
          batch && ["prepared", "sending", "unknown"].includes(batch.state)
        ),
        createdAt: context.createdAt,
        formId: formId ?? null,
        mutationHeld: Boolean(held),
        nextAction:
          held || cleanupPending
            ? "ประสาน PM/ECM ด้วยชื่อและเวลาจากหลักฐานนี้ ห้ามส่งซ้ำหรือถือว่าค้นไม่พบเท่ากับไม่มีไฟล์; Admin เริ่มลบได้เฉพาะ receipt ที่ยืนยันแล้วและยังไม่เคยส่ง DELETE"
            : "ไม่ต้องส่งคำขอลบเดิมซ้ำ ผู้ใช้เริ่มบันทึกรอบใหม่เองด้วย version identities ใหม่ได้",
        operationId,
        reason,
        responseDeleted: !response,
        responseId,
        versions: entries.map((version) => {
          const cleanup = intents.find(
            (intent) => intent.versionId === version.id
          );
          const referenced = references.some(
            (reference) => reference.versionId === version.id
          );
          return {
            bindingId: version.bindingId,
            canDelete: Boolean(
              (!cleanup ||
                (cleanup.state === "pending" && !cleanup.attemptedAt)) &&
              !referenced &&
              version.requestSettledAt &&
              ((version.state === "committed" && cleanup !== undefined) ||
                (version.state === "received" &&
                  batch &&
                  ["canceling", "cleanup-pending"].includes(batch.state)))
            ),
            category: version.category,
            cleanupState: cleanup?.state ?? null,
            confirmedAt: cleanup?.confirmedAt ?? null,
            confirmedBy: cleanup?.confirmedBy ?? null,
            deleteAttemptedAt: cleanup?.attemptedAt ?? null,
            documentNumber: version.documentNumber,
            evidence: cleanup?.evidence ?? null,
            filename: version.filename,
            fiscalYear: version.fiscalYear,
            generation: version.generation,
            id: version.id,
            originalName: version.originalName,
            receivedAt: version.receivedAt,
            referenced,
            requestSettledAt: version.requestSettledAt,
            rowIndex: version.rowIndex,
            sentAt: version.sentAt,
            sizeBytes: version.sizeBytes,
            state: version.state,
            tag: version.tag,
          };
        }),
      },
    ];
  });
};

export const settleAttachmentFollowUp = async (
  operationId: string,
  input: unknown,
  actorId: string,
  ecm: EcmClient
): Promise<void> => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !("versionId" in input) ||
    typeof input.versionId !== "string" ||
    !("generation" in input) ||
    typeof input.generation !== "number" ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      input.versionId
    ) ||
    Object.keys(input).some((key) => !["versionId", "generation"].includes(key))
  ) {
    fail(
      409,
      "attachment_outcome_unresolved",
      "ข้อความหรือการยอมรับความเสี่ยงไม่ใช่หลักฐานคำขอเดิม ห้ามปลดค้างหรือใช้ token/URL ที่กรอกเอง"
    );
  }
  await deleteAttachmentCleanup(operationId, input.versionId, ecm, {
    generation: input.generation,
    id: actorId,
  });
  await prisma.$transaction((tx) =>
    settleCanceledAttachmentBatch(operationId, tx)
  );
};

export const fenceAttachmentFollowUp = async (
  operationId: string,
  generation: unknown,
  actorId: string
): Promise<void> => {
  if (typeof generation !== "number" || !Number.isSafeInteger(generation)) {
    fail(400, "invalid_request", "generation is invalid");
  }
  await prisma.$transaction(async (tx) => {
    await lockBatch(tx, operationId);
    const actor = await tx.user.findFirst({
      where: { enabled: true, id: actorId, role: "admin" },
    });
    if (!actor) {
      fail(403, "forbidden", "เฉพาะ Admin ที่ยังมีสิทธิ์เท่านั้นหยุดรอบแนบได้");
    }
    const batch = await tx.ecmAttachmentBatch.findUnique({
      where: { operationId },
    });
    if (
      !batch ||
      batch.generation !== generation ||
      !["prepared", "sending", "unknown"].includes(batch.state)
    ) {
      fail(
        409,
        "attachment_outcome_unresolved",
        "รอบเดิมเปลี่ยนแล้ว กรุณาเปิดหลักฐานล่าสุด"
      );
    }
    await fenceAttachmentBatch(tx, operationId);
    await tx.auditEvent.create({
      data: {
        action: "ecm_attachment_sender_fenced",
        actorId,
        outcome: "success",
        safeMetadata: {
          generation,
          operationId,
          proof: "durable-dispatch-and-commit-fence",
        },
        targetId: batch.responseId,
        targetType: "attachment-follow-up",
      },
    });
  });
  await updateOperationFailed(operationId, "document_save_failed", undefined, {
    errorMessage:
      "Admin หยุดรอบแนบเดิมแล้ว ข้อมูลเดิมยังอยู่ คำขอที่ส่งไปแล้วต้องยืนยันผลและจัดการไฟล์ครบก่อนบันทึกใหม่ ห้ามส่งไฟล์ซ้ำ",
  });
};
