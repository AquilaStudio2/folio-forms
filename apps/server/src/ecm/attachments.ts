import { Prisma, prisma } from "@onlyoffice/db";

import type {
  SpreadsheetContract,
  SpreadsheetField,
} from "../documents/spreadsheets/contract";
import { fail, HttpError } from "../http/errors";
import type { Operation } from "../model-types";
import {
  attachmentSchema,
  canonicalAttachment,
  checkAttachmentJsonBytes,
} from "../responses/attachment-data";
import type { EcmClient } from "./client";

export const lockBatch = async (
  tx: Prisma.TransactionClient,
  operationId: string
): Promise<void> => {
  await tx.$queryRaw(
    Prisma.sql`SELECT "operation_id" FROM "ecm_attachment_batches" WHERE "operation_id" = ${operationId}::uuid FOR UPDATE`
  );
};
export const requireAttachmentMutationReady = async (
  responseId: string,
  tx: Prisma.TransactionClient = prisma,
  ownOperation?: string
): Promise<void> => {
  const unsettled = await tx.ecmAttachmentBatch.findFirst({
    where: {
      responseId,
      ...(ownOperation ? { operationId: { not: ownOperation } } : {}),
      state: {
        in: ["prepared", "sending", "unknown", "canceling", "cleanup-pending"],
      },
    },
  });
  if (unsettled) {
    fail(
      409,
      "attachment_outcome_unresolved",
      "ยังยืนยันผลไฟล์แนบรอบเดิมไม่ได้ ข้อมูลเดิมยังอ่านได้ กรุณาติดต่อผู้ดูแลก่อนบันทึก ส่ง หรือลบคำตอบ"
    );
  }
};
const safeFilenamePart = (value: string, label: string): string => {
  if (!value || /[<>:"/\\|?*\p{Cc}]/u.test(value)) {
    fail(
      422,
      "invalid_attachment_metadata",
      `${label}: ใช้เป็นชื่อไฟล์ไม่ได้ กรุณาแก้ข้อมูล${label === "หมวดเอกสาร" ? "กับ Admin" : "ในช่องนี้"}`
    );
  }
  return value;
};

interface ScalarAttachmentInput {
  operation: Operation;
  contract: SpreadsheetContract;
  data: Record<string, unknown>;
  savedData: Record<string, unknown>;
  files: ReadonlyMap<string, File>;
  ecm: EcmClient;
}

interface ScalarAttachmentPlan {
  category: string;
  field: SpreadsheetField;
  file: File;
  filename: string;
  id: string;
  number: string;
  year: string;
}

const planScalarFile = (
  field: SpreadsheetField,
  file: File,
  data: Record<string, unknown>
): ScalarAttachmentPlan => {
  const year = String(data.fiscal_year ?? "");
  const number = String(data.docs_number ?? "");
  if (!/^\d{4}$/u.test(year)) {
    fail(
      422,
      "invalid_attachment_metadata",
      "fiscal_year: กรุณากรอกหรือเลือกปี 4 หลักก่อนบันทึกไฟล์"
    );
  }
  safeFilenamePart(number, "docs_number");
  if (number.length > 512) {
    fail(422, "invalid_attachment_metadata", "docs_number: ยาวเกิน 512 ตัวอักษร");
  }
  const category = safeFilenamePart(
    field.attachment?.category ?? "",
    "หมวดเอกสาร"
  );
  const original = attachmentSchema
    .pick({ original_name: true, size_bytes: true })
    .safeParse({
      original_name: file.name,
      size_bytes: file.size,
    });
  if (!original.success) {
    fail(422, "invalid_attachment", `${field.label}: ชื่อหรือขนาดไฟล์ไม่ถูกต้อง`);
  }
  const id = crypto.randomUUID();
  const dot = file.name.lastIndexOf(".");
  const extension = dot > 0 ? file.name.slice(dot) : "";
  if (extension) {
    safeFilenamePart(extension.slice(1), field.label);
  }
  const filename = safeFilenamePart(
    `${number}-${id}-${category}${extension}`,
    field.label
  );
  if (filename.trim() !== filename || /[. ]$/u.test(filename)) {
    fail(
      422,
      "invalid_attachment_metadata",
      `${field.label}: ชื่อไฟล์รวมไม่ปลอดภัย กรุณาตรวจ docs_number และให้ Admin ตรวจหมวดเอกสาร`
    );
  }
  return { category, field, file, filename, id, number, year };
};

/** Request-local bytes; all external effects and ownership live in PostgreSQL. */
export const uploadScalarAttachments = async (
  input: ScalarAttachmentInput
): Promise<Record<string, unknown>> => {
  const { operation, contract, files, ecm } = input;
  const batch = await prisma.ecmAttachmentBatch.findUniqueOrThrow({
    where: { operationId: operation.id },
  });
  const fields = contract.fields.filter((field) => field.attachment);
  const data = { ...input.data };
  const plans: ScalarAttachmentPlan[] = [];
  for (const [bindingId] of files) {
    if (!fields.some((field) => field.id === bindingId)) {
      fail(422, "invalid_attachment", "ช่องแนบไม่ตรงกับเอกสารที่ตรวจแล้ว");
    }
  }
  for (const field of fields) {
    const saved = canonicalAttachment(input.savedData[field.key]);
    data[field.key] = saved;
    const file = files.get(field.id);
    if (!file) {
      continue;
    }
    plans.push(planScalarFile(field, file, data));
  }
  for (const field of fields) {
    if (
      operation.type === "submit_response" &&
      field.required &&
      !data[field.key] &&
      !files.has(field.id)
    ) {
      fail(422, "invalid_attachment", `${field.label}: กรุณาแนบไฟล์ก่อนส่ง`);
    }
  }
  checkAttachmentJsonBytes(data);
  await prisma.$transaction(async (tx) => {
    await lockBatch(tx, operation.id);
    await requireAttachmentMutationReady(batch.responseId, tx, operation.id);
    const active = await tx.operation.findUnique({
      where: { id: operation.id },
    });
    if (active?.status !== "processing" || batch.state !== "prepared") {
      fail(409, "stale_operation", "การบันทึกไฟล์รอบนี้ไม่พร้อมเริ่ม");
    }
    for (const plan of plans) {
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      await tx.ecmAttachmentVersion.create({
        data: {
          accountKey: ecm.accountKey(),
          bindingId: plan.field.id,
          category: plan.category,
          documentNumber: plan.number,
          filename: plan.filename,
          fiscalYear: plan.year,
          id: plan.id,
          operationId: operation.id,
          originalName: plan.file.name,
          responseId: batch.responseId,
          sizeBytes: plan.file.size,
          tag: plan.field.key,
        },
      });
    }
  });
  for (const plan of plans) {
    const body = new FormData();
    body.set("documentFile", plan.file, plan.filename);
    body.set("template", "0");
    body.set("documentYear", plan.year);
    body.set("documentNumber", plan.number);
    body.set("documentCategory", plan.category);
    try {
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      const receipt = await ecm.upload(body, async () => {
        await prisma.$transaction(async (tx) => {
          await lockBatch(tx, operation.id);
          const current = await tx.ecmAttachmentBatch.findUniqueOrThrow({
            where: { operationId: operation.id },
          });
          const active = await tx.operation.findUnique({
            where: { id: operation.id },
          });
          if (
            !["prepared", "sending"].includes(current.state) ||
            active?.status !== "processing"
          ) {
            fail(409, "stale_operation", "รอบแนบไฟล์หยุดแล้ว");
          }
          const actor = await tx.user.findFirst({
            where: {
              enabled: true,
              id: batch.actorId,
              role: { not: "viewer" },
            },
          });
          const lease = await tx.editorLease.findFirst({
            where: {
              expiresAt: { gt: new Date() },
              holderSessionId: batch.authSessionId,
              holderUserId: batch.actorId,
              id: batch.leaseId,
            },
          });
          const response = await tx.response.findUnique({
            where: { id: batch.responseId },
          });
          if (
            !actor ||
            !lease ||
            response?.userId !== batch.actorId ||
            response.draftDocumentKey !== batch.documentKey
          ) {
            fail(409, "stale_operation", "สิทธิ์หรือเอกสารเปลี่ยนก่อนส่งไฟล์");
          }
          await tx.ecmAttachmentVersion.update({
            data: { sentAt: new Date(), state: "started" },
            where: { id: plan.id },
          });
          await tx.ecmAttachmentBatch.update({
            data: { state: "sending" },
            where: { operationId: operation.id },
          });
        });
      });
      // A receipt is retained even if the Folio Operation expired while ECM was sending.
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      await prisma.ecmAttachmentVersion.update({
        data: {
          fileLink: receipt.file_link,
          fileToken: receipt.file_token,
          receivedAt: new Date(),
          state: "received",
        },
        where: { id: plan.id },
      });
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      const active = await prisma.operation.findUnique({
        where: { id: operation.id },
      });
      if (active?.status !== "processing") {
        fail(409, "stale_operation", "การบันทึกรอบนี้หมดอายุแล้ว ไฟล์ใหม่รอจัดการ");
      }
      data[plan.field.key] = {
        ...receipt,
        original_name: plan.file.name,
        size_bytes: plan.file.size,
      };
      checkAttachmentJsonBytes(data);
    } catch (error) {
      if (error instanceof HttpError) {
        fail(
          error.httpStatus,
          error.code,
          `${plan.field.label} / หมวด ${plan.category}: ${error.message}`
        );
      }
      fail(
        502,
        "attachment_upload_failed",
        `${plan.field.label} / หมวด ${plan.category}: ยังยืนยันผลการแนบไฟล์รอบนี้ไม่ได้ ข้อมูลเดิมยังอยู่`
      );
    }
  }
  return data;
};

/** Same transaction as the document pointer, canonical JSON, and Operation completion. */
// oxlint-disable-next-line complexity -- Ownership, revision and deletion fencing must be checked together with every reference in the canonical commit transaction.
export const commitAttachmentBatch = async (
  tx: Prisma.TransactionClient,
  operation: Operation,
  data: Record<string, unknown>,
  snapshotId: string
): Promise<void> => {
  await lockBatch(tx, operation.id);
  const batch = await tx.ecmAttachmentBatch.findUnique({
    where: { operationId: operation.id },
  });
  if (!batch) {
    return;
  }
  const response = await tx.response.findUnique({
    where: { id: batch.responseId },
  });
  const actor = await tx.user.findFirst({
    where: { enabled: true, id: batch.actorId, role: { not: "viewer" } },
  });
  const lease = await tx.editorLease.findFirst({
    where: {
      expiresAt: { gt: new Date() },
      holderSessionId: batch.authSessionId,
      holderUserId: batch.actorId,
      id: batch.leaseId,
      targetId: batch.responseId,
      targetType: "response",
    },
  });
  const active = await tx.operation.findUnique({ where: { id: operation.id } });
  if (
    !response ||
    response.userId !== batch.actorId ||
    response.draftDocumentKey !== batch.documentKey ||
    response.formId !== batch.formId ||
    !actor ||
    !lease ||
    active?.status !== "processing" ||
    !["prepared", "sending"].includes(batch.state)
  ) {
    fail(409, "stale_operation", "สิทธิ์หรือรอบบันทึกเปลี่ยนแล้ว ข้อมูลเดิมไม่ถูกแทนที่");
  }
  checkAttachmentJsonBytes(data);
  const template = await tx.fieldManifest.findUnique({
    include: { fields: true },
    where: { publishedTemplateId: response.publishedTemplateId },
  });
  const versions: string[] = [];
  for (const field of template?.fields.filter(
    (candidate) => candidate.attachment
  ) ?? []) {
    const attachment = canonicalAttachment(data[field.tag]);
    if (!attachment) {
      continue;
    }
    const { binding } = field;
    if (
      !binding ||
      typeof binding !== "object" ||
      Array.isArray(binding) ||
      typeof binding.id !== "string"
    ) {
      fail(409, "invalid_attachment", "สัญญาตำแหน่งช่องแนบเปลี่ยนแล้ว");
    }
    // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
    const version = await tx.ecmAttachmentVersion.findFirst({
      where: {
        bindingId: binding.id,
        category: field.attachmentCategory ?? "",
        fileLink: attachment.file_link,
        fileToken: attachment.file_token,
        originalName: attachment.original_name,
        responseId: batch.responseId,
        sizeBytes: attachment.size_bytes,
        state: { in: ["received", "committed"] },
        tag: field.tag,
      },
    });
    if (
      !version ||
      (version.state === "received" && version.operationId !== operation.id)
    ) {
      fail(409, "invalid_attachment", "ไม่พบหลักฐานไฟล์ของคำตอบรอบนี้");
    }
    // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" = ${version.id}::uuid FOR UPDATE`
    );
    // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
    const current = await tx.ecmAttachmentVersion.findUniqueOrThrow({
      where: { id: version.id },
    });
    if (!["received", "committed"].includes(current.state)) {
      fail(409, "invalid_attachment", "ไฟล์นี้อยู่ระหว่างจัดการลบ");
    }
    versions.push(version.id);
    // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
    await tx.ecmAttachmentReference.upsert({
      create: {
        responseId: batch.responseId,
        snapshotId,
        versionId: version.id,
      },
      update: {},
      where: { versionId_snapshotId: { snapshotId, versionId: version.id } },
    });
  }
  await tx.ecmAttachmentVersion.updateMany({
    data: { state: "committed" },
    where: {
      id: { in: versions },
      operationId: operation.id,
      state: "received",
    },
  });
  await tx.ecmAttachmentBatch.update({
    data: { state: "committed" },
    where: { operationId: operation.id },
  });
};

