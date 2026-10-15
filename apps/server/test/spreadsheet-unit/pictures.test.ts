// oxlint-disable no-non-null-assertion prefer-array-find -- Fixture parts are known and assertions below verify media counts.
import { expect, test } from "bun:test";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import {
  overlaySpreadsheetPictures,
  readSpreadsheetPictures,
  resetSpreadsheetPicturePlaceholders,
  synchronizeSpreadsheetPictureAnchors,
  readSpreadsheetPictureFrames,
  restoreSpreadsheetPictureFrames,
} from "../../src/documents/spreadsheets/pictures";
import {
  extractSpreadsheetData,
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../../src/documents/spreadsheets/workbook";
import { fixtureWorkbook, mutatePart } from "./fixture";

const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FoUAAAAASUVORK5CYII=",
    "base64"
  )
);
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
const empty = fixtureWorkbook({
  cells: [],
  merges: ["A1:B2"],
  names: { folio_photo: "'Form'!$A$1:$B$2" },
});
const contract = resolveSpreadsheetContract(
  bindings,
  readSpreadsheetWorkbook(empty)
);
const pictures = new Map([
  ["folio_photo", { bytes: png, height: 9525, width: 9525 }],
]);
const filled = () => overlaySpreadsheetPictures(empty, contract, pictures);
const drawingPath = (bytes: Uint8Array) =>
  Object.keys(readSpreadsheetWorkbook(bytes).archive).find(
    (name) => name.startsWith("xl/drawings/") && name.endsWith(".xml")
  )!;

test("picture fields publish without Prefill, formulas, choices or table-column support", () => {
  for (const change of [
    { computed: true },
    { prefillPointer: "/photo" },
    { options: ["x"] },
    { prefillPolicy: "lock_when_available" },
  ]) {
    expect(
      spreadsheetBindingSchema.safeParse({
        ...bindings,
        fields: [{ ...bindings.fields[0], ...change }],
      }).success
    ).toBe(false);
  }
  expect(
    spreadsheetBindingSchema.safeParse({
      ...bindings,
      table: {
        anchor: "folio_body",
        columns: [{ ...bindings.fields[0], offset: 0 }],
        id: "folio_table",
        key: "items",
        label: "Items",
      },
    }).success
  ).toBe(false);
});

test("embedded pictures survive save/resume and stay out of answer JSON like DOCX", () => {
  const workbook = readSpreadsheetWorkbook(filled());
  expect(
    readSpreadsheetPictures(workbook, contract).get("folio_photo")?.bytes
  ).toEqual(png);
  expect(extractSpreadsheetData(workbook, contract, true)).toEqual({
    data: {},
    errors: [],
  });
  expect(
    extractSpreadsheetData(readSpreadsheetWorkbook(empty), contract, false)
      .errors
  ).toEqual([]);
  expect(
    extractSpreadsheetData(readSpreadsheetWorkbook(empty), contract, true)
      .errors
  ).toEqual([{ address: "A1", message: "Required picture: Photo" }]);
});

test("publication creates frames sized to the mapped merged cells, without an answer", () => {
  const layout = mutatePart(empty, "xl/worksheets/sheet1.xml", (xml) =>
    xml.replace(
      "<sheetData>",
      '<sheetFormatPr defaultRowHeight="30"/><cols><col min="1" max="2" width="20"/></cols><sheetData>'
    )
  );
  const framed = resetSpreadsheetPicturePlaceholders(layout, contract);
  const workbook = readSpreadsheetWorkbook(framed);
  expect(readSpreadsheetPictures(workbook, contract).size).toBe(0);
  const all = readSpreadsheetPictures(workbook, contract, {
    includePlaceholders: true,
  });
  expect(all.get("folio_photo")).toMatchObject({
    height: 80 * 9525,
    width: 290 * 9525,
  });
  expect(extractSpreadsheetData(workbook, contract, true).errors).toEqual([
    { address: "A1", message: "Required picture: Photo" },
  ]);
  const resumed = overlaySpreadsheetPictures(framed, contract, all);
  expect(
    readSpreadsheetPictures(readSpreadsheetWorkbook(resumed), contract, {
      includePlaceholders: true,
    }).size
  ).toBe(1);
  expect(
    readSpreadsheetPictures(readSpreadsheetWorkbook(resumed), contract).size
  ).toBe(0);
});

