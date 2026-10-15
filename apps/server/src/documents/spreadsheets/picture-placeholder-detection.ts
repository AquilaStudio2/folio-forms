import { inflateSync } from "node:zlib";

import { PNG } from "pngjs";

import { responsePictureImageDimensions } from "../pictures";
import { spreadsheetPicturePlaceholder } from "./picture-placeholder";

const artwork = Buffer.from(
  spreadsheetPicturePlaceholder.dataUrl.split(",")[1] ?? "",
  "base64"
);
const pixels = PNG.sync.read(artwork).data;

/** Bound even interlaced PNG inflation before passing an untrusted file to pngjs. */
const validatePngBudget = (bytes: Buffer): void => {
  const compressed: Buffer[] = [];
  let headers = 0;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) {
      throw new Error("Invalid spreadsheet picture PNG");
    }
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) {
      throw new Error("Invalid spreadsheet picture PNG");
    }
    const kind = bytes.toString("ascii", offset + 4, offset + 8);
    if (kind === "IHDR") {
      headers += 1;
    } else if (kind === "IDAT") {
      compressed.push(bytes.subarray(offset + 8, end - 4));
    }
    offset = end;
    if (kind === "IEND") {
      break;
    }
  }
  if (headers !== 1) {
    throw new Error("Invalid spreadsheet picture PNG header");
  }
  inflateSync(Buffer.concat(compressed), {
    maxOutputLength:
      (spreadsheetPicturePlaceholder.width * 8 + 8) *
      (spreadsheetPicturePlaceholder.height + 8),
  });
};

/** Compare decoded artwork, so re-encoding or metadata changes cannot make a frame an answer. */
export const isSpreadsheetPicturePlaceholder = (bytes: Uint8Array): boolean => {
  const dimensions = responsePictureImageDimensions(bytes);
  if (
    dimensions?.format !== "png" ||
    dimensions.width !== spreadsheetPicturePlaceholder.width ||
    dimensions.height !== spreadsheetPicturePlaceholder.height
  ) {
    return false;
  }
  if (bytes.byteLength > 10 * 1024 * 1024) {
    throw new Error("Spreadsheet picture exceeds the maximum size");
  }
  const buffer = Buffer.from(bytes);
  validatePngBudget(buffer);
  return PNG.sync.read(buffer).data.equals(pixels);
};
