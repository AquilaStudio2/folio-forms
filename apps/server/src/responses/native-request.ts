import { z } from "zod";

import { maxTemplateArchiveExpandedBytes } from "../documents/package";
import type {
  ResponsePictureDimensions,
  ResponsePictureManifestField,
} from "../documents/pictures";
import {
  responsePictureImageDimensions,
  invalidResponsePicture,
  validateResponsePictureMediaBytes,
} from "../documents/pictures";
import type {
  SpreadsheetBindings,
  SpreadsheetContract,
} from "../documents/spreadsheets/contract";
import { fail } from "../http/errors";
import {
  maxTemplateMultipartOverheadBytes,
  readJsonRecord,
  readRequestBytes,
  asRecord,
} from "../http/input";
import type { JsonRecord } from "../model-types";
import { attachmentSlotKey } from "./attachment-data";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import { maxResponseDataBytes } from "./data";

const maxNativePictureMultipartOverheadBytes =
  maxResponseDataBytes + maxTemplateMultipartOverheadBytes;

export interface NativePictureUpload {
  bytes: Uint8Array;
  dimensions: ResponsePictureDimensions;
}
interface NativeResponseUploadedFile {
  arrayBuffer: () => Promise<ArrayBuffer>;
  size: number;
  type: string;
}
type NativeResponseMultipartEntry = string | NativeResponseUploadedFile;

interface NativeResponseRequest {
  input: JsonRecord;
  pictures: Map<string, NativePictureUpload>;
  attachments: Map<string, File>;
}

const validateAttachmentRemovals = (
  input: JsonRecord,
  bindings: SpreadsheetBindings | undefined,
  files: ReadonlyMap<string, File>
): void => {
  const parsed = z
    .array(
      z
        .object({
          bindingId: z.string().min(1),
          rowIndex: z.number().int().nonnegative().nullable(),
        })
        .strict()
    )
    .safeParse(input.attachmentRemovals ?? []);
  if (!parsed.success || input.attachmentRemovals === null) {
    fail(400, "invalid_attachment", "คำสั่งนำไฟล์ออกไม่ตรงกับช่องแนบ");
  }
  const seen = new Set<string>();
  for (const removal of parsed.data) {
    const key = attachmentSlotKey(removal.bindingId, removal.rowIndex);
    const field =
      removal.rowIndex === null
        ? bindings?.fields.find(
            (candidate) => candidate.id === removal.bindingId
          )
        : bindings?.table?.columns.find(
            (candidate) => candidate.id === removal.bindingId
          );
    if (seen.has(key) || files.has(key) || !field?.attachment) {
      fail(400, "invalid_attachment", "ช่องนำไฟล์ออกไม่ถูกต้อง ซ้ำ หรือมีไฟล์ใหม่พร้อมกัน");
    }
    seen.add(key);
  }
  if (
    (files.size || seen.size) &&
    (input.rowChange !== undefined || input.pdmsSelection !== undefined)
  ) {
    fail(
      400,
      "invalid_attachment",
      "คำสั่งภายในไม่ใช่การบันทึกไฟล์แนบ กรุณากดบันทึกฉบับร่างหรือส่งโดยตรง"
    );
  }
};