test("publication follows an admin frame moved B10 to B7, preserving exact offsets and resize", () => {
  const source = fixtureWorkbook({
    cells: [],
    merges: [],
    names: { folio_photo: "'Form'!$B$10" },
  });
  const before = resolveSpreadsheetContract(
    bindings,
    readSpreadsheetWorkbook(source)
  );
  const framed = overlaySpreadsheetPictures(
    source,
    before,
    new Map([
      [
        "folio_photo",
        {
          bytes: png,
          columnOffset: 647_699,
          height: 514_350,
          rowOffset: 114_299,
          width: 857_250,
        },
      ],
    ])
  );
  const moved = mutatePart(framed, drawingPath(framed), (xml) =>
    xml.replace("<xdr:row>9</xdr:row>", "<xdr:row>6</xdr:row>")
  );
  const synchronized = synchronizeSpreadsheetPictureAnchors(moved, bindings);
  const next = resolveSpreadsheetContract(
    bindings,
    readSpreadsheetWorkbook(synchronized)
  );
  expect(next.locations.folio_photo).toEqual({
    firstColumn: 1,
    firstRow: 6,
    lastColumn: 1,
    lastRow: 6,
    sheet: "Form",
  });
  const published = readSpreadsheetWorkbook(
    resetSpreadsheetPicturePlaceholders(synchronized, next)
  );
  expect(
    readSpreadsheetPictures(published, next, { includePlaceholders: true }).get(
      "folio_photo"
    )
  ).toMatchObject({
    columnOffset: 647_699,
    height: 514_350,
    rowOffset: 114_299,
    width: 857_250,
  });
  expect(readSpreadsheetPictures(published, next).size).toBe(0);
});

test("publication retains complete merged mappings and rejects non-origin merged placement", () => {
  const source = filled();
  const synchronized = synchronizeSpreadsheetPictureAnchors(source, bindings);
  expect(
    resolveSpreadsheetContract(bindings, readSpreadsheetWorkbook(synchronized))
      .locations
  ).toEqual(contract.locations);
  const moved = mutatePart(source, drawingPath(source), (xml) =>
    xml.replace("<xdr:col>0</xdr:col>", "<xdr:col>1</xdr:col>")
  );
  expect(() => synchronizeSpreadsheetPictureAnchors(moved, bindings)).toThrow(
    "มุมซ้ายบนของเซลล์รวม"
  );
});

test("initial frame metadata supports old templates and restoring a deleted image", () => {
  const original = overlaySpreadsheetPictures(
    empty,
    contract,
    new Map([
      [
        "folio_photo",
        {
          bytes: png,
          columnOffset: 647_699,
          height: 514_350,
          rowOffset: 114_299,
          width: 857_250,
        },
      ],
    ])
  );
  const frames = readSpreadsheetPictureFrames(original, contract);
  expect(frames).toEqual([
    {
      anchor: "folio_photo",
      columnOffset: 647_699,
      height: 514_350,
      id: "folio_photo",
      rowOffset: 114_299,
      width: 857_250,
    },
  ]);
  const fallback = readSpreadsheetPictureFrames(empty, contract);
  expect(fallback[0]).toMatchObject({
    columnOffset: 0,
    height: 40 * 9525,
    rowOffset: 0,
    width: 128 * 9525,
  });
  const response = overlaySpreadsheetPictures(
    original,
    contract,
    restoreSpreadsheetPictureFrames(new Map(), frames),
    { lockPosition: true }
  );
  const workbook = readSpreadsheetWorkbook(response);
  expect(readSpreadsheetPictures(workbook, contract).size).toBe(0);
  expect(
    readSpreadsheetPictures(workbook, contract, {
      includePlaceholders: true,
    }).get("folio_photo")
  ).toMatchObject({
    columnOffset: 647_699,
    height: 514_350,
    rowOffset: 114_299,
    width: 857_250,
  });
  const xml = new TextDecoder().decode(workbook.archive[drawingPath(response)]);
  expect(xml).toContain('noMove="1"');
  expect(xml).toContain('noResize="0"');
  const admin = new TextDecoder().decode(
    readSpreadsheetWorkbook(original).archive[drawingPath(original)]
  );
  expect(admin).not.toContain('noMove="1"');
});

