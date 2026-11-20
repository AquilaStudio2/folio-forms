import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// oxlint-disable sort-keys -- Fixture schema mirrors designer field order.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";
import { protectSpreadsheet } from "../../src/documents/spreadsheets/protection";
import {
  normalizeSpreadsheetUploadPocAnchors,
  savedSpreadsheetUploadPocButtons,
  savedSpreadsheetUploadPocBindingComplete,
  spreadsheetUploadPocCommand,
  spreadsheetUploadPocTargets,
  stripSpreadsheetUploadPoc,
  validateSpreadsheetAttachmentButtons,
  uploadPocGuid,
  uploadPocPreview,
} from "../../src/documents/spreadsheets/upload-poc";
import { readUploadPocMetadata } from "../../src/documents/spreadsheets/upload-poc-package";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  extractSpreadsheetData,
} from "../../src/documents/spreadsheets/workbook";
import { fixtureWorkbook } from "../spreadsheet-unit/fixture";
import {
  SpreadsheetRuntime,
  workbookXml,
  descendants,
} from "./runtime-fixture";
import type { XmlNode } from "./runtime-fixture";

const runtime = new SpreadsheetRuntime();
const bindings = spreadsheetBindingSchema.parse({
  fields: [
    {
      anchor: "folio_scalar",
      id: "folio_scalar",
      key: "document",
      label: "Document",
      type: "text",
    },
  ],
  table: {
    anchor: "folio_body",
    columns: [
      {
        id: "folio_quantity",
        key: "quantity",
        label: "Quantity",
        type: "number",
        offset: 0,
      },
      {
        id: "folio_attachment",
        key: "attachment",
        label: "Attachment",
        type: "text",
        offset: 1,
      },
      {
        id: "folio_total",
        key: "total",
        label: "Total",
        type: "number",
        computed: true,
        offset: 2,
      },
    ],
    id: "folio_table",
    key: "items",
    label: "Items",
  },
  version: 1,
});
const targets = [
  {
    anchor: "folio_scalar",
    bindingId: "folio_scalar",
    kind: "field",
    sheet: "Form",
    tag: "document",
  },
  {
    anchor: "folio_column_folio_attachment",
    bindingId: "folio_attachment",
    bodyAnchor: "folio_body",
    columnOffset: 1,
    kind: "column",
    sheet: "Form",
    tag: "items.attachment",
  },
] as const;
const oleCount = (bytes: Uint8Array): number => {
  const xml = workbookXml(bytes);
  return new Set(
    descendants(xml.sheet, "oleObject")
      .filter((object) => object.attributes.progId === uploadPocGuid)
      .map((object) => object.attributes.shapeId)
  ).size;
};

const assertCompactGeometry = (
  rawAppended: Uint8Array,
  appended: Uint8Array
): void => {
  const rawXml = workbookXml(rawAppended);
  const normalizedXml = workbookXml(appended);
  for (const [name, part] of Object.entries(rawXml.entries)) {
    if (/^xl\/drawings\/drawing\d+\.xml$/u.test(name)) {
      expect(normalizedXml.entries[name]).toEqual(part);
    }
  }
  const normalizedObjects = descendants(
    normalizedXml.sheet,
    "oleObject"
  ).filter((node) => descendants(node, "objectPr").length > 0);
  expect(normalizedObjects).toHaveLength(4);
  for (const object of normalizedObjects) {
    expect(descendants(object, "objectPr")[0]?.attributes.locked).toBe("0");
    const [from] = descendants(object, "from");
    const [to] = descendants(object, "to");
    if (!from || !to) {
      throw new Error("Missing normalized OLE endpoints");
    }
    const coordinate = (node: typeof from, name: string) =>
      Number(descendants(node, name)[0]?.text);
    expect(coordinate(to, "col")).toBe(coordinate(from, "col"));
    expect(coordinate(to, "row")).toBe(coordinate(from, "row"));
    expect(coordinate(from, "colOff")).toBe(0);
    expect(coordinate(from, "rowOff")).toBe(0);
    const width = coordinate(to, "colOff");
    const height = coordinate(to, "rowOff");
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(110 * 9525);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThanOrEqual(24 * 9525);
    expect(width / height).toBeCloseTo(110 / 24, 4);
  }
  const normalizedVml = Object.keys(normalizedXml.entries).find((name) =>
    name.endsWith(".vml")
  );
  if (!normalizedVml) {
    throw new Error("Missing normalized POC previews");
  }
  for (const shape of descendants(
    normalizedXml.parse(normalizedVml),
    "shape"
  )) {
    expect(descendants(shape, "Locked")[0]?.text).toBe("False");
    const style = shape.attributes.style ?? "";
    const width = Number(
      /width:(?<width>[0-9.]+)pt/u.exec(style)?.groups?.width
    );
    const height = Number(
      /height:(?<height>[0-9.]+)pt/u.exec(style)?.groups?.height
    );
    expect(width).toBeLessThanOrEqual(110 * 0.75);
    expect(height).toBeLessThanOrEqual(24 * 0.75);
    expect(width / height).toBeCloseTo(110 / 24, 5);
    const endpoint =
      descendants(shape, "Anchor")[0]?.text.split(",").map(Number) ?? [];
    expect(endpoint).toHaveLength(8);
    expect(endpoint[4]).toBe(endpoint[0]);
    expect(endpoint[6]).toBe(endpoint[2]);
    expect(endpoint[5]).toBe(Math.round(width / 0.75));
    expect(endpoint[7]).toBe(Math.round(height / 0.75));
  }
};

