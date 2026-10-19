import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";

import { PNG } from "pngjs";

import { spreadsheetPicturePlaceholder } from "../../src/documents/spreadsheets/picture-placeholder";
import { isSpreadsheetPicturePlaceholder } from "../../src/documents/spreadsheets/picture-placeholder-detection";

const artwork = Buffer.from(
  spreadsheetPicturePlaceholder.dataUrl.split(",")[1] ?? "",
  "base64"
);

describe("spreadsheet picture placeholder detection", () => {
  test("the artwork and differently encoded pixels are not respondent pictures", () => {
    expect(isSpreadsheetPicturePlaceholder(artwork)).toBe(true);
    const decoded = PNG.sync.read(artwork);
    const encoded = PNG.sync.write(decoded, {
      colorType: 2,
      deflateLevel: 1,
      filterType: 4,
    });
    expect(encoded.equals(artwork)).toBe(false);
    expect(isSpreadsheetPicturePlaceholder(encoded)).toBe(true);
    decoded.gamma = 0.45455;
    expect(isSpreadsheetPicturePlaceholder(PNG.sync.write(decoded))).toBe(true);
  });

  test("a real image of the same dimensions is accepted", () => {
    const decoded = PNG.sync.read(artwork);
    decoded.data.fill(0);
    expect(isSpreadsheetPicturePlaceholder(PNG.sync.write(decoded))).toBe(
      false
    );
    expect(
      isSpreadsheetPicturePlaceholder(
        PNG.sync.write(new PNG({ height: 2, width: 2 }))
      )
    ).toBe(false);
  });

  test("corrupted artwork cannot masquerade as a real attachment", () => {
    expect(() =>
      isSpreadsheetPicturePlaceholder(artwork.subarray(0, 40))
    ).toThrow();
    const corrupt = Buffer.from(artwork);
    corrupt[corrupt.length - 20] = 255 - (corrupt.at(-20) ?? 0);
    expect(() => isSpreadsheetPicturePlaceholder(corrupt)).toThrow();
  });

  test("inflation is bounded before decoding an interlaced PNG", () => {
    const header = Buffer.from(artwork.subarray(0, 33));
    header[28] = 1;
    const compressed = deflateSync(Buffer.alloc(2 * 1024 * 1024));
    const chunk = Buffer.alloc(compressed.length + 12);
    chunk.writeUInt32BE(compressed.length);
    chunk.write("IDAT", 4);
    compressed.copy(chunk, 8);
    expect(() =>
      isSpreadsheetPicturePlaceholder(
        Buffer.concat([header, chunk, artwork.subarray(-12)])
      )
    ).toThrow();
  });
});