test("publication rejects moved pictures overlapping another field", () => {
  const source = fixtureWorkbook({
    cells: [],
    merges: [],
    names: { folio_photo: "'Form'!$B$10", folio_text: "'Form'!$B$7" },
  });
  const fields = spreadsheetBindingSchema.parse({
    ...bindings,
    fields: [
      ...bindings.fields,
      {
        anchor: "folio_text",
        id: "folio_text",
        key: "text",
        label: "Text",
        type: "text",
      },
    ],
  });
  const state = resolveSpreadsheetContract(
    fields,
    readSpreadsheetWorkbook(source)
  );
  const framed = overlaySpreadsheetPictures(source, state, pictures);
  const moved = mutatePart(framed, drawingPath(framed), (xml) =>
    xml.replace("<xdr:row>9</xdr:row>", "<xdr:row>6</xdr:row>")
  );
  expect(() => synchronizeSpreadsheetPictureAnchors(moved, fields)).toThrow(
    "cannot overlap"
  );
});

test("publication resets an admin photo but preserves its frame extent and static shared media", () => {
  const before = filled();
  const shared = mutatePart(before, drawingPath(before), (xml) =>
    xml.replace(
      "</xdr:wsDr>",
      `${xml
        .slice(xml.indexOf("<xdr:oneCellAnchor"), xml.indexOf("</xdr:wsDr>"))
        .replace('name="folio_picture_folio_photo"', 'name="Logo"')
        .replace('id="1"', 'id="2"')}</xdr:wsDr>`
    )
  );
  const workbook = readSpreadsheetWorkbook(
    resetSpreadsheetPicturePlaceholders(shared, contract)
  );
  expect(readSpreadsheetPictures(workbook, contract).size).toBe(0);
  expect(
    readSpreadsheetPictures(workbook, contract, {
      includePlaceholders: true,
    }).get("folio_photo")
  ).toMatchObject({ height: 9525, width: 9525 });
  expect(
    Object.keys(workbook.archive).filter((name) => name.startsWith("xl/media/"))
  ).toHaveLength(2);
  expect(
    Object.values(workbook.archive).some((bytes) =>
      Buffer.from(bytes).equals(Buffer.from(png))
    )
  ).toBe(true);
});

test("rejects duplicate frames even though placeholders do not count as answers", () => {
  const framed = resetSpreadsheetPicturePlaceholders(empty, contract);
  const duplicate = mutatePart(framed, drawingPath(framed), (xml) =>
    xml.replace(
      "</xdr:wsDr>",
      `${xml.slice(xml.indexOf("<xdr:oneCellAnchor"), xml.indexOf("</xdr:wsDr>"))}</xdr:wsDr>`
    )
  );
  expect(() =>
    readSpreadsheetPictures(readSpreadsheetWorkbook(duplicate), contract)
  ).toThrow("Duplicate");
});