const assertSavedButtonProof = (placed: Uint8Array): void => {
  expect(savedSpreadsheetUploadPocButtons(placed, bindings)).toEqual(
    expect.arrayContaining([
      { bindingId: "folio_scalar", tag: "document", rowIndex: null },
      { bindingId: "folio_attachment", tag: "items.attachment", rowIndex: 0 },
      { bindingId: "folio_attachment", tag: "items.attachment", rowIndex: 1 },
    ])
  );
  expect(savedSpreadsheetUploadPocButtons(placed, bindings)).toHaveLength(3);
  expect(
    savedSpreadsheetUploadPocBindingComplete(placed, bindings, "folio_scalar")
  ).toBe(true);
  expect(
    savedSpreadsheetUploadPocBindingComplete(
      placed,
      bindings,
      "folio_attachment"
    )
  ).toBe(true);
  expect(
    savedSpreadsheetUploadPocBindingComplete(placed, bindings, "folio_unknown")
  ).toBe(false);

  expect(
    savedSpreadsheetUploadPocButtons(
      stripSpreadsheetUploadPoc(placed),
      bindings
    )
  ).toEqual([]);
  const renamedBindings = structuredClone(bindings);
  const [scalar] = renamedBindings.fields;
  if (!scalar) {
    throw new Error("Missing scalar fixture");
  }
  scalar.key = "renamed_document";
  expect(
    savedSpreadsheetUploadPocButtons(placed, renamedBindings)
  ).not.toContainEqual(expect.objectContaining({ bindingId: "folio_scalar" }));

  const { entries } = workbookXml(placed);
  const sheet = "xl/worksheets/sheet1.xml";
  const xml = strFromU8(entries[sheet] ?? new Uint8Array());
  const moved = xml.replace(
    /(?<prefix><from>[\s\S]*?<xdr:row>)\d+/u,
    (_match, prefix: string) => `${prefix}99`
  );
  expect(moved).not.toBe(xml);
  const movedButtons = savedSpreadsheetUploadPocButtons(
    zipSync({ ...entries, [sheet]: strToU8(moved) }),
    bindings
  );
  expect(movedButtons).toHaveLength(2);
};

const assertNativeSelectionDeletion = async (
  placed: Uint8Array
): Promise<void> => {
  const { spreadsheetSelectionCommand } =
    // @ts-expect-error -- Plugin command is serialized into the native sandbox.
    await import("../../../onlyoffice-plugin/src/spreadsheet-commands.js");
  const { spreadsheetUploadPocCleanupCommand, selectedUploadPocBinding } =
    // @ts-expect-error -- Plugin command is serialized into the native sandbox.
    await import("../../../onlyoffice-plugin/src/spreadsheet-upload-poc.js");
  await runtime.write(
    "selection-input.xlsx",
    normalizeSpreadsheetUploadPocAnchors(placed)
  );
  await runtime.run(`builder.OpenFile("/work/selection-input.xlsx");
var sheet=Api.GetActiveSheet();
sheet.GetRange("A20").Select();
var scalar=sheet.GetAllOleObjects().filter(function(object){return JSON.parse(object.GetData()).bindingId==="folio_scalar";})[0];
scalar.Select(true);
// Headless DocBuilder has no selection controller. Seed only its native UI
// selection flag, then exercise the real GetSelectedDrawings implementation.
var headless=!scalar.Drawing.getDrawingObjectsController();
if(headless)scalar.Drawing.selected=true;
Asc.scope=Asc.scope||{};
Asc.scope.folioSpreadsheetAnchors=["folio_scalar","folio_body","folio_column_folio_attachment","_folio_upload_poc_folio_scalar","_folio_upload_poc_folio_attachment"];
var selectionCommand=${spreadsheetSelectionCommand.toString()};
var selected=JSON.parse(selectionCommand());
var count=sheet.GetSelectedDrawings().length;
var image=sheet.GetAllImages()[0];
scalar.Drawing.selected=false;image.Drawing.selected=true;
var imageSelection=JSON.parse(selectionCommand());
scalar.Drawing.selected=true;
var multipleSelection=JSON.parse(selectionCommand());
image.Drawing.selected=false;
sheet.GetRange("F20").SetValue(JSON.stringify({selected:selected,count:count,headless:headless,imageSelection:imageSelection,multipleSelection:multipleSelection}));
Asc.scope.folioSpreadsheetUploadPocCleanup=["_folio_upload_poc_folio_scalar"];
var cleanupCommand=${spreadsheetUploadPocCleanupCommand.toString()};
if(cleanupCommand()!==true)throw new Error("POC marker cleanup failed");
if(Api.GetDefName("folio_scalar").Delete()!==true)throw new Error("Scalar anchor cleanup failed");
builder.SaveFile("xlsx","/work/deletion-staged.xlsx");
builder.CloseFile();`);
  const staged = await runtime.read("deletion-staged.xlsx");
  const proof = JSON.parse(
    String(readSpreadsheetWorkbook(staged).cells.get("F20")?.value)
  );
  expect(proof.count).toBe(1);
  expect(proof.headless).toBe(true);
  expect(() =>
    selectedUploadPocBinding(proof.imageSelection, bindings, uploadPocGuid)
  ).toThrow();
  expect(() =>
    selectedUploadPocBinding(proof.multipleSelection, bindings, uploadPocGuid)
  ).toThrow();
  expect(proof.selected.drawing).toMatchObject({
    count: 1,
    applicationId: uploadPocGuid,
    from: { column: 1, row: 1 },
  });
  expect(
    selectedUploadPocBinding(proof.selected, bindings, uploadPocGuid)
  ).toMatchObject({
    address: "B2",
    entry: [
      "field",
      { id: "folio_scalar", key: "document", label: "Document" },
    ],
  });

  const remainingBindings = structuredClone(bindings);
  remainingBindings.fields = [];
  const remainingTargets = spreadsheetUploadPocTargets(
    staged,
    remainingBindings
  );
  expect(remainingTargets.map((target) => target.bindingId)).toEqual([
    "folio_attachment",
  ]);
  const canonical = normalizeSpreadsheetUploadPocAnchors(
    stripSpreadsheetUploadPoc(
      staged,
      new Set(remainingTargets.map((target) => target.bindingId))
    )
  );
  expect(oleCount(canonical)).toBe(2);
  expect(
    workbookXml(canonical).names._folio_upload_poc_folio_scalar
  ).toBeUndefined();
  await runtime.write("deletion-canonical.xlsx", canonical);
  await runtime.run(`builder.OpenFile("/work/deletion-canonical.xlsx");
var sheet=Api.GetActiveSheet();
var state={objects:sheet.GetAllOleObjects().map(function(object){return JSON.parse(object.GetData());}),images:sheet.GetAllImages().map(function(image){return image.GetName();})};
sheet.GetRange("F21").SetValue(JSON.stringify(state));
builder.SaveFile("xlsx","/work/deletion-reopened.xlsx");
builder.CloseFile();`);
  const reopened = await runtime.read("deletion-reopened.xlsx");
  const workbook = readSpreadsheetWorkbook(reopened);
  const state = JSON.parse(String(workbook.cells.get("F21")?.value));
  expect(state.objects).toHaveLength(2);
  expect(state.objects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        bindingId: "folio_attachment",
        rowIndex: 0,
        tag: "items.attachment",
      }),
      expect.objectContaining({
        bindingId: "folio_attachment",
        rowIndex: 1,
        tag: "items.attachment",
      }),
    ])
  );
  expect(state.images).toContain("ordinary_author_image");
  expect(workbook.cells.get("B2")?.value).toBe("original");
  expect(workbook.cells.get("A5")?.value).toBe(3);
  expect(workbook.cells.get("B5")?.value).toBe("keep");
  expect(workbook.cells.get("C5")?.formula).toBe("A5*2");
};

