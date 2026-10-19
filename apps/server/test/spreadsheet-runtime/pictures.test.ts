import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// @ts-expect-error -- The production plugin command is JavaScript serialized into the editor sandbox.
import { spreadsheetPictureCommand } from "../../../onlyoffice-plugin/src/spreadsheet-pictures.js";
import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { spreadsheetPicturePlaceholder } from "../../src/documents/spreadsheets/picture-placeholder";
import {
  readSpreadsheetPictures,
  overlaySpreadsheetPictures,
  resetSpreadsheetPicturePlaceholders,
  synchronizeSpreadsheetPictureAnchors,
  readSpreadsheetPictureFrames,
  restoreSpreadsheetPictureFrames,
} from "../../src/documents/spreadsheets/pictures";
import { protectSpreadsheet } from "../../src/documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  extractSpreadsheetData,
} from "../../src/documents/spreadsheets/workbook";
import {
  SpreadsheetRuntime,
  workbookXml,
  descendants,
} from "./runtime-fixture";

const runtime = new SpreadsheetRuntime();
const dataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FoUAAAAASUVORK5CYII=";
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_photo",
      id: "folio_photo",
      key: "photo",
      label: "Photo",
      required: true,
      type: "picture",
    },
  ],
  table: null,
  version: 1,
});

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "Excel picture upload in ONLYOFFICE 9.4",
  () => {
    beforeAll(() => runtime.start(), 120_000);
    afterAll(() => runtime.stop(), 120_000);
    test("admin-moved picture frames retain their position and size through publication and reopen", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form");
sheet.GetRange("B:B").SetColumnWidth(12);
Api.AddDefName("folio_photo", "'Form'!$B$10", false);
var image = sheet.AddImage(${JSON.stringify(spreadsheetPicturePlaceholder.dataUrl)}, 857250, 514350, 1, 647699, 6, 114299);
image.SetName("folio_picture_folio_photo");
builder.SaveFile("xlsx", "/work/moved-frame.xlsx"); builder.CloseFile();`);
      const normalized = synchronizeSpreadsheetPictureAnchors(
        await runtime.read("moved-frame.xlsx"),
        bindings
      );
      await runtime.write("moved-normalized.xlsx", normalized);
      await runtime.runJob("moved-normalized.xlsx", {
        outputName: "moved-processed.xlsx",
      });
      const processed = await runtime.read("moved-processed.xlsx");
      const contract = resolveSpreadsheetContract(
        bindings,
        readSpreadsheetWorkbook(processed)
      );
      expect(contract.locations.folio_photo).toMatchObject({
        firstColumn: 1,
        firstRow: 6,
        lastColumn: 1,
        lastRow: 6,
      });
      const published = protectSpreadsheet(
        resetSpreadsheetPicturePlaceholders(processed, contract),
        contract
      );
      await runtime.write("moved-published.xlsx", published);
      await runtime.runJob("moved-published.xlsx", {
        outputName: "moved-reopened.xlsx",
      });
      const reopened = readSpreadsheetWorkbook(
        await runtime.read("moved-reopened.xlsx")
      );
      const pictures = readSpreadsheetPictures(reopened, contract, {
        includePlaceholders: true,
      });
      expect(pictures.get("folio_photo")).toMatchObject({
        columnOffset: 647_699,
        height: 514_350,
        rowOffset: 114_299,
        width: 857_250,
      });
      expect(readSpreadsheetPictures(reopened, contract).size).toBe(0);
      expect(
        extractSpreadsheetData(reopened, contract, true).errors
      ).toHaveLength(1);
      const frames = readSpreadsheetPictureFrames(published, contract);
      const restored = overlaySpreadsheetPictures(
        published,
        contract,
        restoreSpreadsheetPictureFrames(new Map(), frames),
        { lockPosition: true }
      );
      await runtime.write("restored-response.xlsx", restored);
      await runtime.runJob("restored-response.xlsx", {
        outputName: "restored-reopened.xlsx",
      });
      const restoredBytes = await runtime.read("restored-reopened.xlsx");
      const restoredWorkbook = readSpreadsheetWorkbook(restoredBytes);
      expect(
        readSpreadsheetPictures(restoredWorkbook, contract, {
          includePlaceholders: true,
        }).get("folio_photo")
      ).toMatchObject({
        columnOffset: 647_699,
        height: 514_350,
        rowOffset: 114_299,
        width: 857_250,
      });
      expect(
        extractSpreadsheetData(restoredWorkbook, contract, true).errors
      ).toHaveLength(1);
      const xml = workbookXml(restoredBytes);
      const drawingPath = Object.keys(xml.entries).find((entry) =>
        /^xl\/drawings\/[^/]+\.xml$/u.test(entry)
      );
      if (!drawingPath) {
        throw new Error("Missing response picture drawing");
      }
      expect(
        descendants(xml.parse(drawingPath), "picLocks")[0]?.attributes
      ).toMatchObject({ noMove: "1", noResize: "0" });
    }, 120_000);
    test("the real plugin inserts into a protected workbook and canonical pictures survive reopen, replacement, removal and PDF export", async () => {
      await runtime.run(`builder.CreateFile("xlsx");
var sheet = Api.GetActiveSheet(); sheet.SetName("Form");
sheet.GetRange("B2:D6").Merge(false);
Api.AddDefName("folio_photo", "'Form'!$B$2:$D$6", false);
builder.SaveFile("xlsx", "/work/base.xlsx"); builder.CloseFile();`);
      const raw = await runtime.read("base.xlsx");
      const contract = resolveSpreadsheetContract(
        bindings,
        readSpreadsheetWorkbook(raw)
      );
      await runtime.write("protected.xlsx", protectSpreadsheet(raw, contract));
      const command = spreadsheetPictureCommand.toString();
      const frameInput = {
        ...spreadsheetPicturePlaceholder,
        anchor: "folio_photo",
        id: "folio_photo",
        placeholder: true,
      };
      await runtime.run(`builder.OpenFile("/work/protected.xlsx");
Asc.scope = { folioSpreadsheetPicture: ${JSON.stringify(frameInput)} };
if (!(${command})()) throw new Error("Frame insertion failed");
if (!(${command})()) throw new Error("Frame retry failed");
builder.SaveFile("xlsx", "/work/frame.xlsx"); builder.CloseFile();`);
      await runtime.runJob("frame.xlsx", { outputName: "frame-reopened.xlsx" });
      const framed = readSpreadsheetWorkbook(
        await runtime.read("frame-reopened.xlsx")
      );
      expect(readSpreadsheetPictures(framed, contract).size).toBe(0);
      expect(
        readSpreadsheetPictures(framed, contract, { includePlaceholders: true })
          .size
      ).toBe(1);
      expect(
        extractSpreadsheetData(framed, contract, true).errors
      ).toHaveLength(1);
      expect(
        extractSpreadsheetData(framed, contract, false).errors
      ).toHaveLength(0);
      const input = {
        anchor: "folio_photo",
        dataUrl,
        height: 1,
        id: "folio_photo",
        width: 1,
      };
      await runtime.run(`builder.OpenFile("/work/protected.xlsx");
Asc.scope = { folioSpreadsheetPicture: ${JSON.stringify(input)} };
if (!(${command})()) throw new Error("Insert failed");
builder.SaveFile("xlsx", "/work/filled.xlsx"); builder.CloseFile();`);
      const filled = readSpreadsheetWorkbook(await runtime.read("filled.xlsx"));
      const pictures = readSpreadsheetPictures(filled, contract);
      expect(pictures.size).toBe(1);
      const canonical = overlaySpreadsheetPictures(raw, contract, pictures);
      await runtime.write("canonical.xlsx", canonical);
      await runtime.runJob("canonical.xlsx", {
        outputName: "roundtrip.xlsx",
        pdfName: "pictures.pdf",
      });
      expect(
        readSpreadsheetPictures(
          readSpreadsheetWorkbook(await runtime.read("roundtrip.xlsx")),
          contract
        ).size
      ).toBe(1);
      const pdf = await runtime.read("pictures.pdf");
      expect(pdf.byteLength).toBeGreaterThan(1000);
      const replaced = overlaySpreadsheetPictures(
        canonical,
        contract,
        pictures
      );
      await runtime.write("replaced.xlsx", replaced);
      await runtime.runJob("replaced.xlsx", {
        outputName: "replacement-roundtrip.xlsx",
      });
      expect(
        readSpreadsheetPictures(
          readSpreadsheetWorkbook(
            await runtime.read("replacement-roundtrip.xlsx")
          ),
          contract
        ).size
      ).toBe(1);
      await runtime.write(
        "removed-source.xlsx",
        overlaySpreadsheetPictures(replaced, contract, new Map())
      );
      await runtime.runJob("removed-source.xlsx", {
        outputName: "removed.xlsx",
      });
      expect(
        readSpreadsheetPictures(
          readSpreadsheetWorkbook(await runtime.read("removed.xlsx")),
          contract
        ).size
      ).toBe(0);
    }, 120_000);
  }
);