test("replacing and removing pictures retires old media without accumulating files", () => {
  const before = filled();
  const originalMedia = Object.keys(
    readSpreadsheetWorkbook(before).archive
  ).filter((name) => name.startsWith("xl/media/"));
  const replaced = overlaySpreadsheetPictures(before, contract, pictures);
  const workbook = readSpreadsheetWorkbook(replaced);
  expect(
    Object.keys(workbook.archive).filter((name) => name.startsWith("xl/media/"))
  ).toHaveLength(1);
  expect(workbook.archive[originalMedia[0]!]).toBeUndefined();
  expect(readSpreadsheetPictures(workbook, contract).size).toBe(1);
  const removed = readSpreadsheetWorkbook(
    overlaySpreadsheetPictures(replaced, contract, new Map())
  );
  expect(readSpreadsheetPictures(removed, contract).size).toBe(0);
  expect(
    Object.keys(removed.archive).filter((name) => name.startsWith("xl/media/"))
  ).toHaveLength(0);
  // Immutable previous artifacts are untouched.
  expect(
    readSpreadsheetPictures(readSpreadsheetWorkbook(before), contract).size
  ).toBe(1);
});

test("the trusted template's static image and shared media survive picture removal", () => {
  const before = filled();
  const shared = mutatePart(before, drawingPath(before), (xml) =>
    xml.replace(
      "</xdr:wsDr>",
      `${xml
        .slice(xml.indexOf("<xdr:oneCellAnchor"), xml.indexOf("</xdr:wsDr>"))
        .replace('name="folio_picture_folio_photo"', 'name="Logo"')
        .replace('id="1"', 'id="2"')}</xdr:wsDr>`
    )
  );
  const removed = readSpreadsheetWorkbook(
    overlaySpreadsheetPictures(shared, contract, new Map())
  );
  expect(
    Object.keys(removed.archive).filter((name) => name.startsWith("xl/media/"))
  ).toHaveLength(1);
  expect(readSpreadsheetPictures(removed, contract).size).toBe(0);
});

test("rejects moved and duplicated mapped pictures", () => {
  const before = filled();
  const moved = mutatePart(before, drawingPath(before), (xml) =>
    xml.replace("<xdr:col>0</xdr:col>", "<xdr:col>2</xdr:col>")
  );
  expect(() =>
    readSpreadsheetPictures(readSpreadsheetWorkbook(moved), contract)
  ).toThrow("outside its field");
  const duplicate = mutatePart(before, drawingPath(before), (xml) =>
    xml.replace(
      "</xdr:wsDr>",
      `${xml.slice(
        xml.indexOf("<xdr:oneCellAnchor"),
        xml.indexOf("</xdr:wsDr>")
      )}</xdr:wsDr>`
    )
  );
  expect(() =>
    readSpreadsheetPictures(readSpreadsheetWorkbook(duplicate), contract)
  ).toThrow("Duplicate");
});

test("uses DOCX byte and dimension validation for image payloads", () => {
  const before = filled();
  const media = Object.keys(readSpreadsheetWorkbook(before).archive).find(
    (name) => name.startsWith("xl/media/")
  )!;
  const invalid = mutatePart(before, media, () => "not a picture");
  expect(() =>
    readSpreadsheetPictures(readSpreadsheetWorkbook(invalid), contract)
  ).toThrow("valid JPEG or PNG");
  const oversized = Uint8Array.from(png);
  new DataView(oversized.buffer).setUint32(16, 4097);
  const output = overlaySpreadsheetPictures(
    empty,
    contract,
    new Map([["folio_photo", { bytes: oversized, height: 9525, width: 9525 }]])
  );
  expect(() =>
    readSpreadsheetPictures(readSpreadsheetWorkbook(output), contract)
  ).toThrow("width exceeds");
});

test("restores pictures at relocated named ranges after server table row changes", () => {
  const relocated = mutatePart(
    mutatePart(empty, "xl/workbook.xml", (xml) =>
      xml.replace("$A$1:$B$2", "$A$3:$B$4")
    ),
    "xl/worksheets/sheet1.xml",
    (xml) => xml.replace("A1:B2", "A3:B4")
  );
  const next = resolveSpreadsheetContract(
    bindings,
    readSpreadsheetWorkbook(relocated)
  );
  const output = overlaySpreadsheetPictures(
    relocated,
    next,
    readSpreadsheetPictures(readSpreadsheetWorkbook(filled()), contract)
  );
  expect(
    readSpreadsheetPictures(readSpreadsheetWorkbook(output), next).size
  ).toBe(1);
});