const assertNativeActivation = async (
  protectedBytes: Uint8Array
): Promise<void> => {
  // Native XLSX import drops OLE clientData in 9.4; verify the narrowly
  // scoped editor-init compatibility command, rather than trusting XML flags.
  const { spreadsheetUploadPocActivationCommand } =
    // @ts-expect-error -- Plugin command is JavaScript serialized into the native sandbox.
    await import("../../../onlyoffice-plugin/src/spreadsheet-upload-poc-activation.js");
  await runtime.write("activation-input.xlsx", protectedBytes);
  await runtime.run(`builder.OpenFile("/work/activation-input.xlsx");
var sheet=Api.GetActiveSheet();
var before=sheet.GetAllOleObjects().map(function(o){return o.Drawing.getProtectionLocked();});
var command=${spreadsheetUploadPocActivationCommand.toString()};
var activated=JSON.parse(command(${JSON.stringify({ guid: uploadPocGuid, bindings })}));
if(!activated.ok)throw new Error(activated.error);
var state={before:before,result:activated,objects:sheet.GetAllOleObjects().map(function(o){return {app:o.GetApplicationId(),locked:o.Drawing.getProtectionLocked(),noMove:o.GetLockValue("noMove"),noResize:o.GetLockValue("noResize"),noSelect:o.GetLockValue("noSelect")};}),images:sheet.GetAllImages().map(function(o){return {name:o.GetName(),locked:o.Drawing.getProtectionLocked()};})};
sheet.GetRange("B5").SetValue(JSON.stringify(state));
builder.SaveFile("xlsx","/work/activation-proof.xlsx");
builder.CloseFile();`);
  const activationProof = await runtime.read("activation-proof.xlsx");
  const state = JSON.parse(
    String(readSpreadsheetWorkbook(activationProof).cells.get("B5")?.value)
  );
  expect(state.before).toEqual([true, true, true, true]);
  expect(state.result.ok).toBe(true);
  expect(state.objects).toHaveLength(4);
  for (const object of state.objects) {
    expect(object).toMatchObject({
      app: uploadPocGuid,
      locked: false,
      noMove: true,
      noResize: true,
      noSelect: false,
    });
  }
  expect(state.images).toContainEqual({
    name: "ordinary_author_image",
    locked: true,
  });
  expect(
    descendants(workbookXml(activationProof).sheet, "sheetProtection")[0]
      ?.attributes.objects
  ).toBe("1");
};

