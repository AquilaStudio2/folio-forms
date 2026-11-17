import { createHash } from "node:crypto";

import { Prisma, prisma } from "@onlyoffice/db";
import type { EcmAttachmentBatch, EditorLease } from "@onlyoffice/db";

import type { SpreadsheetContract } from "../documents/spreadsheets/contract";
import { extractSpreadsheetData } from "../documents/spreadsheets/workbook";
import type { SpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
import { fail, HttpError } from "../http/errors";
import type { Operation } from "../model-types";
import { operationMetadata } from "../operations/model";
import {
  attachmentSchema,
  canonicalAttachment,
  checkAttachmentJsonBytes,
  spreadsheetAttachmentSlots,
  canonicalTableAttachments,
  tableAttachmentSchema,
} from "../responses/attachment-data";
import type {
  Attachment,
  AttachmentSlot,
  TableAttachment,
} from "../responses/attachment-data";
import type { EcmClient } from "./client";
import {
  lockAttachmentLedger,
  admitAttachmentDestination,
  receiveAttachmentIdentity,
  requireAttachmentReferenceReady,
  attachmentIdentityReferenced,
  requireAttachmentDeleteReady,
  identityVersionIds,
} from "./identity";

export const lockBatch = async (
  tx: Prisma.TransactionClient,
  operationId: string
): Promise<void> => {
  await lockAttachmentLedger(tx);
  await tx.$queryRaw(
    Prisma.sql`SELECT "operation_id" FROM "ecm_attachment_batches" WHERE "operation_id" = ${operationId}::uuid FOR UPDATE`
  );
};
export const attachmentMutationNotice = async (
  responseId: string,
  tx: Prisma.TransactionClient = prisma,
  ownOperation?: string
): Promise<string | null> => {
  const batch = await tx.ecmAttachmentBatch.findFirst({
    orderBy: { createdAt: "asc" },
    where: {
      responseId,
      ...(ownOperation ? { operationId: { not: ownOperation } } : {}),
      state: {
        in: ["prepared", "sending", "unknown", "canceling", "cleanup-pending"],
      },
    },
  });
  if (!batch) {
    const references = await tx.ecmAttachmentReference.findMany({
      select: { versionId: true },
      where: { responseId },
    });
    const held = await tx.ecmAttachmentIdentity.findFirst({
      where: {
        state: "held",
        versions: {
          some: {
            id: { in: references.map((reference) => reference.versionId) },
          },
        },
      },
    });
    return held
      ? `คำตอบเดิมยังอ่านได้ แต่ทรัพยากรไฟล์ร่วมอาจถูกเขียนทับแล้วและยังยืนยันเจ้าของไม่ได้ กรุณาติดต่อผู้ดูแล ห้ามบันทึก ส่ง ลบคำตอบ หรือส่งไฟล์ซ้ำ รหัสทรัพยากร ${held.id}`
      : null;
  }
  const versions = await tx.ecmAttachmentVersion.findMany({
    where: {
      operationId: batch.operationId,
      state: { notIn: ["canceled", "deleted"] },
    },
  });
  const slots = versions.map((version) => {
    const slot = `${version.tag}${version.rowIndex === null ? "" : ` / แถว ${version.rowIndex + 1}`}`;
    let reason = "ยังไม่เริ่มส่งไฟล์ กำลังตรวจผลรอบเดิม";
    if (["started", "unknown"].includes(version.state)) {
      reason = "เริ่มส่งแล้วแต่ยังยืนยันผล upload ไม่ได้ อาจมีไฟล์ที่ ECM";
    } else if (version.state === "received") {
      reason = "ECM รับไฟล์แล้ว แต่ไม่ได้บันทึกเป็นคำตอบ รอบที่ยกเลิกต้องจัดการไฟล์ค้าง";
    } else if (version.state === "deleting") {
      reason = "ยังยืนยันผลการลบไฟล์รอบที่ยกเลิกไม่ได้";
    }
    return `${slot}: ${reason}`;
  });
  return `${slots.join("; ") || "กำลังตรวจผลรอบแนบเดิม"} ข้อมูลคำตอบเดิมยังอ่านได้ แต่ไฟล์ที่ URL เดิมอาจถูกเขียนทับแล้วและยังยืนยันไม่ได้ กรุณาติดต่อผู้ดูแลก่อนบันทึก ส่ง หรือลบคำตอบ ห้ามส่งไฟล์ซ้ำ รหัสติดตาม ${batch.operationId}`;
};

export const requireAttachmentMutationReady = async (
  responseId: string,
  tx: Prisma.TransactionClient = prisma,
  ownOperation?: string
): Promise<void> => {
  const notice = await attachmentMutationNotice(responseId, tx, ownOperation);
  if (notice) {
    fail(409, "attachment_outcome_unresolved", notice);
  }
};

const requireCorrectionBatchDocument = async (
  tx: Prisma.TransactionClient,
  operation: Operation,
  batch: EcmAttachmentBatch,
  lease: EditorLease
): Promise<void> => {
  const metadata = operationMetadata(operation.metadata);
  const submission = await tx.submission.findFirst({
    include: { corrections: { orderBy: { revision: "desc" }, take: 1 } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    where: { responseId: batch.responseId },
  });
  const latest = submission?.corrections[0];
  if (
    !submission ||
    submission.id !== metadata.submissionId ||
    (latest?.documentKey ?? submission.documentKey) !==
      metadata.baseDocumentKey ||
    (latest?.revision ?? 0) !== metadata.baseRevision ||
    lease.workspaceDocumentKey !== batch.documentKey ||
    lease.workspaceObjectKey !== metadata.workspaceObjectKey ||
    lease.workspaceBaseDocumentKey !== metadata.baseDocumentKey ||
    lease.workspaceBaseRevision !== metadata.baseRevision
  ) {
    fail(409, "stale_operation", "สิทธิ์หรือเอกสารเปลี่ยนก่อนบันทึกไฟล์");
  }
};

const requireBatchScope = async (
  tx: Prisma.TransactionClient,
  operation: Operation,
  batch: EcmAttachmentBatch
): Promise<void> => {
  const correction = operation.targetType === "correction";
  const actor = await tx.user.findFirst({
    where: {
      enabled: true,
      id: batch.actorId,
      role: correction ? "admin" : { not: "viewer" },
    },
  });
  const lease = await tx.editorLease.findFirst({
    where: {
      expiresAt: { gt: new Date() },
      holderSessionId: batch.authSessionId,
      holderUserId: batch.actorId,
      id: batch.leaseId,
      targetId: batch.responseId,
      targetType: correction ? "correction" : "response",
    },
  });
  const response = await tx.response.findUnique({
    where: { id: batch.responseId },
  });
  if (!actor || !lease || !response || response.formId !== batch.formId) {
    fail(409, "stale_operation", "สิทธิ์หรือเอกสารเปลี่ยนก่อนบันทึกไฟล์");
  }
  if (correction) {
    if (response.status !== "submitted") {
      fail(409, "stale_operation", "สิทธิ์หรือเอกสารเปลี่ยนก่อนบันทึกไฟล์");
    }
    await requireCorrectionBatchDocument(tx, operation, batch, lease);
  } else if (
    response.userId !== batch.actorId ||
    response.draftDocumentKey !== batch.documentKey ||
    response.status !==
      (operation.type === "submit_response" ? "submitting" : "draft")
  ) {
    fail(409, "stale_operation", "สิทธิ์หรือเอกสารเปลี่ยนก่อนบันทึกไฟล์");
  }
};

export const attachmentCleanupWarning = async (
  responseId: string
): Promise<string | null> => {
  const pending = await prisma.ecmAttachmentCleanup.findMany({
    select: { operationId: true },
    where: {
      responseId,
      state: { in: ["pending", "claimed", "started", "unknown"] },
    },
  });
  const batches = await prisma.ecmAttachmentBatch.findMany({
    select: { operationId: true, state: true },
    where: { operationId: { in: pending.map((intent) => intent.operationId) } },
  });
  const warning = pending.some((intent) => {
    const batch = batches.find(
      (candidate) => candidate.operationId === intent.operationId
    );
    return !batch || batch.state === "committed";
  });
  return warning
    ? "บันทึกข้อมูลใหม่แล้ว แต่ยังยืนยันการลบไฟล์เก่าไม่ได้ URL เก่าอาจยังเปิดได้ กรุณาติดต่อผู้ดูแล"
    : null;
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

interface AttachmentInput {
  operation: Operation;
  contract: SpreadsheetContract;
  workbook: SpreadsheetWorkbook;
  savedData: Record<string, unknown>;
  files: ReadonlyMap<string, File>;
  removals: ReadonlySet<string>;
  ecm: EcmClient;
}

interface AttachmentPlan {
  category: string;
  slot: AttachmentSlot;
  target: Record<string, unknown>;
  file: File;
  filename: string;
  id: string;
  number: string;
  year: string | null;
  sha256: string | null;
}

// oxlint-disable-next-line complexity -- Validate both frozen filename policies at the shared boundary.
const planAttachmentFile = (
  slot: AttachmentSlot,
  target: Record<string, unknown>,
  file: File,
  data: Record<string, unknown>
): AttachmentPlan => {
  const { field } = slot;
  const label = `${field.label}${slot.rowIndex === null ? "" : ` / แถว ${slot.rowIndex + 1}`}`;
  const templateMode = field.attachment?.mode === "template";
  const year = templateMode ? null : String(data.fiscal_year ?? "");
  const number = String(data.docs_number ?? "");
  if (!templateMode && !/^\d{4}$/u.test(year ?? "")) {
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
  const category = templateMode
    ? ""
    : safeFilenamePart(field.attachment?.category ?? "", "หมวดเอกสาร");
  const templateName =
    templateMode && field.attachment?.mode === "template"
      ? safeFilenamePart(
          field.attachment.template_name ?? "",
          "แม่แบบจัดเก็บเอกสาร"
        )
      : null;
  const original = attachmentSchema
    .pick({ original_name: true, size_bytes: true })
    .safeParse({
      original_name: file.name,
      size_bytes: file.size,
    });
  if (!original.success) {
    fail(422, "invalid_attachment", `${label}: ชื่อหรือขนาดไฟล์ไม่ถูกต้อง`);
  }
  const id = crypto.randomUUID();
  const dot = file.name.lastIndexOf(".");
  const extension = dot > 0 ? file.name.slice(dot) : "";
  if (extension) {
    safeFilenamePart(extension.slice(1), label);
  }
  const filename = safeFilenamePart(
    templateMode
      ? `${number}-${templateName}${extension}`
      : `${number}-${id}-${category}${extension}`,
    label
  );
  if (filename.trim() !== filename || /[. ]$/u.test(filename)) {
    fail(
      422,
      "invalid_attachment_metadata",
      `${label}: ชื่อไฟล์รวมไม่ปลอดภัย กรุณาตรวจ docs_number และให้ Admin ตรวจหมวดเอกสาร`
    );
  }
  return {
    category,
    file,
    filename,
    id,
    number,
    slot,
    target,
    year,
    sha256: null,
  };
};

const originalForChangedMetadata = async (
  slot: AttachmentSlot,
  saved: Attachment,
  responseId: string,
  data: Record<string, unknown>,
  ecm: EcmClient,
  snapshotId: string | null
): Promise<{ file: File; sha256: string | null } | undefined> => {
  const { field } = slot;
  const label = `${field.label}${slot.rowIndex === null ? "" : ` / แถว ${slot.rowIndex + 1}`}`;
  if (!snapshotId) {
    fail(409, "invalid_attachment", `${label}: ไม่พบเอกสารต้นฉบับที่บันทึกแล้ว`);
  }
  const references = await prisma.ecmAttachmentReference.findMany({
    select: { versionId: true },
    where: { responseId, snapshotId },
  });
  const version = await prisma.ecmAttachmentVersion.findFirst({
    where: {
      id: { in: references.map((reference) => reference.versionId) },
      bindingId: field.id,
      category: field.attachment?.category ?? "",
      fileLink: saved.file_link,
      fileToken: saved.file_token,
      originalName: saved.original_name,
      responseId,
      rowIndex: slot.rowIndex === null ? null : { not: null },
      sizeBytes: saved.size_bytes,
      state: "committed",
      tag: slot.tag,
    },
  });
  if (!version) {
    fail(409, "invalid_attachment", `${label}: ไม่พบหลักฐานไฟล์เดิมที่บันทึกแล้ว`);
  }
  if (
    (field.attachment?.mode === "template" ||
      version.fiscalYear === String(data.fiscal_year ?? "")) &&
    version.documentNumber === String(data.docs_number ?? "")
  ) {
    return undefined;
  }
  try {
    if (version.accountKey !== ecm.accountKey()) {
      fail(409, "invalid_attachment", "บัญชีเอกสารแนบไม่ตรงกับไฟล์เดิม");
    }
    if (
      !version.fileLink ||
      !version.fileToken ||
      (field.attachment?.mode === "template" && !version.originalSha256)
    ) {
      fail(502, "attachment_original_unavailable", "ไม่มีหลักฐาน hash ต้นฉบับ");
    }
    const original = await ecm.originalBytes(
      version.fileLink,
      version.fileToken,
      version.sizeBytes,
      field.attachment?.mode === "template" ? "template" : "legacy",
      version.originalSha256
    );
    return {
      file: new File([original], saved.original_name),
      sha256: version.originalSha256,
    };
  } catch {
    fail(
      502,
      "attachment_original_unavailable",
      `${label}: อ่านไฟล์ต้นฉบับเดิมไม่ได้ ข้อมูลเดิมยังอยู่ กรุณาติดต่อผู้ดูแล`
    );
  }
};

const attachmentSnapshot = (
  input: AttachmentInput,
  slots: readonly AttachmentSlot[]
) => {
  const { contract } = input;
  const attachments: Record<string, unknown> = {};
  const { table } = contract;
  const tableBody = table ? contract.locations[table.anchor] : undefined;
  const savedRows: Map<
    number,
    Record<string, TableAttachment | null>
  > = table && tableBody
    ? canonicalTableAttachments(
        input.savedData,
        table.key,
        table.columns
          .filter((column) => column.attachment)
          .map((column) => column.key),
        tableBody.lastRow - tableBody.firstRow + 1
      )
    : new Map<number, Record<string, TableAttachment | null>>();
  for (const slot of slots) {
    if (slot.rowIndex === null) {
      attachments[slot.field.key] = input.removals.has(slot.key)
        ? null
        : canonicalAttachment(input.savedData[slot.field.key]);
    } else if (input.removals.has(slot.key)) {
      const row = savedRows.get(slot.rowIndex);
      if (row) {
        row[slot.field.key] = null;
      }
    }
  }
  if (table) {
    attachments[table.key] = [...savedRows.values()];
  }
  const extracted = extractSpreadsheetData(
    input.workbook,
    contract,
    input.operation.type === "submit_response" ||
      input.operation.type === "save_correction",
    attachments,
    new Set(input.files.keys())
  );
  if (
    ["submit_response", "save_correction"].includes(input.operation.type) &&
    extracted.errors.length
  ) {
    fail(
      422,
      "invalid_attachment",
      extracted.errors.map((error) => error.message).join("\n")
    );
  }
  return extracted;
};

const planAttachmentUploads = async (
  input: AttachmentInput,
  responseId: string
): Promise<{ data: Record<string, unknown>; plans: AttachmentPlan[] }> => {
  const { contract, files, ecm } = input;
  const slots = [...spreadsheetAttachmentSlots(contract)];
  const byKey = new Map(slots.map((slot) => [slot.key, slot]));
  for (const key of [...files.keys(), ...input.removals]) {
    if (!byKey.has(key)) {
      fail(422, "invalid_attachment", "ช่องแนบหรือแถวไม่ตรงกับเอกสารที่ตรวจแล้ว");
    }
  }
  const extracted = attachmentSnapshot(input, slots);
  const { data } = extracted;
  const rows = contract.table
    ? (data[contract.table.key] as Record<string, unknown>[])
    : [];
  const targets = new Map(
    extracted.rowIndices.map((rowIndex, index) => {
      const target = rows[index];
      if (!target) {
        fail(409, "invalid_attachment", "ข้อมูลแถวไม่ตรงกับตำแหน่งที่ตรวจแล้ว");
      }
      return [rowIndex, target] as const;
    })
  );
  const plans: AttachmentPlan[] = [];
  for (const slot of slots) {
    const target = slot.rowIndex === null ? data : targets.get(slot.rowIndex);
    if (!target || input.removals.has(slot.key)) {
      continue;
    }
    const value = target[slot.field.key];
    const schema =
      slot.rowIndex === null ? attachmentSchema : tableAttachmentSchema;
    const saved =
      value === null || value === undefined ? null : schema.parse(value);
    let file = files.get(slot.key);
    let sha256: string | null = null;
    if (!file && saved) {
      // Only an owned committed receipt can supply original bytes or metadata.
      // oxlint-disable-next-line no-await-in-loop -- Fetch and validate every original before the first external write.
      const original = await originalForChangedMetadata(
        slot,
        saved,
        responseId,
        data,
        ecm,
        input.operation.documentKey
      );
      file = original?.file;
      sha256 = original?.sha256 ?? null;
    }
    if (file) {
      const plan = planAttachmentFile(slot, target, file, data);
      if (slot.field.attachment?.mode === "template" && !sha256) {
        const hash = createHash("sha256");
        for await (const chunk of file.stream()) {
          hash.update(chunk);
        }
        sha256 = hash.digest("hex");
      }
      plans.push({ ...plan, sha256 });
    }
  }
  checkAttachmentJsonBytes(data);
  return { data, plans };
};

/** Request-local bytes; all external effects and ownership live in PostgreSQL. */
export const uploadAttachments = async (
  input: AttachmentInput
): Promise<Record<string, unknown>> => {
  const { operation, ecm } = input;
  const batch = await prisma.ecmAttachmentBatch.findUniqueOrThrow({
    where: { operationId: operation.id },
  });
  const { data, plans } = await planAttachmentUploads(input, batch.responseId);
  await prisma.$transaction(async (tx) => {
    await lockBatch(tx, operation.id);
    await requireAttachmentMutationReady(batch.responseId, tx, operation.id);
    const active = await tx.operation.findUnique({
      where: { id: operation.id },
    });
    const current = await tx.ecmAttachmentBatch.findUniqueOrThrow({
      where: { operationId: operation.id },
    });
    if (active?.status !== "processing" || current.state !== "prepared") {
      fail(409, "stale_operation", "การบันทึกไฟล์รอบนี้ไม่พร้อมเริ่ม");
    }
    for (const plan of plans) {
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      const overwriteIdentityIds = await admitAttachmentDestination(tx, {
        accountKey: ecm.accountKey(),
        bindingId: plan.slot.field.id,
        filename: plan.filename,
        id: plan.id,
        operationId: operation.id,
        responseId: batch.responseId,
        rowIndex: plan.slot.rowIndex,
      });
      // oxlint-disable-next-line no-await-in-loop -- Admission and intent persist in the same transaction.
      await tx.ecmAttachmentVersion.create({
        data: {
          accountKey: ecm.accountKey(),
          bindingId: plan.slot.field.id,
          category: plan.category,
          documentNumber: plan.number,
          filename: plan.filename,
          fiscalYear: plan.year,
          overwriteIdentityIds,
          storageMode: plan.slot.field.attachment?.mode ?? "legacy",
          ...(plan.slot.field.attachment?.mode === "template"
            ? {
                documentCategoryId:
                  plan.slot.field.attachment.document_category_id,
                storageTemplateId:
                  plan.slot.field.attachment.storage_template_id,
                templateName: plan.slot.field.attachment.template_name,
              }
            : {}),
          id: plan.id,
          operationId: operation.id,
          originalName: plan.file.name,
          responseId: batch.responseId,
          rowIndex: plan.slot.rowIndex,
          sizeBytes: plan.file.size,
          originalSha256: plan.sha256,
          tag: plan.slot.tag,
        },
      });
    }
  });
  for (const plan of plans) {
    const body = new FormData();
    body.set("documentFile", plan.file, plan.filename);
    body.set(
      "template",
      plan.slot.field.attachment?.mode === "template" ? "1" : "0"
    );
    if (plan.slot.field.attachment?.mode !== "template") {
      body.set("documentYear", plan.year ?? "");
      body.set("documentNumber", plan.number);
      body.set("documentCategory", plan.category);
    }
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
          await requireBatchScope(tx, operation, batch);
          const overwriteIdentityIds = await admitAttachmentDestination(
            tx,
            await tx.ecmAttachmentVersion.findUniqueOrThrow({
              where: { id: plan.id },
            })
          );
          const admitted = await tx.ecmAttachmentVersion.updateMany({
            data: {
              generation: { increment: 1 },
              overwriteIdentityIds,
              sentAt: new Date(),
              state: "started",
            },
            where: { id: plan.id, sentAt: null, state: "prepared" },
          });
          if (admitted.count !== 1) {
            fail(409, "stale_operation", "คำขอไฟล์รอบนี้เริ่มแล้ว ห้ามส่งซ้ำ");
          }
          await tx.ecmAttachmentBatch.update({
            data: { state: "sending" },
            where: { operationId: operation.id },
          });
        });
      });
      // A receipt is retained even if the Folio Operation expired while ECM was sending.
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      await prisma.$transaction(async (tx) => {
        await lockBatch(tx, operation.id);
        const attempt = await tx.ecmAttachmentVersion.findUniqueOrThrow({
          where: { id: plan.id },
        });
        const identityId = await receiveAttachmentIdentity(
          tx,
          attempt,
          receipt
        );
        const received = await tx.ecmAttachmentVersion.updateMany({
          data: {
            fileLink: receipt.file_link,
            fileToken: receipt.file_token,
            generation: { increment: 1 },
            identityId,
            receivedAt: new Date(),
            requestSettledAt: new Date(),
            state: "received",
          },
          where: { id: plan.id, state: { in: ["started", "unknown"] } },
        });
        if (received.count !== 1) {
          fail(
            409,
            "stale_operation",
            "ผลไฟล์รอบเดิมเปลี่ยนแล้ว ห้ามใช้เป็นคำตอบรอบใหม่"
          );
        }
        const current = await tx.ecmAttachmentBatch.findUniqueOrThrow({
          where: { operationId: operation.id },
        });
        if (!["prepared", "sending"].includes(current.state)) {
          await tx.ecmAttachmentCleanup.upsert({
            create: {
              formId: batch.formId,
              operationId: operation.id,
              responseId: batch.responseId,
              versionId: plan.id,
            },
            update: {},
            where: {
              operationId_versionId: {
                operationId: operation.id,
                versionId: plan.id,
              },
            },
          });
        }
      });
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      const active = await prisma.operation.findUnique({
        where: { id: operation.id },
      });
      if (active?.status !== "processing") {
        fail(409, "stale_operation", "การบันทึกรอบนี้หมดอายุแล้ว ไฟล์ใหม่รอจัดการ");
      }
      plan.target[plan.slot.field.key] = {
        ...receipt,
        original_name: plan.file.name,
        size_bytes: plan.file.size,
        ...(plan.slot.rowIndex === null
          ? {}
          : { row_index: plan.slot.rowIndex }),
      };
      checkAttachmentJsonBytes(data);
    } catch (error) {
      // A failed transport/parser is not proof that ECM did not create the file.
      // oxlint-disable-next-line no-await-in-loop -- Preserve each dispatched request's unknown outcome before cancellation.
      await prisma.ecmAttachmentVersion.updateMany({
        data: { generation: { increment: 1 }, state: "unknown" },
        where: { id: plan.id, state: "started" },
      });
      if (error instanceof HttpError) {
        fail(
          error.httpStatus,
          error.code,
          `${plan.slot.field.label}${plan.slot.rowIndex === null ? "" : ` / แถว ${plan.slot.rowIndex + 1}`} / หมวด ${plan.category}: ${error.message}`
        );
      }
      fail(
        502,
        "attachment_upload_failed",
        `${plan.slot.field.label}${plan.slot.rowIndex === null ? "" : ` / แถว ${plan.slot.rowIndex + 1}`} / หมวด ${plan.category}: ยังยืนยันผลการแนบไฟล์รอบนี้ไม่ได้ คำตอบเดิมยังอยู่ แต่ไฟล์ที่ URL เดิมอาจถูกเขียนทับแล้ว ห้ามส่งซ้ำ กรุณาติดต่อผู้ดูแล`
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
  const responseId = batch?.responseId ?? operation.responseId;
  if (!responseId) {
    return;
  }
  const response = await tx.response.findUnique({ where: { id: responseId } });
  const workspace =
    operation.targetType === "correction"
      ? await tx.editorLease.findFirst({
          where: {
            holderUserId: operation.actorId ?? "",
            targetId: responseId,
            targetType: "correction",
            workspaceDocumentKey: operation.documentKey,
          },
        })
      : null;
  if (
    !response ||
    (operation.targetType === "correction"
      ? !workspace
      : response.draftDocumentKey !== operation.documentKey)
  ) {
    fail(409, "stale_operation", "คำตอบเปลี่ยนระหว่างบันทึกไฟล์");
  }
  await requireAttachmentMutationReady(responseId, tx, operation.id);
  if (batch) {
    await requireBatchScope(tx, operation, batch);
    const active = await tx.operation.findUnique({
      where: { id: operation.id },
    });
    if (
      response.formId !== batch.formId ||
      active?.status !== "processing" ||
      !["prepared", "sending"].includes(batch.state)
    ) {
      fail(409, "stale_operation", "สิทธิ์หรือรอบบันทึกเปลี่ยนแล้ว ข้อมูลเดิมไม่ถูกแทนที่");
    }
  }
  const template = await tx.fieldManifest.findUnique({
    include: { fields: true },
    where: { publishedTemplateId: response.publishedTemplateId },
  });
  const fields =
    template?.fields.filter((candidate) => candidate.attachment) ?? [];
  if (!fields.length) {
    return;
  }
  checkAttachmentJsonBytes(data);
  const versions: string[] = [];
  const currentReferences = operation.documentKey
    ? await tx.ecmAttachmentReference.findMany({
        select: { versionId: true },
        where: { responseId, snapshotId: operation.documentKey },
      })
    : [];
  const currentVersionIds = new Set(
    currentReferences.map((reference) => reference.versionId)
  );
  for (const field of fields) {
    const { binding } = field;
    if (
      !binding ||
      typeof binding !== "object" ||
      Array.isArray(binding) ||
      typeof binding.id !== "string"
    ) {
      fail(409, "invalid_attachment", "สัญญาตำแหน่งช่องแนบเปลี่ยนแล้ว");
    }
    const column = typeof binding.offset === "number";
    const separator = field.tag.indexOf(".");
    const tableKey = column ? field.tag.slice(0, separator) : "";
    const columnKey = column ? field.tag.slice(separator + 1) : "";
    if (column && (separator < 1 || !Array.isArray(data[tableKey]))) {
      fail(409, "invalid_attachment", "ไม่พบตารางของช่องแนบ");
    }
    const values = column
      ? (data[tableKey] as Record<string, unknown>[]).map(
          (row) => row[columnKey]
        )
      : [data[field.tag]];
    for (const value of values) {
      let attachment: Attachment | null;
      if (column) {
        attachment =
          value === null || value === undefined
            ? null
            : tableAttachmentSchema.parse(value);
      } else {
        attachment = canonicalAttachment(value);
      }
      if (!attachment) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Resolve all trusted receipts before locking their versions in one order.
      const candidates = await tx.ecmAttachmentVersion.findMany({
        where: {
          OR: [
            { operationId: operation.id },
            { id: { in: [...currentVersionIds] } },
          ],
          storageMode: field.attachmentStorageMode,
          ...(field.attachmentStorageMode === "template"
            ? {
                documentCategoryId: field.attachmentCategoryId,
                storageTemplateId: field.attachmentTemplateId,
                templateName: field.attachmentTemplateName,
              }
            : {}),
          bindingId: binding.id,
          category: field.attachmentCategory ?? "",
          fileLink: attachment.file_link,
          fileToken: attachment.file_token,
          originalName: attachment.original_name,
          responseId,
          rowIndex: column ? { not: null } : null,
          sizeBytes: attachment.size_bytes,
          state: { in: ["received", "committed"] },
          tag: field.tag,
        },
      });
      const version =
        candidates.find(
          (candidate) =>
            candidate.operationId === operation.id &&
            candidate.rowIndex ===
              (column ? tableAttachmentSchema.parse(value).row_index : null)
        ) ??
        candidates.find((candidate) => currentVersionIds.has(candidate.id));
      if (
        !version ||
        (version.state === "received" && version.operationId !== operation.id)
      ) {
        fail(409, "invalid_attachment", "ไม่พบหลักฐานไฟล์ของคำตอบรอบนี้");
      }
      versions.push(version.id);
    }
  }
  const references = await tx.ecmAttachmentReference.findMany({
    where: { responseId },
  });
  const snapshots = [
    ...new Set(references.map((reference) => reference.snapshotId)),
  ];
  const [
    submissions,
    corrections,
    workspaces,
    eligibleOperations,
    otherDrafts,
  ] = await Promise.all([
    tx.submission.findMany({
      select: { documentKey: true },
      where: { documentKey: { in: snapshots } },
    }),
    tx.correction.findMany({
      select: { documentKey: true },
      where: { documentKey: { in: snapshots } },
    }),
    tx.editorLease.findMany({
      select: { workspaceBaseDocumentKey: true, workspaceDocumentKey: true },
      where: {
        OR: [
          { workspaceDocumentKey: { in: snapshots } },
          { workspaceBaseDocumentKey: { in: snapshots } },
        ],
      },
    }),
    tx.operation.findMany({
      select: { documentKey: true },
      where: {
        documentKey: { in: snapshots },
        id: { not: operation.id },
        status: { in: ["pending", "processing"] },
      },
    }),
    tx.response.findMany({
      select: { draftDocumentKey: true },
      where: { draftDocumentKey: { in: snapshots }, id: { not: responseId } },
    }),
  ]);
  const protectedSnapshots = new Set([
    snapshotId,
    ...submissions.map((entry) => entry.documentKey),
    ...corrections.map((entry) => entry.documentKey),
    ...workspaces.flatMap((entry) => [
      ...(operation.targetType === "correction" &&
      entry.workspaceDocumentKey === operation.documentKey
        ? []
        : [entry.workspaceDocumentKey]),
      entry.workspaceBaseDocumentKey,
    ]),
    ...eligibleOperations.map((entry) => entry.documentKey),
    ...otherDrafts.map((entry) => entry.draftDocumentKey),
  ]);
  const retired = references.filter(
    (reference) => !protectedSnapshots.has(reference.snapshotId)
  );
  const lockedIds = [
    ...new Set([
      ...versions,
      ...retired.map((reference) => reference.versionId),
    ]),
  ].toSorted();
  if (lockedIds.length) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" IN (${Prisma.join(lockedIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "id" FOR UPDATE`
    );
  }
  for (const versionId of versions) {
    // oxlint-disable-next-line no-await-in-loop -- Recheck after the shared reference-versus-delete version fence.
    const current = await tx.ecmAttachmentVersion.findUniqueOrThrow({
      where: { id: versionId },
    });
    if (
      !["received", "committed"].includes(current.state) ||
      (current.state === "received" && current.operationId !== operation.id)
    ) {
      fail(409, "invalid_attachment", "ไฟล์นี้อยู่ระหว่างจัดการลบ");
    }
    // oxlint-disable-next-line no-await-in-loop -- References share the resource and destination admission fence.
    await requireAttachmentReferenceReady(tx, current, operation.id);
    // oxlint-disable-next-line no-await-in-loop -- Acquire every new canonical reference before retiring the previous Draft.
    await tx.ecmAttachmentReference.upsert({
      create: { responseId, snapshotId, versionId },
      update: {},
      where: { versionId_snapshotId: { snapshotId, versionId } },
    });
  }
  if (retired.length) {
    await tx.ecmAttachmentReference.deleteMany({
      where: {
        OR: retired.map(({ versionId, snapshotId: previousSnapshot }) => ({
          snapshotId: previousSnapshot,
          versionId,
        })),
        responseId,
      },
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
  for (const versionId of new Set(
    retired.map((reference) => reference.versionId)
  )) {
    // oxlint-disable-next-line no-await-in-loop -- Persist only this transition's newly eligible cleanup intent.
    const version = await tx.ecmAttachmentVersion.findUnique({
      where: { id: versionId },
    });
    let remaining = true;
    if (version) {
      // oxlint-disable-next-line no-await-in-loop -- Count every shared-identity alias before scheduling deletion.
      remaining = await attachmentIdentityReferenced(tx, version);
    }
    // oxlint-disable-next-line no-await-in-loop -- Earlier pending or uncertain cleanup is never automatically retried.
    const previous = await tx.ecmAttachmentCleanup.findFirst({
      where: {
        state: { in: ["pending", "claimed", "started", "unknown"] },
        versionId,
      },
    });
    // Shared provider identities retain all attempt evidence without scheduling duplicate DELETE.
    if (!remaining && !previous && version?.state === "committed") {
      // oxlint-disable-next-line no-await-in-loop -- Internal transitions retain intent without dispatching an ECM write.
      await tx.ecmAttachmentCleanup.create({
        data: {
          formId: response.formId,
          operationId: operation.id,
          responseId,
          versionId,
        },
      });
    }
  }
  if (batch) {
    await tx.ecmAttachmentBatch.update({
      data: { state: "committed" },
      where: { operationId: operation.id },
    });
  }
};

/** Retire every snapshot in the same transaction as whole-Response deletion. */
/* oxlint-disable complexity no-await-in-loop -- Snapshot retirement and intent selection share ordered version locks in one transaction. */
export const retireResponseAttachments = async (
  tx: Prisma.TransactionClient,
  responseId: string,
  formId: string,
  deletionCaseId: string
) => {
  await lockAttachmentLedger(tx);
  const batches = await tx.ecmAttachmentBatch.findMany({
    orderBy: { operationId: "asc" },
    where: { responseId },
  });
  for (const batch of batches) {
    await lockBatch(tx, batch.operationId);
  }
  await requireAttachmentMutationReady(responseId, tx);
  const references = await tx.ecmAttachmentReference.findMany({
    where: { responseId },
  });
  const cleanups = await tx.ecmAttachmentCleanup.findMany({
    where: { responseId },
  });
  const versions = await tx.ecmAttachmentVersion.findMany({
    orderBy: { id: "asc" },
    where: {
      OR: [
        { responseId },
        {
          id: {
            in: [
              ...references.map((reference) => reference.versionId),
              ...cleanups.map((cleanup) => cleanup.versionId),
            ],
          },
        },
      ],
    },
  });
  if (versions.length) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" IN (${Prisma.join(versions.map((version) => Prisma.sql`${version.id}::uuid`))}) ORDER BY "id" FOR UPDATE`
    );
  }
  // A missing batch never turns an unsettled sender into permission to delete data.
  const unsettled = await tx.ecmAttachmentVersion.count({
    where: {
      responseId,
      state: { in: ["prepared", "started", "unknown", "received"] },
    },
  });
  if (unsettled) {
    fail(
      409,
      "attachment_outcome_unresolved",
      "ยังยืนยันคำขอแนบเดิมไม่ได้ กรุณาติดต่อผู้ดูแล ห้ามลบคำตอบหรือส่งไฟล์ซ้ำ"
    );
  }
  await tx.ecmAttachmentReference.deleteMany({ where: { responseId } });
  await tx.ecmAttachmentCleanup.updateMany({
    data: { deletionCaseId },
    where: { responseId },
  });
  const initial: { operationId: string; versionId: string }[] = [];
  for (const version of versions) {
    const remaining = await attachmentIdentityReferenced(tx, version);
    const previous = await tx.ecmAttachmentCleanup.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        state: { in: ["pending", "claimed", "started", "unknown"] },
        versionId: version.id,
      },
    });
    if (previous) {
      await tx.ecmAttachmentCleanup.update({
        data: {
          deletionCaseId,
          ...(remaining && previous.state === "pending" && !previous.attemptedAt
            ? { state: "protected" }
            : {}),
        },
        where: {
          operationId_versionId: {
            operationId: previous.operationId,
            versionId: version.id,
          },
        },
      });
      if (
        !remaining &&
        previous.state === "pending" &&
        !previous.attemptedAt &&
        version.state === "committed"
      ) {
        initial.push({
          operationId: previous.operationId,
          versionId: version.id,
        });
      }
      continue;
    }
    if (remaining || version.state !== "committed") {
      continue;
    }
    const key = {
      operationId_versionId: {
        operationId: version.operationId,
        versionId: version.id,
      },
    };
    const retired = await tx.ecmAttachmentCleanup.findUnique({ where: key });
    if (retired?.attemptedAt) {
      continue;
    }
    await tx.ecmAttachmentCleanup.upsert({
      create: {
        deletionCaseId,
        formId,
        operationId: version.operationId,
        responseId,
        versionId: version.id,
      },
      update: { deletionCaseId, state: "pending" },
      where: key,
    });
    initial.push({ operationId: version.operationId, versionId: version.id });
  }
  return {
    context: {
      batches: batches.map((batch) => ({
        generation: batch.generation,
        operationId: batch.operationId,
        state: batch.state,
      })),
      cleanups: cleanups.map((cleanup) => ({
        attemptedAt: cleanup.attemptedAt?.toISOString() ?? null,
        operationId: cleanup.operationId,
        state: cleanup.state,
        versionId: cleanup.versionId,
      })),
      references,
      versions: versions.map((version) => ({
        id: version.id,
        operationId: version.operationId,
      })),
    },
    initial,
  };
};
/* oxlint-enable complexity no-await-in-loop */

