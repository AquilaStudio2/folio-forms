import { Prisma, prisma } from "@onlyoffice/db";

import type { SpreadsheetContract } from "../documents/spreadsheets/contract";
import { extractSpreadsheetData } from "../documents/spreadsheets/workbook";
import type { SpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
import { fail, HttpError } from "../http/errors";
import type { Operation } from "../model-types";
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

export const attachmentCleanupWarning = async (
  responseId: string
): Promise<string | null> => {
  const pending = await prisma.ecmAttachmentCleanup.findFirst({
    select: { versionId: true },
    where: { responseId, state: { in: ["pending", "started", "unknown"] } },
  });
  return pending
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
  year: string;
}

const planAttachmentFile = (
  slot: AttachmentSlot,
  target: Record<string, unknown>,
  file: File,
  data: Record<string, unknown>
): AttachmentPlan => {
  const { field } = slot;
  const label = `${field.label}${slot.rowIndex === null ? "" : ` / แถว ${slot.rowIndex + 1}`}`;
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
    fail(422, "invalid_attachment", `${label}: ชื่อหรือขนาดไฟล์ไม่ถูกต้อง`);
  }
  const id = crypto.randomUUID();
  const dot = file.name.lastIndexOf(".");
  const extension = dot > 0 ? file.name.slice(dot) : "";
  if (extension) {
    safeFilenamePart(extension.slice(1), label);
  }
  const filename = safeFilenamePart(
    `${number}-${id}-${category}${extension}`,
    label
  );
  if (filename.trim() !== filename || /[. ]$/u.test(filename)) {
    fail(
      422,
      "invalid_attachment_metadata",
      `${label}: ชื่อไฟล์รวมไม่ปลอดภัย กรุณาตรวจ docs_number และให้ Admin ตรวจหมวดเอกสาร`
    );
  }
  return { category, file, filename, id, number, slot, target, year };
};