const assertVmlGeometry = (
  xml: {
    entries: Record<string, Uint8Array>;
    parse: (path: string) => XmlNode;
  },
  previews: readonly {
    column: number;
    row: number;
    shapeId: string | undefined;
    width: number;
  }[]
) => {
  const vmlPart = Object.keys(xml.entries).find((name) =>
    name.endsWith(".vml")
  );
  if (!vmlPart) {
    throw new Error("Missing native VML previews");
  }
  const shapes = descendants(xml.parse(vmlPart), "shape");
  for (const preview of previews) {
    const shape = shapes.find(
      (candidate) => candidate.attributes.id === `_x0000_s${preview.shapeId}`
    );
    if (!shape) {
      throw new Error("Missing matching native VML preview");
    }
    const style = shape.attributes.style ?? "";
    const width = Number(
      /width:(?<width>[0-9.]+)pt/u.exec(style)?.groups?.width
    );
    const height = Number(
      /height:(?<height>[0-9.]+)pt/u.exec(style)?.groups?.height
    );
    const anchor = descendants(shape, "Anchor")[0]?.text.split(",").map(Number);
    expect(anchor).toEqual([
      preview.column,
      0,
      preview.row,
      0,
      preview.column,
      Math.round(width / 0.75),
      preview.row,
      Math.round(height / 0.75),
    ]);
    if (preview.width === 0) {
      expect(width).toBe(0);
      expect(height).toBe(0);
    } else {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  }
};

describe.skipIf(process.env.RUN_SPREADSHEET_RUNTIME !== "1")(
  "display-only upload OLE POC in ONLYOFFICE 9.4",
  () => {
    beforeAll(() => runtime.start(), 120_000);
    afterAll(() => runtime.stop(), 120_000);
    test.each([
      { axis: "column", size: 0 },
      { axis: "column", size: 12 },
      { axis: "row", size: 0 },
      { axis: "row", size: 22 },
      { axis: "column", size: 12, hidden: "true" },
      { axis: "row", size: 22, hidden: "true" },
    ])(
      "cold hidden attachment geometry (%j) preserves physical bindings",
      async (variant) => {
        const hiddenBindings = spreadsheetBindingSchema.parse({
          version: 1,
          fields: [],
          table: {
            id: "folio_rows",
            anchor: "folio_rows",
            key: "rows",
            label: "Rows",
            columns: [
              {
                id: "folio_hidden",
                key: "hidden",
                label: "Hidden",
                offset: 0,
                type: "text",
                attachment: { mode: "legacy", category: "Proof" },
              },
              {
                id: "folio_adjacent",
                key: "adjacent",
                label: "Adjacent",
                offset: 1,
                type: "text",
                attachment: { mode: "legacy", category: "Other" },
              },
            ],
          },
        });
        const source = fixtureWorkbook({
          cells: [
            { address: "C10", value: "KEEP" },
            { address: "D10", value: "NEXT" },
            { address: "C11", value: "KEEP NEXT ROW" },
            { address: "D11", value: "NEXT ROW" },
          ],
          merges: [],
          names: {
            folio_rows: "'Form'!$C$10:$D$11",
            _folio_upload_poc_folio_hidden: "'Form'!$C$10:$C$11",
            _folio_upload_poc_folio_adjacent: "'Form'!$D$10:$D$11",
          },
        });
        const entries = unzipSync(source);
        const sheetPart = entries["xl/worksheets/sheet1.xml"];
        if (!sheetPart) {
          throw new Error("Missing fixture worksheet");
        }
        const sheet = strFromU8(sheetPart);
        entries["xl/worksheets/sheet1.xml"] = strToU8(
          variant.axis === "column"
            ? sheet.replace(
                "<sheetData>",
                `<cols><col min="3" max="3" width="${variant.size}" customWidth="1" hidden="1"/></cols><sheetData>`
              )
            : sheet.replace(
                '<row r="10"',
                `<row hidden="1" ht="${variant.size}" customHeight="1" r="10"`
              )
        );
        const input = zipSync(entries);
        const hidden = variant.hidden ?? "1";
        const inputName = `hidden-cold-${variant.axis}-${variant.size}-${hidden}.xlsx`;
        const outputName = `hidden-initialized-${variant.axis}-${variant.size}-${hidden}.xlsx`;
        await runtime.write(inputName, input);
        await runtime.runJob(inputName, {
          outputName,
          uploadPocTargets: spreadsheetUploadPocTargets(input, hiddenBindings),
        });
        const native = await runtime.read(outputName);
        const nativeEntries = unzipSync(native);
        const nativeSheet = nativeEntries["xl/worksheets/sheet1.xml"];
        if (!nativeSheet) {
          throw new Error("Missing native worksheet");
        }
        const nativeXml = strFromU8(nativeSheet);
        const hiddenDefinition =
          variant.axis === "column"
            ? /<col\b(?=[^>]*\bmin="3")(?=[^>]*\bmax="3")[^>]*>/u
            : /<row\b(?=[^>]*\br="10")[^>]*>/u;
        const definition = hiddenDefinition.exec(nativeXml)?.[0];
        const sizeAttribute = variant.axis === "column" ? "width" : "ht";
        if (!definition) {
          throw new Error("Missing native hidden definition");
        }
        expect(definition).toContain(' hidden="1"');
        expect(definition).toContain(` ${sizeAttribute}="${variant.size}"`);
        // Builder canonicalizes the boolean; patch the bytes sent to the normalizer.
        const inputDefinition = definition.replace(
          ' hidden="1"',
          ` hidden="${hidden}"`
        );
        const withDefinition = (value: string) =>
          zipSync({
            ...nativeEntries,
            "xl/worksheets/sheet1.xml": strToU8(
              nativeXml.replace(hiddenDefinition, value)
            ),
          });
        const initialized = normalizeSpreadsheetUploadPocAnchors(
          variant.hidden ? withDefinition(inputDefinition) : native
        );
        for (const invalidSize of ["-1", "NaN"]) {
          const malformed = withDefinition(
            inputDefinition.replace(
              ` ${sizeAttribute}="${variant.size}"`,
              ` ${sizeAttribute}="${invalidSize}"`
            )
          );
          expect(() => normalizeSpreadsheetUploadPocAnchors(malformed)).toThrow(
            variant.axis === "column"
              ? /invalid column width/u
              : /invalid row height/u
          );
        }
        const contract = resolveSpreadsheetContract(
          hiddenBindings,
          readSpreadsheetWorkbook(initialized)
        );
        const protectedBytes = protectSpreadsheet(initialized, contract);
        validateSpreadsheetAttachmentButtons(protectedBytes, hiddenBindings);
        expect(
          savedSpreadsheetUploadPocButtons(protectedBytes, hiddenBindings)
        ).toEqual(
          expect.arrayContaining([
            { bindingId: "folio_hidden", tag: "rows.hidden", rowIndex: 0 },
            { bindingId: "folio_adjacent", tag: "rows.adjacent", rowIndex: 0 },
            { bindingId: "folio_hidden", tag: "rows.hidden", rowIndex: 1 },
            { bindingId: "folio_adjacent", tag: "rows.adjacent", rowIndex: 1 },
          ])
        );
        const xml = workbookXml(protectedBytes);
        const definitions = descendants(
          xml.sheet,
          variant.axis === "column" ? "col" : "row"
        );
        expect(definitions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              attributes: expect.objectContaining(
                variant.axis === "column"
                  ? {
                      min: "3",
                      max: "3",
                      width: String(variant.size),
                      hidden,
                    }
                  : { r: "10", ht: String(variant.size), hidden }
              ),
            }),
          ])
        );
        expect(descendants(xml.sheet, "sheetProtection")).toHaveLength(1);
        // Native AlternateContent also contains legacy fallback copies without
        // objectPr/anchors. Assert the authoritative modern previews.
        const previews = descendants(xml.sheet, "oleObject")
          .filter((object) => descendants(object, "objectPr").length > 0)
          .map((object) => {
            const [from] = descendants(object, "from");
            const [to] = descendants(object, "to");
            if (!from || !to) {
              throw new Error("Missing native preview anchor");
            }
            return {
              shapeId: object.attributes.shapeId,
              column: Number(descendants(from, "col")[0]?.text),
              row: Number(descendants(from, "row")[0]?.text),
              endRow: Number(descendants(to, "row")[0]?.text),
              endColumn: Number(descendants(to, "col")[0]?.text),
              width: Number(descendants(to, "colOff")[0]?.text),
              height: Number(descendants(to, "rowOff")[0]?.text),
            };
          });
        expect(previews).toHaveLength(4);
        expect(previews).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ column: 2, row: 9 }),
            expect.objectContaining({ column: 3, row: 9 }),
            expect.objectContaining({ column: 2, row: 10 }),
            expect.objectContaining({ column: 3, row: 10 }),
          ])
        );
        const collapsed = previews.filter((preview) =>
          variant.axis === "column" ? preview.column === 2 : preview.row === 9
        );
        const visible = previews.filter((preview) =>
          variant.axis === "column" ? preview.column === 3 : preview.row === 10
        );
        expect(collapsed).toHaveLength(2);
        expect(visible).toHaveLength(2);
        for (const preview of previews) {
          expect(preview.endColumn).toBe(preview.column);
          expect(preview.endRow).toBe(preview.row);
        }
        for (const preview of collapsed) {
          expect(preview.width).toBe(0);
          expect(preview.height).toBe(0);
        }
        for (const preview of visible) {
          expect(preview.width).toBeGreaterThan(0);
          expect(preview.height).toBeGreaterThan(0);
        }
        assertVmlGeometry(xml, previews);
        expect(
          readSpreadsheetWorkbook(protectedBytes).cells.get("D10")?.value
        ).toBe("NEXT");
      },
      120_000
    );
    test("legacy and template attachment columns keep every body button across delete, append and rejected last-row delete", async () => {
      const tableBindings = spreadsheetBindingSchema.parse({
        version: 1,
        fields: [],
        table: {
          id: "folio_table",
          anchor: "folio_body",
          key: "items",
          label: "Items",
          columns: [
            {
              id: "folio_value",
              key: "value",
              label: "Value",
              type: "text",
              offset: 0,
            },
            {
              id: "folio_legacy",
              key: "legacy",
              label: "Legacy",
              type: "text",
              offset: 1,
              attachment: { category: "Proof", mode: "legacy" },
            },
            {
              id: "folio_template",
              key: "template",
              label: "Template",
              type: "text",
              offset: 2,
              attachment: {
                mode: "template",
                document_category_id: 42,
                storage_template_id: "00000000-0000-4000-8000-000000000042",
                template_name: "Proof",
              },
            },
          ],
        },
      });
      const columnTargets = [
        {
          anchor: "folio_column_folio_legacy",
          bindingId: "folio_legacy",
          bodyAnchor: "folio_body",
          columnOffset: 1,
          kind: "column",
          sheet: "Form",
          tag: "items.legacy",
        },
        {
          anchor: "folio_column_folio_template",
          bindingId: "folio_template",
          bodyAnchor: "folio_body",
          columnOffset: 2,
          kind: "column",
          sheet: "Form",
          tag: "items.template",
        },
      ] as const;
      await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet();sheet.SetName("Form");
sheet.GetRange("A4").SetValue("survivor");
sheet.GetRange("B4").SetValue("https://fixture.invalid/saved-original");
Api.AddDefName("folio_body","'Form'!$A$4:$C$5",false);
Api.AddDefName("folio_columns_folio_table","'Form'!$A$4:$C$5",false);
Api.AddDefName("folio_column_folio_value","'Form'!$A$4:$A$5",false);
Api.AddDefName("folio_column_folio_legacy","'Form'!$B$4:$B$5",false);
Api.AddDefName("folio_column_folio_template","'Form'!$C$4:$C$5",false);
var command=${spreadsheetUploadPocCommand.toString()};
var result=JSON.parse(command(${JSON.stringify({ guid: uploadPocGuid, mark: true, preview: uploadPocPreview, targets: columnTargets })}));
if(!result.ok)throw new Error(result.error);
builder.SaveFile("xlsx","/work/two-column-buttons.xlsx");builder.CloseFile();`);
      let bytes = await runtime.read("two-column-buttons.xlsx");
      validateSpreadsheetAttachmentButtons(bytes, tableBindings);
      expect(
        savedSpreadsheetUploadPocButtons(bytes, tableBindings)
      ).toHaveLength(4);
      const initialBook = readSpreadsheetWorkbook(bytes);
      const archive = { ...initialBook.archive };
      const sheetBytes = archive[initialBook.sheetPath];
      if (!sheetBytes) {
        throw new Error("The native fixture worksheet is missing");
      }
      archive[initialBook.sheetPath] = strToU8(
        strFromU8(sheetBytes).replace(/<oleObject\b[\s\S]*?<\/oleObject>/u, "")
      );
      expect(() =>
        validateSpreadsheetAttachmentButtons(zipSync(archive), tableBindings)
      ).toThrow();
      // oxlint-disable no-await-in-loop -- Each transition consumes the preceding saved native workbook.
      for (const [step, action, index, count] of [
        ["one", "delete", 1, 1],
        ["append", "insert", 1, 2],
        ["one-again", "delete", 1, 1],
      ] as const) {
        const inputName = `${step}-buttons-input.xlsx`;
        const outputName = `${step}-buttons.xlsx`;
        const planned = spreadsheetUploadPocTargets(bytes, tableBindings);
        await runtime.write(inputName, stripSpreadsheetUploadPoc(bytes));
        await runtime.runJob(inputName, {
          outputName,
          rowChange: {
            action,
            bodyName: "folio_body",
            index,
            inputColumns: [0, 1, 2],
          },
          uploadPocTargets: planned,
        });
        bytes = normalizeSpreadsheetUploadPocAnchors(
          await runtime.read(outputName)
        );
        validateSpreadsheetAttachmentButtons(bytes, tableBindings);
        expect(
          savedSpreadsheetUploadPocButtons(bytes, tableBindings)
        ).toHaveLength(count * 2);
        const book = readSpreadsheetWorkbook(bytes);
        expect(book.names.get("folio_body")?.lastRow).toBe(2 + count);
        expect(book.cells.get("A4")?.value).toBe("survivor");
        expect(book.cells.get("B4")?.value).toBe(
          "https://fixture.invalid/saved-original"
        );
        if (count === 2) {
          expect(book.cells.get("A5")?.value ?? null).toBeNull();
          expect(book.cells.get("B5")?.value ?? null).toBeNull();
          expect(book.cells.get("C5")?.value ?? null).toBeNull();
        }
      }
      // oxlint-enable no-await-in-loop
      await runtime.write("sole-buttons.xlsx", bytes);
      await expect(
        runtime
          .runJob("sole-buttons.xlsx", {
            outputName: "forbidden-buttons.xlsx",
            rowChange: {
              action: "delete",
              bodyName: "folio_body",
              index: 0,
              inputColumns: [0, 1, 2],
            },
          })
          .then(() => runtime.read("forbidden-buttons.xlsx"))
      ).rejects.toThrow();
      expect(await runtime.read("sole-buttons.xlsx")).toEqual(bytes);
      validateSpreadsheetAttachmentButtons(bytes, tableBindings);
    }, 120_000);
    test("preserved placement proof rejects a table with one of two canonical row buttons missing", async () => {
      const metadata = {
        bindingId: "folio_attachment",
        kind: "folio-upload-poc",
        rowIndex: 0,
        tag: "items.attachment",
        version: 1,
      };
      await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet();sheet.SetName("Form");
Api.AddDefName("folio_scalar","'Form'!$B$2",false);
Api.AddDefName("folio_body","'Form'!$A$5:$C$6",false);
Api.AddDefName("folio_columns_folio_table","'Form'!$A$5:$C$6",false);
Api.AddDefName("folio_column_folio_quantity","'Form'!$A$5:$A$6",false);
Api.AddDefName("folio_column_folio_attachment","'Form'!$B$5:$B$6",false);
Api.AddDefName("folio_column_folio_total","'Form'!$C$5:$C$6",false);
Api.AddDefName("_folio_upload_poc_folio_attachment","'Form'!$B$5:$B$6",false);
sheet.AddOleObject(${JSON.stringify(uploadPocPreview)},600000,130000,${JSON.stringify(JSON.stringify(metadata))},${JSON.stringify(uploadPocGuid)},1,0,4,0);
builder.SaveFile("xlsx","/work/partial-column.xlsx");builder.CloseFile();`);
      const partial = await runtime.read("partial-column.xlsx");
      expect(spreadsheetUploadPocTargets(partial, bindings)).toHaveLength(1);
      expect(savedSpreadsheetUploadPocButtons(partial, bindings)).toEqual([
        { bindingId: "folio_attachment", rowIndex: 0, tag: "items.attachment" },
      ]);
      expect(
        savedSpreadsheetUploadPocBindingComplete(
          partial,
          bindings,
          "folio_attachment"
        )
      ).toBe(false);
    }, 120_000);
    test("first placement, retry, saved rebuild and appended User row preserve values, formulas, other drawings and protection", async () => {
      const input = {
        guid: uploadPocGuid,
        mark: true,
        preview: uploadPocPreview,
        targets,
      };
      await runtime.run(`builder.CreateFile("xlsx");
var sheet=Api.GetActiveSheet();sheet.SetName("Form");
sheet.GetRange("B:C").SetColumnWidth(24);
sheet.GetRange("B2:C2").Merge(false);sheet.GetRange("B2").SetValue("original");
sheet.GetRange("A5").SetValue(3);sheet.GetRange("B5").SetValue("keep");sheet.GetRange("C5").SetValue("=A5*2");sheet.GetRange("C6").SetValue("=A6*2");
Api.AddDefName("folio_scalar","'Form'!$B$2:$C$2",false);
Api.AddDefName("folio_body","'Form'!$A$5:$C$6",false);
Api.AddDefName("folio_columns_folio_table","'Form'!$A$5:$C$6",false);
Api.AddDefName("folio_column_folio_quantity","'Form'!$A$5:$A$6",false);
Api.AddDefName("folio_column_folio_total","'Form'!$C$5:$C$6",false);
Api.AddDefName("folio_column_folio_attachment","'Form'!$B$5:$B$6",false);
var image=sheet.AddImage(${JSON.stringify(uploadPocPreview)},800000,200000,4,0,1,0);image.SetName("ordinary_author_image");
var command=${spreadsheetUploadPocCommand.toString()};
var input=${JSON.stringify(input)};
var placed=JSON.parse(command(input));if(!placed.ok)throw new Error(placed.error);
var retried=JSON.parse(command(input));if(!retried.ok)throw new Error(retried.error);
if(sheet.GetAllOleObjects().length!==3)throw new Error("Duplicate POC button");
builder.SaveFile("xlsx","/work/placed.xlsx");builder.CloseFile();`);
      const placed = await runtime.read("placed.xlsx");
      expect(oleCount(placed)).toBe(3);
      assertSavedButtonProof(placed);
      await assertNativeSelectionDeletion(placed);
      const placedXml = workbookXml(placed);
      const vmlPart = Object.keys(placedXml.entries).find((name) =>
        name.endsWith(".vml")
      );
      if (!vmlPart) {
        throw new Error("Missing POC preview drawing");
      }
      const previews = descendants(placedXml.parse(vmlPart), "shape");
      expect(previews).toHaveLength(3);
      for (const preview of previews) {
        const height = /height:(?<height>[0-9.]+)pt/u.exec(
          preview.attributes.style ?? ""
        );
        expect(Number(height?.groups?.height)).toBeGreaterThanOrEqual(14);
      }
      const workbook = readSpreadsheetWorkbook(placed);
      const { data } = extractSpreadsheetData(
        workbook,
        resolveSpreadsheetContract(bindings, workbook),
        false
      );
      expect(data).toMatchObject({
        document: "original",
        items: [{ attachment: "keep", quantity: 3, total: 6 }],
      });
      const packageEntries = workbookXml(placed).entries;
      const embedded = Object.entries(packageEntries).filter(([name]) =>
        name.startsWith("xl/embeddings/")
      );
      expect(embedded).toHaveLength(3);
      const [firstEmbedded] = embedded;
      if (!firstEmbedded) {
        throw new Error("Missing POC embedding");
      }
      expect(readUploadPocMetadata(firstEmbedded[1]).bindingId).toMatch(
        /^folio_/u
      );
      const mutated = (updates: Record<string, Uint8Array>) =>
        zipSync({ ...packageEntries, ...updates });
      expect(() =>
        readSpreadsheetWorkbook(
          mutated({ [firstEmbedded[0]]: new Uint8Array([1, 2, 3]) })
        )
      ).toThrow(/metadata/u);
      expect(() =>
        readSpreadsheetWorkbook(
          mutated({ "xl/embeddings/orphan.bin": firstEmbedded[1] })
        )
      ).toThrow(/Unreferenced/u);
      const sheetPart = "xl/worksheets/sheet1.xml";
      const sheetText = new TextDecoder().decode(packageEntries[sheetPart]);
      expect(() =>
        stripSpreadsheetUploadPoc(
          mutated({
            [sheetPart]: strToU8(sheetText.replace(/\s+shapeId="[^"]*"/u, "")),
          })
        )
      ).toThrow();
      expect(() =>
        readSpreadsheetWorkbook(
          mutated({
            [sheetPart]: strToU8(
              sheetText.replaceAll(
                uploadPocGuid,
                "asc.{00000000-0000-0000-0000-000000000000}"
              )
            ),
          })
        )
      ).toThrow(/Unsupported/u);
      const hostileMetadata = new Uint8Array(firstEmbedded[1]);
      const hostileText = new TextDecoder().decode(hostileMetadata);
      const kindOffset = hostileText.indexOf("folio-upload-poc");
      // All native bytes before metadata are ASCII/NUL, so locate exact UTF-8 sequence without text-decoder offset assumptions.
      const token = new TextEncoder().encode("folio-upload-poc");
      const byteOffset = hostileMetadata.findIndex((_value, index) =>
        token.every(
          (value, position) => hostileMetadata[index + position] === value
        )
      );
      expect(kindOffset).toBeGreaterThan(0);
      expect(byteOffset).toBeGreaterThan(0);
      hostileMetadata[byteOffset] = 0x78;
      expect(() =>
        readSpreadsheetWorkbook(
          mutated({ [firstEmbedded[0]]: hostileMetadata })
        )
      ).toThrow(/metadata/u);
      const relationsPart = "xl/worksheets/_rels/sheet1.xml.rels";
      const relationText = new TextDecoder().decode(
        packageEntries[relationsPart]
      );
      expect(() =>
        readSpreadsheetWorkbook(
          mutated({
            [relationsPart]: strToU8(
              relationText.replace("Target=", 'TargetMode="External" Target=')
            ),
          })
        )
      ).toThrow(/External|invalid XML/u);
      expect(
        oleCount(stripSpreadsheetUploadPoc(placed, new Set(["folio_scalar"])))
      ).toBe(1);
      const privateNameBytes = new Uint8Array(firstEmbedded[1]);
      const privateName = Buffer.from("\u0001CompObj", "utf16le");
      const privateOffset = privateNameBytes.findIndex((_value, index) =>
        privateName.every(
          (value, position) => privateNameBytes[index + position] === value
        )
      );
      expect(privateOffset).toBeGreaterThan(0);
      privateNameBytes[privateOffset] = 2;
      expect(() =>
        readSpreadsheetWorkbook(
          mutated({ [firstEmbedded[0]]: privateNameBytes })
        )
      ).toThrow(/metadata/u);
      expect(
        stripSpreadsheetUploadPoc(
          placed,
          new Set(["folio_scalar", "folio_attachment"])
        )
      ).toEqual(placed);
      const planned = spreadsheetUploadPocTargets(placed, bindings);
      expect(planned).toHaveLength(2);
      const stripped = stripSpreadsheetUploadPoc(placed);
      expect(oleCount(stripped)).toBe(0);
      expect(
        Object.keys(workbookXml(stripped).entries).filter((name) =>
          name.startsWith("xl/embeddings/")
        )
      ).toHaveLength(0);
      await runtime.write("stripped.xlsx", stripped);
      await runtime.runJob("stripped.xlsx", {
        outputName: "appended.xlsx",
        rowChange: {
          action: "insert",
          bodyName: "folio_body",
          index: 2,
          inputColumns: [0, 1],
        },
        uploadPocTargets: planned,
      });
      const rawAppended = await runtime.read("appended.xlsx");
      const appended = normalizeSpreadsheetUploadPocAnchors(rawAppended);
      assertCompactGeometry(rawAppended, appended);
      expect(oleCount(appended)).toBe(4);
      const next = readSpreadsheetWorkbook(appended);
      const contract = resolveSpreadsheetContract(bindings, next);
      expect(next.names.get("folio_body")?.lastRow).toBe(6);
      expect(next.cells.get("C7")?.formula).toBe("A7*2");
      expect(next.cells.get("B5")?.value).toBe("keep");
      expect(next.cells.get("B7")?.value ?? null).toBeNull();
      expect(spreadsheetUploadPocTargets(appended, bindings)).toHaveLength(2);
      const drawings = workbookXml(appended);
      const drawingPath = Object.keys(drawings.entries).find((name) =>
        /^xl\/drawings\/drawing\d+\.xml$/u.test(name)
      );
      expect(
        drawingPath &&
          descendants(drawings.parse(drawingPath), "cNvPr").some(
            (node) => node.attributes.name === "ordinary_author_image"
          )
      ).toBe(true);
      const protectedBytes = protectSpreadsheet(appended, contract);
      expect(
        descendants(workbookXml(protectedBytes).sheet, "sheetProtection")[0]
          ?.attributes.objects
      ).toBe("1");
      await assertNativeActivation(protectedBytes);
      await runtime.write(
        "protected.xlsx",
        stripSpreadsheetUploadPoc(protectedBytes)
      );
      await runtime.runJob("protected.xlsx", {
        outputName: "reopened.xlsx",
        pdfName: "reopened.pdf",
        uploadPocTargets: spreadsheetUploadPocTargets(protectedBytes, bindings),
      });
      expect(oleCount(await runtime.read("reopened.xlsx"))).toBe(4);
      const reopenedXml = workbookXml(await runtime.read("reopened.xlsx"));
      const reopenedVml = Object.keys(reopenedXml.entries).find((name) =>
        name.endsWith(".vml")
      );
      if (!reopenedVml) {
        throw new Error("Missing saved preview drawing");
      }
      for (const preview of descendants(
        reopenedXml.parse(reopenedVml),
        "shape"
      )) {
        expect(
          Number(
            /height:(?<height>[0-9.]+)pt/u.exec(preview.attributes.style ?? "")
              ?.groups?.height
          )
        ).toBeGreaterThan(0);
      }
      const pdf = await runtime.read("reopened.pdf");
      expect(pdf.byteLength).toBeGreaterThan(1000);
    }, 120_000);
  }
);