export async function nativeResponseRequest(
  request: Request,
  pictureFields: readonly ResponsePictureManifestField[],
  bindings?: SpreadsheetBindings | SpreadsheetContract
): Promise<NativeResponseRequest> {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data(?:\s*;|$)/iu.test(contentType)) {
    const input = await readJsonRecord(
      request,
      maxNativePictureMultipartOverheadBytes
    );
    validateAttachmentRemovals(input, bindings, new Map());
    return { attachments: new Map(), input, pictures: new Map() };
  }
  const imageByteLimit = pictureFields.reduce(
    (total, field) => total + (field.pictureMaxBytes ?? 0),
    0
  );
  const scalarAttachments =
    bindings?.fields.filter((field) => field.attachment) ?? [];
  const tableAttachments =
    bindings?.table?.columns.filter((field) => field.attachment) ?? [];
  const body =
    bindings && "locations" in bindings && bindings.table
      ? bindings.locations[bindings.table.anchor]
      : undefined;
  if (tableAttachments.length && !body) {
    fail(409, "invalid_attachment", "ยังยืนยันขอบเขตแถวของเอกสารปัจจุบันไม่ได้");
  }
  const slotCount =
    scalarAttachments.length +
    tableAttachments.length * (body ? body.lastRow - body.firstRow + 1 : 0);
  const maximumBodyBytes = slotCount
    ? imageByteLimit +
      slotCount * 10_000_000 +
      maxNativePictureMultipartOverheadBytes
    : Math.min(
        maxTemplateArchiveExpandedBytes +
          maxNativePictureMultipartOverheadBytes,
        imageByteLimit + maxNativePictureMultipartOverheadBytes
      );
  const requestBytes = await readRequestBytes(
    request,
    maximumBodyBytes,
    "Multipart form data is required"
  );
  const multipartRequest = new Request(request.url, {
    body: requestBytes,
    headers: { "content-type": contentType },
    method: "POST",
  });
  let entries: IterableIterator<[string, NativeResponseMultipartEntry]>;
  try {
    const multipartFields = await multipartRequest.formData();
    entries = multipartFields.entries();
  } catch {
    fail(400, "invalid_request", "Multipart form data is invalid");
  }
  const fieldsByTag = new Map(pictureFields.map((field) => [field.tag, field]));
  const pictures = new Map<string, NativePictureUpload>();
  const attachments = new Map<string, File>();
  let input: JsonRecord | null = null;
  for (const [key, value] of entries) {
    if (key === "payload") {
      if (input || typeof value !== "string") {
        fail(400, "invalid_request", "payload must be provided once");
      }
      try {
        input = asRecord(JSON.parse(value));
      } catch {
        fail(400, "invalid_request", "payload must be a valid JSON object");
      }
      continue;
    }
    if (key.startsWith("attachment:")) {
      const suffix = key.slice("attachment:".length);
      let bindingId = suffix;
      let rowIndex: number | null = null;
      if (suffix.startsWith("%5B")) {
        let slot: unknown;
        try {
          slot = JSON.parse(decodeURIComponent(suffix));
        } catch {
          fail(400, "invalid_attachment", "ตำแหน่งไฟล์รายแถวไม่ถูกต้อง");
        }
        const parsed = z
          .tuple([z.string().min(1), z.number().int().nonnegative()])
          .safeParse(slot);
        if (!parsed.success) {
          fail(400, "invalid_attachment", "ตำแหน่งไฟล์รายแถวไม่ถูกต้อง");
        }
        [bindingId, rowIndex] = parsed.data;
      }
      const field =
        rowIndex === null
          ? bindings?.fields.find(
              (candidate) => candidate.id === bindingId && candidate.attachment
            )
          : bindings?.table?.columns.find(
              (candidate) => candidate.id === bindingId && candidate.attachment
            );
      const slotKey = attachmentSlotKey(bindingId, rowIndex);
      if (!field || attachments.has(slotKey) || !(value instanceof File)) {
        fail(400, "invalid_attachment", "ช่องแนบไม่ตรงกับสัญญาฟอร์มหรือซ้ำ");
      }
      const bytes = await value.arrayBuffer();
      if (bytes.byteLength > 10_000_000) {
        fail(
          413,
          "invalid_attachment",
          `${field.label}${rowIndex === null ? "" : ` / แถว ${rowIndex + 1}`}: ${bytes.byteLength} bytes เกิน 10,000,000 bytes`
        );
      }
      attachments.set(slotKey, value);
      continue;
    }
    if (!key.startsWith("picture:") || typeof value === "string") {
      fail(
        400,
        "invalid_request",
        "Only payload and picture files are accepted"
      );
    }
    const tag = key.slice("picture:".length);
    const field = fieldsByTag.get(tag);
    if (!field || pictures.has(tag)) {
      fail(400, "invalid_request", "Picture field is unknown or duplicated");
    }
    if (value.size > (field.pictureMaxBytes ?? 0)) {
      fail(
        413,
        "payload_too_large",
        `Picture field ${tag} exceeds its byte limit`
      );
    }
    const fileType = value.type.trim().toLowerCase();
    if (fileType && fileType !== "image/jpeg" && fileType !== "image/png") {
      fail(
        415,
        "invalid_file_type",
        `Picture field ${tag} must be JPEG or PNG`
      );
    }
    const bytes = new Uint8Array(await value.arrayBuffer());
    const dimensions = responsePictureImageDimensions(bytes);
    if (
      !dimensions ||
      (fileType && fileType !== `image/${dimensions.format}`)
    ) {
      invalidResponsePicture(tag, "image must be a valid JPEG or PNG");
    }
    validateResponsePictureMediaBytes(tag, bytes, field, dimensions);
    pictures.set(tag, { bytes, dimensions });
  }
  if (!input) {
    fail(400, "invalid_request", "payload is required");
  }
  validateAttachmentRemovals(input, bindings, attachments);
  return { attachments, input, pictures };
}