const originalForChangedMetadata = async (
  slot: AttachmentSlot,
  saved: Attachment,
  responseId: string,
  data: Record<string, unknown>,
  ecm: EcmClient
): Promise<File | undefined> => {
  const { field } = slot;
  const label = `${field.label}${slot.rowIndex === null ? "" : ` / แถว ${slot.rowIndex + 1}`}`;
  const version = await prisma.ecmAttachmentVersion.findFirst({
    where: {
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
    version.fiscalYear === String(data.fiscal_year ?? "") &&
    version.documentNumber === String(data.docs_number ?? "")
  ) {
    return undefined;
  }
  try {
    if (version.accountKey !== ecm.accountKey()) {
      fail(409, "invalid_attachment", "บัญชีเอกสารแนบไม่ตรงกับไฟล์เดิม");
    }
    const original = await ecm.originalBytes(saved.file_link, saved.size_bytes);
    return new File([original], saved.original_name);
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
    input.operation.type === "submit_response",
    attachments,
    new Set(input.files.keys())
  );
  if (input.operation.type === "submit_response" && extracted.errors.length) {
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
    if (!file && saved) {
      // Only an owned committed receipt can supply original bytes or metadata.
      // oxlint-disable-next-line no-await-in-loop -- Fetch and validate every original before the first external write.
      file = await originalForChangedMetadata(
        slot,
        saved,
        responseId,
        data,
        ecm
      );
    }
    if (file) {
      plans.push(planAttachmentFile(slot, target, file, data));
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
    if (active?.status !== "processing" || batch.state !== "prepared") {
      fail(409, "stale_operation", "การบันทึกไฟล์รอบนี้ไม่พร้อมเริ่ม");
    }
    for (const plan of plans) {
      // oxlint-disable-next-line no-await-in-loop -- Persist or settle each version before the next external mutation.
      await tx.ecmAttachmentVersion.create({
        data: {
          accountKey: ecm.accountKey(),
          bindingId: plan.slot.field.id,
          category: plan.category,
          documentNumber: plan.number,
          filename: plan.filename,
          fiscalYear: plan.year,
          id: plan.id,
          operationId: operation.id,
          originalName: plan.file.name,
          responseId: batch.responseId,
          rowIndex: plan.slot.rowIndex,
          sizeBytes: plan.file.size,
          tag: plan.slot.tag,
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
        `${plan.slot.field.label}${plan.slot.rowIndex === null ? "" : ` / แถว ${plan.slot.rowIndex + 1}`} / หมวด ${plan.category}: ยังยืนยันผลการแนบไฟล์รอบนี้ไม่ได้ ข้อมูลเดิมยังอยู่`
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
    const actor = await tx.user.findFirst({
      where: { enabled: true, id: batch.actorId, role: { not: "viewer" } },
    });
    const lease = await tx.editorLease.findFirst({
      where: {
        expiresAt: { gt: new Date() },
        holderSessionId: batch.authSessionId,
        holderUserId: batch.actorId,
        id: batch.leaseId,
        targetId: responseId,
        targetType: "response",
      },
    });
    const active = await tx.operation.findUnique({
      where: { id: operation.id },
    });
    if (
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
      const version = await tx.ecmAttachmentVersion.findFirst({
        where: {
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
  if (batch) {
    for (const versionId of new Set(
      retired.map((reference) => reference.versionId)
    )) {
      // oxlint-disable-next-line no-await-in-loop -- Persist only this explicit operation's newly eligible cleanup intent.
      const remaining = await tx.ecmAttachmentReference.count({
        where: { versionId },
      });
      // oxlint-disable-next-line no-await-in-loop -- Earlier pending or uncertain cleanup is never automatically retried.
      const previous = await tx.ecmAttachmentCleanup.findFirst({
        where: { state: { in: ["pending", "started", "unknown"] }, versionId },
      });
      // oxlint-disable-next-line no-await-in-loop -- All candidates are already held under the version-row fence.
      const version = await tx.ecmAttachmentVersion.findUnique({
        where: { id: versionId },
      });
      if (!remaining && !previous && version?.state === "committed") {
        // oxlint-disable-next-line no-await-in-loop -- Cleanup intent commits atomically with the new canonical snapshot.
        await tx.ecmAttachmentCleanup.create({
          data: { operationId: operation.id, responseId, versionId },
        });
      }
    }
    await tx.ecmAttachmentBatch.update({
      data: { state: "committed" },
      where: { operationId: operation.id },
    });
  }
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
    where: { operationId, state: "pending" },
  });
  for (const intent of intents) {
    const key = {
      operationId_versionId: { operationId, versionId: intent.versionId },
    };
    try {
      // oxlint-disable-next-line no-await-in-loop -- Claim each initial deletion exactly once before any network dispatch.
      const version = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "ecm_attachment_versions" WHERE "id" = ${intent.versionId}::uuid FOR UPDATE`
        );
        const current = await tx.ecmAttachmentCleanup.findUniqueOrThrow({
          where: key,
        });
        if (current.state !== "pending") {
          return null;
        }
        if (
          await tx.ecmAttachmentReference.count({
            where: { versionId: intent.versionId },
          })
        ) {
          await tx.ecmAttachmentCleanup.update({
            data: { state: "protected" },
            where: key,
          });
          return null;
        }
        const owned = await tx.ecmAttachmentVersion.findUniqueOrThrow({
          where: { id: intent.versionId },
        });
        if (
          owned.state !== "committed" ||
          !owned.fileToken ||
          owned.accountKey !== ecm.accountKey()
        ) {
          await tx.ecmAttachmentCleanup.update({
            data: { state: "unknown" },
            where: key,
          });
          return null;
        }
        await tx.ecmAttachmentCleanup.update({
          data: { attemptedAt: new Date(), state: "started" },
          where: key,
        });
        await tx.ecmAttachmentVersion.update({
          data: { state: "deleting" },
          where: { id: owned.id },
        });
        return owned;
      });
      if (!version?.fileToken) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Do not resend an uncertain DELETE or start the next one before settlement.
      await ecm.deleteFile(version.fileToken);
      // oxlint-disable-next-line no-await-in-loop -- Retain the confirmed deletion and its initiating operation together.
      await prisma.$transaction(async (tx) => {
        await tx.ecmAttachmentVersion.update({
          data: { state: "deleted" },
          where: { id: version.id },
        });
        await tx.ecmAttachmentCleanup.update({
          data: { state: "deleted" },
          where: key,
        });
      });
    } catch {
      // oxlint-disable-next-line no-await-in-loop -- A saved snapshot stays usable; this durable warning is not a mutation hold.
      await prisma.ecmAttachmentCleanup.updateMany({
        data: { state: "unknown" },
        where: {
          operationId,
          state: { in: ["pending", "started"] },
          versionId: intent.versionId,
        },
      });
    }
  }
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