/** Only verified receipts and a fenced sender permit the first DELETE; no uncertain request is retried. */
export const deleteAttachmentCleanup = async (
  operationId: string,
  versionId: string,
  ecm: EcmClient,
  operator?: { id: string; generation: number }
): Promise<void> => {
  const key = { operationId_versionId: { operationId, versionId } };
  const version = await prisma.$transaction(async (tx) => {
    await lockBatch(tx, operationId);
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" = ${versionId}::uuid FOR UPDATE`
    );
    if (operator) {
      const actor = await tx.user.findFirst({
        where: { enabled: true, id: operator.id, role: "admin" },
      });
      if (!actor) {
        fail(403, "forbidden", "เฉพาะ Admin ที่ยังมีสิทธิ์เท่านั้นจัดการไฟล์ค้างได้");
      }
    }
    let intent = await tx.ecmAttachmentCleanup.findUnique({ where: key });
    const owned = await tx.ecmAttachmentVersion.findFirst({
      where: {
        accountKey: ecm.accountKey(),
        fileLink: { not: null },
        fileToken: { not: null },
        id: versionId,
        requestSettledAt: { not: null },
        state: { in: ["received", "committed"] },
        ...(operator ? { generation: operator.generation } : {}),
      },
    });
    const batch = await tx.ecmAttachmentBatch.findUnique({
      where: { operationId },
    });
    if (!owned?.requestSettledAt) {
      fail(
        409,
        "attachment_outcome_unresolved",
        "ยังไม่มีหลักฐานคำขอเดิมที่ตรงกับ generation และบัญชี Folio ปัจจุบัน"
      );
    }
    if (owned.state === "received") {
      if (
        owned.operationId !== operationId ||
        !batch ||
        !["canceling", "cleanup-pending"].includes(batch.state)
      ) {
        fail(
          409,
          "attachment_outcome_unresolved",
          "sender เดิมยังไม่ได้ถูก fence ห้ามลบไฟล์รอบนี้"
        );
      }
      if (!intent && operator) {
        intent = await tx.ecmAttachmentCleanup.create({
          data: {
            formId: batch.formId,
            operationId,
            responseId: owned.responseId,
            versionId,
          },
        });
      }
    }
    if (!intent || intent.state !== "pending" || intent.attemptedAt) {
      fail(
        409,
        "attachment_outcome_unresolved",
        "ไม่มี cleanup ที่ยังไม่เคยส่ง DELETE ห้ามส่งคำขอลบซ้ำ กรุณาประสาน PM/ECM"
      );
    }
    await requireAttachmentDeleteReady(tx, owned);
    if (await attachmentIdentityReferenced(tx, owned)) {
      await tx.ecmAttachmentCleanup.update({
        data: { state: "protected" },
        where: key,
      });
      return null;
    }
    const evidence = {
      batchGeneration: batch ? batch.generation : null,
      noReferences: true,
      requestSettledAt: owned.requestSettledAt.toISOString(),
      senderFence: batch ? batch.state : "committed-version",
      source: "verified-upload-receipt",
      versionGeneration: owned.generation,
    };
    await tx.ecmAttachmentCleanup.update({
      data: {
        evidence,
        generation: { increment: 1 },
        state: "claimed",
        ...(operator ? { confirmedBy: operator.id } : {}),
      },
      where: key,
    });
    await tx.ecmAttachmentIdentity.update({
      data: { state: "deleting" },
      where: { id: owned.identityId ?? "" },
    });
    const claimed = await tx.ecmAttachmentVersion.update({
      data: { generation: { increment: 1 }, state: "deleting" },
      where: { id: versionId },
    });
    return { ...claimed, previousState: owned.state };
  });
  if (!version) {
    if (operator) {
      fail(
        409,
        "attachment_referenced",
        "ไฟล์ยังมีข้อมูลหรือประวัติอ้างอิงอยู่ ไม่สามารถลบได้"
      );
    }
    return;
  }
  if (!version.fileToken) {
    fail(409, "attachment_outcome_unresolved", "ไม่มีหลักฐานไฟล์สำหรับคำขอลบ");
  }
  try {
    await ecm.deleteFile(version.fileToken, async () => {
      await prisma.$transaction(async (tx) => {
        await lockBatch(tx, operationId);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" = ${versionId}::uuid FOR UPDATE`
        );
        const current = await tx.ecmAttachmentVersion.findUniqueOrThrow({
          where: { id: versionId },
        });
        const intent = await tx.ecmAttachmentCleanup.findUniqueOrThrow({
          where: key,
        });
        const actor = operator
          ? await tx.user.findFirst({
              where: { enabled: true, id: operator.id, role: "admin" },
            })
          : null;
        if (
          current.state !== "deleting" ||
          current.generation !== version.generation ||
          intent.state !== "claimed" ||
          intent.attemptedAt ||
          (operator && !actor) ||
          (await attachmentIdentityReferenced(tx, current))
        ) {
          fail(
            409,
            "attachment_outcome_unresolved",
            "สิทธิ์หรือหลักฐานเปลี่ยนก่อนส่งคำขอลบ"
          );
        }
        await requireAttachmentDeleteReady(tx, current);
        await tx.ecmAttachmentCleanup.update({
          data: { attemptedAt: new Date(), state: "started" },
          where: key,
        });
        if (operator) {
          await tx.auditEvent.create({
            data: {
              action: "ecm_attachment_cleanup_started",
              actorId: operator.id,
              outcome: "success",
              safeMetadata: {
                generation: version.generation,
                operationId,
                versionId,
              },
              targetId: intent.responseId,
              targetType: "attachment-follow-up",
            },
          });
        }
      });
    });
    await prisma.$transaction(async (tx) => {
      await lockAttachmentLedger(tx);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" = ${versionId}::uuid FOR UPDATE`
      );
      const current = await tx.ecmAttachmentVersion.findUniqueOrThrow({
        where: { id: versionId },
      });
      if (
        current.state !== "deleting" ||
        current.generation !== version.generation
      ) {
        fail(
          409,
          "attachment_outcome_unresolved",
          "หลักฐานการลบเปลี่ยนแล้ว กรุณาติดต่อผู้ดูแล"
        );
      }
      const aliases = await identityVersionIds(tx, current);
      await tx.ecmAttachmentVersion.updateMany({
        data: { generation: { increment: 1 }, state: "deleted" },
        where: { id: { in: aliases } },
      });
      await tx.ecmAttachmentIdentity.update({
        data: { state: "deleted" },
        where: { id: current.identityId ?? "" },
      });
      await tx.ecmAttachmentCleanup.updateMany({
        data: {
          confirmedAt: new Date(),
          evidence: {
            deleteProof: "verified-shared-identity-delete-response",
            sourceVersionId: versionId,
          },
          state: "deleted",
        },
        where: {
          attemptedAt: null,
          state: "pending",
          versionId: { in: aliases },
        },
      });
      const cleanup = await tx.ecmAttachmentCleanup.findUniqueOrThrow({
        where: key,
      });
      await tx.ecmAttachmentCleanup.update({
        data: {
          confirmedAt: new Date(),
          evidence: {
            ...(cleanup.evidence &&
            typeof cleanup.evidence === "object" &&
            !Array.isArray(cleanup.evidence)
              ? cleanup.evidence
              : {}),
            deleteProof: "verified-delete-response",
          },
          state: "deleted",
        },
        where: key,
      });
      if (operator) {
        await tx.auditEvent.create({
          data: {
            action: "ecm_attachment_cleanup_confirmed",
            actorId: operator.id,
            outcome: "success",
            safeMetadata: {
              operationId,
              proof: "verified-delete-response",
              versionId,
            },
            targetId: version.responseId,
            targetType: "attachment-follow-up",
          },
        });
      }
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await lockAttachmentLedger(tx);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" = ${versionId}::uuid FOR UPDATE`
      );
      const intent = await tx.ecmAttachmentCleanup.findUniqueOrThrow({
        where: key,
      });
      if (intent.state === "deleted") {
        return;
      }
      // Only the durable beforeSend marker distinguishes never-dispatched work from unknown deletion.
      await tx.ecmAttachmentCleanup.update({
        data: { state: intent.attemptedAt ? "unknown" : "pending" },
        where: key,
      });
      if (!intent.attemptedAt) {
        await tx.ecmAttachmentIdentity.update({
          data: { state: "active" },
          where: { id: version.identityId ?? "" },
        });
        await tx.ecmAttachmentVersion.updateMany({
          data: {
            generation: { increment: 1 },
            state: version.previousState,
          },
          where: {
            generation: version.generation,
            id: versionId,
            state: "deleting",
          },
        });
      }
      if (operator) {
        await tx.auditEvent.create({
          data: {
            action: "ecm_attachment_cleanup_failed",
            actorId: operator.id,
            outcome: "failure",
            safeMetadata: {
              dispatched: intent.attemptedAt !== null,
              operationId,
              versionId,
            },
            targetId: version.responseId,
            targetType: "attachment-follow-up",
          },
        });
      }
    });
    throw error;
  }
};

