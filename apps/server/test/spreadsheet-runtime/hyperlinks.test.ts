import { afterAll, beforeAll, describe, expect, test } from "bun:test";
// oxlint-disable unicorn/no-await-expression-member -- Inspect the bytes returned by the ordered runtime steps.

import { readSpreadsheetWorkbook } from "../../src/documents/spreadsheets/workbook";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";
import { SpreadsheetRuntime } from "./runtime-fixture";

const runtime = new SpreadsheetRuntime();
const target = "https://example.com/report?a=1&b=2#section";

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "Excel hyperlinks in ONLYOFFICE 9.4",
  () => {
    beforeAll(() => runtime.start(), 120_000);
    afterAll(() => runtime.stop(), 120_000);

    test("canonical rebuilds retain links, labels and types through reopen, PDF, row changes and removal", async () => {
      await runtime.write("input.xlsx", fixtureWorkbook());
      await runtime.runJob("input.xlsx", {
        clearRanges: ["A1:B1", "C4:C8"],
        outputName: "draft.xlsx",
        pdfName: "draft.pdf",
        values: [
          {
            address: "A1",
            hyperlink: { target, tooltip: "Open report" },
            value: "Report",
          },
          { address: "C4", hyperlink: { target }, value: "Row link" },
          { address: "A4", hyperlink: { target }, value: 12 },
        ],
      });
      const saved = readSpreadsheetWorkbook(await runtime.read("draft.xlsx"));
      expect(saved.cells.get("A1")?.value).toBe("Report");
      expect(saved.cells.get("A4")?.value).toBe(12);
      expect(saved.hyperlinks).toHaveLength(3);
      expect(
        saved.hyperlinks.find((link) => link.range.firstRow === 0)
      ).toMatchObject({ target, tooltip: "Open report" });
      expect(
        new TextDecoder().decode(
          (await runtime.read("draft.pdf")).subarray(0, 5)
        )
      ).toBe("%PDF-");

      await runtime.runJob("draft.xlsx", { outputName: "reopened.xlsx" });
      expect(
        readSpreadsheetWorkbook(await runtime.read("reopened.xlsx")).hyperlinks
      ).toEqual(saved.hyperlinks);

      await runtime.runJob("reopened.xlsx", {
        outputName: "inserted.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_body",
          index: 0,
          inputColumns: [0, 1, 2],
        },
      });
      const inserted = readSpreadsheetWorkbook(
        await runtime.read("inserted.xlsx")
      );
      expect(
        inserted.hyperlinks.some((link) => link.range.firstRow === 3)
      ).toBe(false);
      expect(
        inserted.hyperlinks.find((link) => link.range.firstColumn === 2)?.range
          .firstRow
      ).toBe(4);

      await runtime.runJob("inserted.xlsx", {
        clearRanges: ["A1:B1"],
        outputName: "removed.xlsx",
        values: [{ address: "A1", value: "Plain text now" }],
      });
      const removed = readSpreadsheetWorkbook(
        await runtime.read("removed.xlsx")
      );
      expect(removed.hyperlinks.some((link) => link.range.firstRow === 0)).toBe(
        false
      );
      expect(removed.cells.get("A1")?.value).toBe("Plain text now");
      expect(removed.hyperlinks).toHaveLength(2);
    }, 120_000);
  }
);
