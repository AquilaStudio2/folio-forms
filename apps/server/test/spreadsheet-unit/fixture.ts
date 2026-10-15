// oxlint-disable sort-keys -- Fixture field order mirrors the admin-facing schema.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { spreadsheetBindingSchema } from "../../src/documents/spreadsheets/contract";

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const office =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packages = "http://schemas.openxmlformats.org/package/2006/relationships";

export const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
export interface FixtureCell {
  address: string;
  value?: string | number | boolean;
  formula?: string;
  type?: string;
  style?: number;
}
export interface FixtureOptions {
  cells?: FixtureCell[];
  date1904?: boolean;
  names?: Record<string, string>;
  merges?: string[];
  sharedStrings?: string[];
}

export const fixtureBindings = () =>
  spreadsheetBindingSchema.parse({
    fields: [
      {
        id: "folio_agency",
        anchor: "folio_agency",
        key: "agency",
        label: "Agency",
        type: "text",
        required: true,
      },
      {
        id: "folio_date",
        anchor: "folio_date",
        key: "date",
        label: "Date",
        type: "date",
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
          required: true,
        },
        {
          id: "folio_active",
          key: "active",
          label: "Active",
          type: "boolean",
          offset: 1,
          required: true,
        },
        {
          id: "folio_note",
          key: "note",
          label: "Note",
          type: "text",
          offset: 2,
          required: true,
        },
        {
          id: "folio_total",
          key: "total",
          label: "Total",
          type: "number",
          offset: 3,
          computed: true,
        },
      ],
      id: "folio_table",
      key: "activities",
      label: "Activities",
    },
    version: 1,
  });

export const fixtureWorkbook = (options: FixtureOptions = {}): Uint8Array => {
  const cells = options.cells ?? [
    { address: "A1", value: "Agency" },
    { address: "D1", value: 61 },
    { address: "A3", style: 1, value: "Locked heading" },
    { address: "A4", value: 0 },
    { address: "B4", value: false },
    { address: "C4", style: 1, value: "First" },
    { address: "D4", formula: "A4*2", value: 0 },
    { address: "D5", formula: "A5*2", value: 0 },
    { address: "D6", formula: "A6*2", value: 0 },
    { address: "A7", value: 4 },
    { address: "B7", value: true },
    { address: "C7", value: "Last" },
    { address: "D7", formula: "A7*2", value: 8 },
  ];
  const rows = new Map<string, string[]>();
  for (const cell of cells) {
    const row = /\d+$/u.exec(cell.address)?.[0] ?? "1";
    let { type } = cell;
    if (!type) {
      type = "n";
      if (typeof cell.value === "boolean") {
        type = "b";
      }
      if (typeof cell.value === "string" && !cell.formula) {
        type = "inlineStr";
      }
    }
    const formula =
      cell.formula === undefined ? "" : `<f>${escapeXml(cell.formula)}</f>`;
    let value = "";
    if (cell.value !== undefined) {
      const serialized = escapeXml(
        String(
          typeof cell.value === "boolean" ? Number(cell.value) : cell.value
        )
      );
      value =
        type === "inlineStr"
          ? `<is><t>${serialized}</t></is>`
          : `<v>${serialized}</v>`;
    }
    const xml = `<c r="${cell.address}" t="${type}" s="${cell.style ?? 0}">${formula}${value}</c>`;
    rows.set(row, [...(rows.get(row) ?? []), xml]);
  }
  const names = options.names ?? {
    folio_agency: "'Form'!$A$1:$B$1",
    folio_body: "'Form'!$A$4:$D$8",
    folio_date: "'Form'!$D$1",
  };
  const merges = options.merges ?? ["A1:B1"];
  const entries: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="${packages}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packages}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${office}/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${main}"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="0"/></xf></cellXfs></styleSheet>`,
    "xl/workbook.xml": `<workbook xmlns="${main}" xmlns:r="${office}"><workbookPr date1904="${options.date1904 ? 1 : 0}"/><sheets><sheet name="Form" sheetId="1" r:id="rId1"/></sheets><definedNames>${Object.entries(
      names
    )
      .map(
        ([name, ref]) =>
          `<definedName name="${escapeXml(name)}">${escapeXml(ref)}</definedName>`
      )
      .join("")}</definedNames></workbook>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${main}"><sheetData>${[...rows].map(([row, values]) => `<row r="${row}">${values.join("")}</row>`).join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells></worksheet>`,
  };
  if (options.sharedStrings) {
    entries["xl/sharedStrings.xml"] =
      `<sst xmlns="${main}">${options.sharedStrings.map((value) => `<si><t>${escapeXml(value)}</t></si>`).join("")}</sst>`;
  }
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, xml]) => [name, strToU8(xml)])
    )
  );
};

export const mutatePart = (
  bytes: Uint8Array,
  part: string,
  change: (xml: string) => string
): Uint8Array => {
  const entries = unzipSync(bytes);
  const entry = entries[part];
  if (!entry) {
    throw new Error(`Missing fixture part: ${part}`);
  }
  entries[part] = strToU8(change(strFromU8(entry)));
  return zipSync(entries);
};
