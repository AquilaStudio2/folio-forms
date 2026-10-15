import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import { spreadsheetBuilderScript } from "../../src/documents/spreadsheets/builder-script";
import type { SpreadsheetBuilderJob } from "../../src/documents/spreadsheets/builder-script";

const inputUrl = "https://example.test/input.xlsx";

describe("spreadsheet builder job boundary", () => {
  test("rejects executable/path-shaped output names and unsafe cell references", () => {
    const jobs: SpreadsheetBuilderJob[] = [
      { inputUrl: "file:///tmp/input.xlsx" },
      { inputUrl, outputName: "../outside.xlsx" },
      { inputUrl, pdfName: 'output.pdf");builder.CloseFile();//' },
      { inputUrl, values: [{ address: 'A1");evil()', value: 1 }] },
      { clearRanges: ["A1;B2"], inputUrl },
      {
        inputUrl,
        rowChange: {
          action: "insert",
          bodyName: "bad-name",
          index: 0,
          inputColumns: [0],
        },
      },
      {
        inputUrl,
        rowChange: {
          action: "delete",
          bodyName: "folio_body",
          index: -1,
          inputColumns: [0],
        },
      },
      {
        inputUrl,
        rowChange: {
          action: "insert",
          bodyName: "folio_body",
          index: 0.5,
          inputColumns: [0],
        },
      },
    ];
    for (const job of jobs) {
      expect(() => spreadsheetBuilderScript(job)).toThrow();
    }
  });

  test("serializes input text as data and keeps a formula-like input literal", () => {
    const script = spreadsheetBuilderScript({
      inputUrl,
      values: [
        { address: "A1", value: '=1+1";throw new Error("bad")' },
        { address: "B1", value: false },
        { address: "C1", value: 0 },
      ],
    });
    const written = new Map<string, unknown>();
    runInNewContext(script, {
      Api: {
        GetActiveSheet: () => ({
          GetRange: (address: string) => ({
            SetValue: (value: unknown) => written.set(address, value),
          }),
        }),
        RecalculateAllFormulas() {},
      },
      builder: {
        CloseFile() {},
        OpenFile() {},
        SaveFile() {},
      },
    });
    expect(written.get("A1")).toBe('\'=1+1";throw new Error("bad")');
    expect(written.get("B1")).toBe(false);
    expect(written.get("C1")).toBe(0);
  });
});
