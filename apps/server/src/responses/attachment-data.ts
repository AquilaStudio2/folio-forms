import { z } from "zod";

import { fail } from "../http/errors";

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