export const cancelAttachmentBatch = async (
  operationId: string,
  ecm: EcmClient
): Promise<void> => {
  const batch = await prisma.$transaction(async (tx) => {
    await lockBatch(tx, operationId);
    const current = await tx.ecmAttachmentBatch.findUnique({
      where: { operationId },
    });
    if (!current || current.state === "committed") {
      return null;
    }
    const operation = await tx.operation.findUnique({
      where: { id: operationId },
    });
    if (operation?.status === "completed") {
      return null;
    }
    await tx.ecmAttachmentBatch.update({
      data: { state: "canceling" },
      where: { operationId },
    });
    return current;
  });
  if (!batch) {
    return;
  }
  const versions = await prisma.ecmAttachmentVersion.findMany({
    where: { operationId },
  });
  let unsettled = false;
  for (const version of versions) {
    if (["started", "unknown", "deleting"].includes(version.state)) {
      unsettled = true;
      continue;
    }
    if (version.state !== "received" || !version.fileToken) {
      continue;
    }
    if (version.accountKey !== ecm.accountKey()) {
      unsettled = true;
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" = ${version.id}::uuid FOR UPDATE`
      );
      if (
        await tx.ecmAttachmentReference.count({
          where: { versionId: version.id },
        })
      ) {
        return false;
      }
      const updated = await tx.ecmAttachmentVersion.updateMany({
        data: { state: "deleting" },
        where: { id: version.id, state: "received" },
      });
      return updated.count === 1;
    });
    if (!claimed) {
      unsettled = true;
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      await ecm.deleteFile(version.fileToken);
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      await prisma.ecmAttachmentVersion.update({
        data: { state: "deleted" },
        where: { id: version.id },
      });
    } catch {
      unsettled = true;
    }
  }
  await prisma.ecmAttachmentBatch.update({
    data: { state: unsettled ? "cleanup-pending" : "canceled" },
    where: { operationId },
  });
};
