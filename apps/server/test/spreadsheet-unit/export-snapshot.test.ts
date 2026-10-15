import { expect, test } from "bun:test";

import {
  spreadsheetExportSnapshot,
  withSpreadsheetExportSnapshot,
} from "../../src/documents/spreadsheets/export-snapshot";

test("spreadsheet export pins a private copy and retires its key after conversion", async () => {
  const input = new Uint8Array([1, 2, 3]);
  let exportKey = "";
  const output = await withSpreadsheetExportSnapshot(input, (key) => {
    exportKey = key;
    input[0] = 9;
    expect(spreadsheetExportSnapshot(key)).toEqual(new Uint8Array([1, 2, 3]));
    const served = spreadsheetExportSnapshot(key);
    if (served) {
      served[1] = 9;
    }
    expect(spreadsheetExportSnapshot(key)).toEqual(new Uint8Array([1, 2, 3]));
    return Promise.resolve("converted");
  });
  expect(output).toBe("converted");
  expect(spreadsheetExportSnapshot(exportKey)).toBeNull();
});

test("conversion failure retires the temporary export without retaining workbook bytes", async () => {
  let exportKey = "";
  await expect(
    withSpreadsheetExportSnapshot(new Uint8Array([1]), (key) => {
      exportKey = key;
      expect(spreadsheetExportSnapshot(key)).not.toBeNull();
      return Promise.reject(new Error("conversion failed"));
    })
  ).rejects.toThrow("conversion failed");
  expect(spreadsheetExportSnapshot(exportKey)).toBeNull();
});
