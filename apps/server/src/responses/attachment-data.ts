import { z } from "zod";

import { spreadsheetColumnName } from "../documents/spreadsheets/contract";
import type {
  SpreadsheetBindings,
  SpreadsheetContract,
  SpreadsheetField,
  SpreadsheetColumn,
} from "../documents/spreadsheets/contract";
import { fail } from "../http/errors";

const minimumAttachmentUploadBytes = 2;
const attachmentUploadSizeMessage =
  "รองรับการอัปโหลดไฟล์ที่มีขนาดมากกว่า 1 bytes และไม่เกิน 10 MB";
const attachmentUploadTypeMessage =
  "รองรับเฉพาะไฟล์ PDF, DOCX, XLSX, PNG และ TXT";

const attachmentUploadExtensions = new Set([
  "pdf",
  "docx",
  "xlsx",
  "png",
  "txt",
]);
export const attachmentUploadIssue = (
  name: string,
  size: number
): string | null => {
  if (size < minimumAttachmentUploadBytes || size > 10_000_000) {
    return attachmentUploadSizeMessage;
  }
  const dot = name.lastIndexOf(".");
  return dot > 0 &&
    attachmentUploadExtensions.has(name.slice(dot + 1).toLowerCase())
    ? null
    : attachmentUploadTypeMessage;
};

const safeLink = z.url().refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  );
});
export const attachmentSchema = z.strictObject({
  file_link: safeLink,
  file_token: z.string().min(1).max(16_384),
  original_name: z
    .string()
    .min(1)
    .max(512)
    .refine(
      (name) => !/[\\/\p{Cc}]/u.test(name) && name !== "." && name !== ".."
    ),
  size_bytes: z.number().int().min(0).max(10_000_000),
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const tableAttachmentSchema = attachmentSchema.extend({
  row_index: z.number().int().nonnegative(),
});
export type TableAttachment = z.infer<typeof tableAttachmentSchema>;
export interface AttachmentSlot {
  field: SpreadsheetField | SpreadsheetColumn;
  tag: string;
  rowIndex: number | null;
  tableKey?: string;
  address: string;
  key: string;
}
export const attachmentSlotKey = (
  bindingId: string,
  rowIndex: number | null
): string => JSON.stringify([bindingId, rowIndex]);
export const hasSpreadsheetAttachments = (
  bindings: SpreadsheetBindings | undefined
): bindings is SpreadsheetBindings =>
  Boolean(
    bindings?.fields.some((field) => field.attachment) ||
    bindings?.table?.columns.some((column) => column.attachment)
  );

/**
 * Positions come only from the contract resolved against the current trusted workbook.
 * @yields {AttachmentSlot} A scalar or physical table-row attachment slot.
 */
export const spreadsheetAttachmentSlots = function* spreadsheetAttachmentSlots(
  contract: SpreadsheetContract
): Generator<AttachmentSlot> {
  for (const field of contract.fields) {
    if (!field.attachment) {
      continue;
    }
    const range = contract.locations[field.anchor];
    if (!range) {
      fail(409, "invalid_attachment", "ไม่พบตำแหน่งช่องแนบในเอกสารปัจจุบัน");
    }
    yield {
      address: `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}`,
      field,
      key: attachmentSlotKey(field.id, null),
      rowIndex: null,
      tag: field.key,
    };
  }
  const { table } = contract;
  if (!table) {
    return;
  }
  const body = contract.locations[table.anchor];
  if (!body) {
    fail(409, "invalid_attachment", "ไม่พบตำแหน่งตารางในเอกสารปัจจุบัน");
  }
  for (
    let rowIndex = 0;
    rowIndex <= body.lastRow - body.firstRow;
    rowIndex += 1
  ) {
    for (const field of table.columns) {
      if (field.attachment) {
        yield {
          address: `${spreadsheetColumnName(body.firstColumn + field.offset)}${body.firstRow + rowIndex + 1}`,
          field,
          key: attachmentSlotKey(field.id, rowIndex),
          rowIndex,
          tableKey: table.key,
          tag: `${table.key}.${field.key}`,
        };
      }
    }
  }
};

export const canonicalTableAttachments = (
  data: Record<string, unknown>,
  tableKey: string,
  columnKeys: readonly string[],
  rowCount: number
): Map<number, Record<string, TableAttachment>> => {
  const rows = new Map<number, Record<string, TableAttachment>>();
  const supplied = data[tableKey];
  if (supplied === null || supplied === undefined) {
    return rows;
  }
  if (!Array.isArray(supplied)) {
    fail(422, "invalid_attachment", "ข้อมูลแถวของไฟล์แนบไม่ถูกต้อง");
  }
  for (const row of supplied) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      fail(422, "invalid_attachment", "ข้อมูลแถวของไฟล์แนบไม่ถูกต้อง");
    }
    let physicalRow: number | undefined;
    for (const key of columnKeys) {
      const value: unknown = row[key];
      if (value === null || value === undefined) {
        continue;
      }
      const parsed = tableAttachmentSchema.safeParse(value);
      if (
        !parsed.success ||
        parsed.data.row_index >= rowCount ||
        (physicalRow === undefined && rows.has(parsed.data.row_index)) ||
        (physicalRow !== undefined && physicalRow !== parsed.data.row_index)
      ) {
        fail(409, "invalid_attachment", "ตำแหน่งไฟล์แนบรายแถวไม่ตรงกับเอกสารปัจจุบัน");
      }
      physicalRow = parsed.data.row_index;
      const attachments = rows.get(physicalRow) ?? {};
      if (Object.hasOwn(attachments, key)) {
        fail(409, "invalid_attachment", "ตำแหน่งไฟล์แนบรายแถวซ้ำ");
      }
      attachments[key] = parsed.data;
      rows.set(physicalRow, attachments);
    }
  }
  return rows;
};
export const canonicalAttachment = (value: unknown): Attachment | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = attachmentSchema.safeParse(value);
  if (!parsed.success) {
    fail(422, "invalid_attachment", "ข้อมูลไฟล์แนบที่บันทึกไม่ถูกต้อง กรุณาติดต่อผู้ดูแล");
  }
  return parsed.data;
};
export const checkAttachmentJsonBytes = (
  data: Record<string, unknown>
): void => {
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 262_144) {
    fail(
      413,
      "attachment_data_too_large",
      "ข้อมูลคำตอบรวมไฟล์แนบเกิน 262,144 UTF-8 bytes"
    );
  }
};
