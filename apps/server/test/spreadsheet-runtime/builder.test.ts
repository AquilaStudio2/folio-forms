import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { mutatePart } from "../spreadsheet-unit/fixture";
import { calculationFixture, largeFixture, rowFixture } from "./fixtures";
import {
  descendants,
  SpreadsheetRuntime,
  withFormulaCaches,
  workbookXml,
} from "./runtime-fixture";

const runtime = new SpreadsheetRuntime();
const normalized = (value: string | undefined) => value?.replaceAll("'", "");

const cellBorder = (
  workbook: ReturnType<typeof workbookXml>,
  address: string
) => {
  const styles = workbook.parse("xl/styles.xml");
  const [cellStyles] = descendants(styles, "cellXfs");
  const style =
    cellStyles?.children[Number(workbook.cell(address).style ?? "0")];
  const [borders] = descendants(styles, "borders");
  const border = borders?.children[Number(style?.attributes.borderId ?? "0")];
  return ["left", "right", "top", "bottom"].map(
    (side) =>
      border?.children.find((node) => node.local === side)?.attributes.style
  );
};

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "production spreadsheet builder in ONLYOFFICE 9.4",
  () => {
    beforeAll(async () => {
      await runtime.start();
      await runtime.run(calculationFixture);
      await runtime.run(rowFixture);
    }, 120_000);
    afterAll(() => runtime.stop(), 120_000);

    for (const cache of ["stale", "missing"] as const) {
      test(`recalculates ${cache} chained formula caches after applying input values`, async () => {
        await runtime.write(
          `${cache}.xlsx`,
          withFormulaCaches(await runtime.read("calculation.xlsx"), cache)
        );
        await runtime.runJob(`${cache}.xlsx`, {
          outputName: `${cache}-recalculated.xlsx`,
          values: [{ address: "A1", value: 4 }],
        });
        const actual = workbookXml(
          await runtime.read(`${cache}-recalculated.xlsx`)
        );
        expect(actual.cell("C1").value).toBe("12");
        expect(actual.cell("C2").value).toBe("13");
        expect(actual.cell("C3").value).toBe("26");
        expect(actual.cell("C3").formula).toBe("C2*2");
      }, 120_000);
    }

    for (const index of [0, 1, 2]) {
      test(`inserts at table offset ${index} with exact named range and cleared inputs`, async () => {
        const outputName = `insert-${index}.xlsx`;
        await runtime.runJob("rows-base.xlsx", {
          outputName,
          pdfName: `insert-${index}.pdf`,
          rowChange: {
            action: "insert",
            bodyName: "folio_body",
            index,
            inputColumns: [0, 1],
          },
        });
        const actual = workbookXml(await runtime.read(outputName));
        expect(normalized(actual.names.folio_body)).toBe("Form!$A$4:$C$6");
        expect(normalized(actual.names.folio_agency)).toBe("Form!$A$9:$C$9");
        expect(actual.cell(`A${4 + index}`).value).toBeUndefined();
        expect(actual.cell(`B${4 + index}`).value).toBeUndefined();
        expect(actual.cell(`C${4 + index}`).formula).toBe(
          `A${4 + index}*B${4 + index}+$E$1`
        );
        expect(descendants(actual.sheet, "mergeCell")[0]?.attributes.ref).toBe(
          "A9:C9"
        );
        const validation = descendants(actual.sheet, "dataValidation").find(
          (node) => node.attributes.type === "whole"
        );
        expect(validation?.attributes.errorStyle).toBe("stop");
        const references = validation
          ? descendants(validation, "sqref").flatMap((node) =>
              node.text.split(" ")
            )
          : [];
        expect(references).toContain("A4:A6");
        const originalRow = index === 0 ? 5 : 4;
        expect(actual.cell(`C${4 + index}`).style).toBe(
          actual.cell(`C${originalRow}`).style
        );
        // Each input and formula cell inherits all four actual border edges,
        // including append at the end of the body, not only the same style ID.
        for (const column of ["A", "B", "C"]) {
          expect(cellBorder(actual, `${column}${4 + index}`)).toEqual([
            "thin",
            "thin",
            "thin",
            "thin",
          ]);
        }
        const pdf = await runtime.read(`insert-${index}.pdf`);
        expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
        expect(pdf.byteLength).toBeGreaterThan(1000);
        expect(actual.cell("C7").value).toBe("29");
        expect(actual.cell("C7").formula).toMatch(
          /^SUM\(_folio_dyn_[a-f0-9]{16}_2_2\)$/u
        );
      }, 120_000);
    }

    test("deletes the first row, then clears the final row without deleting template geometry", async () => {
      await runtime.runJob("rows-base.xlsx", {
        outputName: "one-row.xlsx",
        rowChange: {
          action: "delete",
          bodyName: "folio_body",
          index: 0,
          inputColumns: [0, 1],
        },
      });
      const one = workbookXml(await runtime.read("one-row.xlsx"));
      expect(normalized(one.names.folio_body)).toBe("Form!$A$4:$C$4");
      expect(one.cell("A4").value).toBe("4");
      expect(one.cell("C4").formula).toBe("A4*B4+$E$1");
      expect(normalized(one.names.folio_agency)).toBe("Form!$A$7:$C$7");
      expect(one.cell("C5").value).toBe("21");
      await runtime.runJob("one-row.xlsx", {
        outputName: "empty-row.xlsx",
        rowChange: {
          action: "delete",
          bodyName: "folio_body",
          index: 0,
          inputColumns: [0, 1],
        },
      });
      const empty = workbookXml(await runtime.read("empty-row.xlsx"));
      expect(normalized(empty.names.folio_body)).toBe("Form!$A$4:$C$4");
      expect(empty.cell("A4").value).toBeUndefined();
      expect(empty.cell("C4").formula).toBe("A4*B4+$E$1");
      expect(normalized(empty.names.folio_agency)).toBe("Form!$A$7:$C$7");
      expect(empty.cell("C5").value).toBe("1");
    }, 120_000);

    test("copies an offset table starting at D and expands its absolute reference correctly", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet();
sheet.SetName("Form");
sheet.GetRange("D10").SetValue(5);
sheet.GetRange("E10").SetValue("=D10*2");
Api.AddDefName("folio_offset", "'Form'!$D$10:$E$10", false);
builder.SaveFile("xlsx", "/work/offset.xlsx");
builder.CloseFile();`);
      await runtime.runJob("offset.xlsx", {
        outputName: "offset-grown.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_offset",
          index: 1,
          inputColumns: [0],
        },
      });
      const actual = workbookXml(await runtime.read("offset-grown.xlsx"));
      expect(normalized(actual.names.folio_offset)).toBe("Form!$D$10:$E$11");
      expect(actual.cell("D10").value).toBe("5");
      expect(actual.cell("D11").value).toBeUndefined();
      expect(actual.cell("E11").formula).toBe("D11*2");
    }, 120_000);

    test("an aggregate through the table binding follows first and last row insertions", async () => {
      await runtime.run(`builder.OpenFile("/work/rows-base.xlsx");
Api.GetActiveSheet().GetRange("F2").SetValue("=SUM(folio_body)");
Api.RecalculateAllFormulas();
builder.SaveFile("xlsx", "/work/named-total.xlsx");
builder.CloseFile();`);
      await runtime.runJob("named-total.xlsx", {
        outputName: "named-first.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_body",
          index: 0,
          inputColumns: [0, 1],
        },
      });
      const first = workbookXml(await runtime.read("named-first.xlsx"));
      expect(first.cell("F2").value).toBe("43");
      await runtime.runJob("named-total.xlsx", {
        outputName: "named-last.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_body",
          index: 2,
          inputColumns: [0, 1],
        },
      });
      const last = workbookXml(await runtime.read("named-last.xlsx"));
      expect(last.cell("F2").value).toBe("43");
    }, 120_000);

    test("keeps grouped and arithmetic aggregates stable across first, appended and deleted rows", async () => {
      await runtime.run(`builder.OpenFile("/work/rows-base.xlsx");
var sheet = Api.GetActiveSheet();
sheet.GetRange("F1").SetValue("=SUM((C4:C5))");
sheet.GetRange("F2").SetValue("=SUM(C4:C5*2)");
sheet.GetRange("F3").SetValue("=SUMPRODUCT((A4:A5+B4:B5)*C4:C5)");
Api.RecalculateAllFormulas();
builder.SaveFile("xlsx", "/work/expression.xlsx"); builder.CloseFile();`);
      for (const index of [0, 2]) {
        const outputName = `expression-${index}.xlsx`;
        // oxlint-disable-next-line no-await-in-loop -- A single CLI builder process uses this isolated fixture directory.
        await runtime.runJob("expression.xlsx", {
          outputName,
          rowChange: {
            action: "insert",
            bodyName: "folio_body",
            index,
            inputColumns: [0, 1],
          },
        });
        // oxlint-disable-next-line no-await-in-loop -- Inspect the saved result before starting the next builder invocation.
        const actual = workbookXml(await runtime.read(outputName));
        expect(actual.cell("F1").value).toBe("29");
        expect(actual.cell("F2").value).toBe("58");
        expect(actual.cell("F3").value).toBe("224");
        expect(actual.cell("F2").formula).toMatch(
          /^SUM\(_folio_dyn_[a-f0-9]{16}_2_2\*2\)$/u
        );
      }
      await runtime.runJob("expression-2.xlsx", {
        outputName: "expression-deleted.xlsx",
        rowChange: {
          action: "delete",
          bodyName: "folio_body",
          index: 0,
          inputColumns: [0, 1],
        },
      });
      const deleted = workbookXml(
        await runtime.read("expression-deleted.xlsx")
      );
      expect(deleted.cell("F1").value).toBe("22");
      expect(deleted.cell("F2").value).toBe("44");
      expect(deleted.cell("F3").value).toBe("189");
    }, 120_000);

    test("grows singleton aggregates, preserves quoted text and absolute ranges, and keeps print boundaries", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form");
sheet.GetRange("D10").SetValue(5); sheet.GetRange("E10").SetValue("=D10*2+1");
sheet.GetRange("E11").SetValue("=SUM(E10)");
sheet.GetRange("F2").SetValue('=IF("E10"="E10",SUM($E$10:E$10),0)');
sheet.GetRange("F3").SetValue("=SUM((E10*2))");
Api.AddDefName("folio_single", "'Form'!$D$10:$E$10", false);
builder.SaveFile("xlsx", "/work/single.xlsx"); builder.CloseFile();`);
      await runtime.write(
        "single.xlsx",
        mutatePart(
          await runtime.read("single.xlsx"),
          "xl/workbook.xml",
          (xml) =>
            xml.replace(
              "</definedNames>",
              '<definedName name="_xlnm.Print_Area" localSheetId="0">Form!$D$1:$F$10</definedName></definedNames>'
            )
        )
      );
      await runtime.runJob("single.xlsx", {
        outputName: "single-grown.xlsx",
        pdfName: "single-grown.pdf",
        rowChange: {
          action: "insert",
          bodyName: "folio_single",
          index: 1,
          inputColumns: [0],
        },
      });
      const grown = workbookXml(await runtime.read("single-grown.xlsx"));
      expect(grown.cell("E12").value).toBe("12");
      expect(grown.cell("F2").value).toBe("12");
      expect(grown.cell("F3").value).toBe("24");
      expect(grown.cell("F2").formula).toContain('"E10"="E10"');
      expect(normalized(grown.names["_xlnm.Print_Area"])).toBe(
        "Form!$D$1:$F$11"
      );
      const printed = await runtime.read("single-grown.pdf");
      expect(new TextDecoder().decode(printed.subarray(0, 5))).toBe("%PDF-");
      await runtime.runJob("single-grown.xlsx", {
        outputName: "single-first.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_single",
          index: 0,
          inputColumns: [0],
        },
      });
      const first = workbookXml(await runtime.read("single-first.xlsx"));
      expect(first.cell("E13").value).toBe("13");
      expect(first.cell("F2").value).toBe("13");
      expect(first.cell("F3").value).toBe("26");
      expect(normalized(first.names["_xlnm.Print_Area"])).toBe(
        "Form!$D$1:$F$12"
      );
    }, 120_000);

    test("normalizes and grows a 1001-row, 31-column aggregate without a business row cap", async () => {
      await runtime.run(largeFixture);
      await runtime.runJob("large.xlsx", {
        outputName: "large-grown.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_large",
          index: 1001,
          inputColumns: Array.from({ length: 31 }, (_, index) => index),
        },
      });
      const actual = workbookXml(await runtime.read("large-grown.xlsx"));
      const count = 1001 * 31;
      expect(actual.cell("AF1003").value).toBe(
        String((count * (count + 1)) / 2)
      );
      expect(normalized(actual.names.folio_large)).toBe("Form!$A$1:$AE$1002");
      expect(actual.cell("AF1003").formula).toMatch(
        /^SUM\(_folio_dyn_[a-f0-9]{16}_0_30\)$/u
      );
    }, 120_000);
  }
);