export const settleCanceledAttachmentBatch = async (
  operationId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<void> => {
  await lockBatch(tx, operationId);
  const batch = await tx.ecmAttachmentBatch.findUnique({
    where: { operationId },
  });
  if (!batch || !["canceling", "cleanup-pending"].includes(batch.state)) {
    return;
  }
  const remaining = await tx.ecmAttachmentVersion.count({
    where: { operationId, state: { notIn: ["canceled", "deleted"] } },
  });
  await tx.ecmAttachmentBatch.update({
    data: {
      generation: { increment: 1 },
      state: remaining ? "cleanup-pending" : "canceled",
    },
    where: { operationId },
  });
};

export const cleanupCommittedAttachments = async (
  operationId: string,
  ecm: EcmClient
): Promise<void> => {
  const batch = await prisma.ecmAttachmentBatch.findUnique({
    where: { operationId },
  });
  if (batch?.state !== "committed") {
    return;
  }
  const intents = await prisma.ecmAttachmentCleanup.findMany({
    where: { attemptedAt: null, operationId, state: "pending" },
  });
  for (const intent of intents) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Only this explicit operation's initial DELETE is dispatched.
      await deleteAttachmentCleanup(operationId, intent.versionId, ecm);
    } catch {
      // A committed snapshot stays usable; the durable cleanup record retains the warning.
    }
  }
};

/** Fence future dispatch/commit without treating timeout or restart as remote settlement. */
export const fenceAttachmentBatch = async (
  tx: Prisma.TransactionClient,
  operationId: string
): Promise<boolean> => {
  await lockBatch(tx, operationId);
  const current = await tx.ecmAttachmentBatch.findUnique({
    where: { operationId },
  });
  if (!current || ["committed", "canceled"].includes(current.state)) {
    return false;
  }
  const operation = await tx.operation.findUnique({
    where: { id: operationId },
  });
  if (operation?.status === "completed") {
    return false;
  }
  const initial =
    ["prepared", "sending"].includes(current.state) &&
    operation?.status === "processing";
  await tx.ecmAttachmentBatch.update({
    data: { generation: { increment: 1 }, state: "canceling" },
    where: { operationId },
  });
  await tx.ecmAttachmentVersion.updateMany({
    data: { generation: { increment: 1 }, state: "canceled" },
    where: { operationId, sentAt: null, state: "prepared" },
  });
  await tx.ecmAttachmentVersion.updateMany({
    data: { generation: { increment: 1 }, state: "unknown" },
    where: { operationId, state: "started" },
  });
  const receipts = await tx.ecmAttachmentVersion.findMany({
    where: { operationId, state: "received" },
  });
  for (const receipt of receipts) {
    // oxlint-disable-next-line no-await-in-loop -- Retain every canceled receipt independently of the Response.
    await tx.ecmAttachmentCleanup.upsert({
      create: {
        formId: current.formId,
        operationId,
        responseId: current.responseId,
        versionId: receipt.id,
      },
      update: {},
      where: { operationId_versionId: { operationId, versionId: receipt.id } },
    });
  }
  await settleCanceledAttachmentBatch(operationId, tx);
  return initial;
};

export const cancelAttachmentBatch = async (
  operationId: string,
  ecm: EcmClient
): Promise<void> => {
  const initial = await prisma.$transaction((tx) =>
    fenceAttachmentBatch(tx, operationId)
  );
  if (initial) {
    const receipts = await prisma.ecmAttachmentCleanup.findMany({
      where: { attemptedAt: null, operationId, state: "pending" },
    });
    for (const receipt of receipts) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Cleanup belongs only to the initial user-started cancellation.
        await deleteAttachmentCleanup(operationId, receipt.versionId, ecm);
      } catch {
        // Unknown or protected cleanup remains a mutation hold, never an automatic retry.
      }
    }
  }
  await prisma.$transaction((tx) =>
    settleCanceledAttachmentBatch(operationId, tx)
  );
};
