import {
  readTemplateArchive,
  validateOfficeRelationships,
  templateArchiveText,
  parseTemplateXml,
  templateAttribute,
} from "../package";
import {
  parseSpreadsheetRange,
  spreadsheetCellPosition,
  spreadsheetColumnName,
  spreadsheetRangesOverlap,
} from "./contract";
import type {
  SpreadsheetBindings,
  SpreadsheetContract,
  SpreadsheetRange,
  SpreadsheetField,
  SpreadsheetColumn,
} from "./contract";
import { readSpreadsheetPictures } from "./picture-reader";

const mainNamespace =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const contentType =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export interface SpreadsheetCell {
  hasCachedValue: boolean;
  address: string;
  row: number;
  column: number;
  type: string;
  value: string | number | boolean | null;
  formula: string | null;
  style: number;
}
export interface SpreadsheetWorkbook {
  archive: Record<string, Uint8Array>;
  sheet: string;
  sheetPath: string;
  date1904: boolean;
  names: Map<string, SpreadsheetRange>;
  cells: Map<string, SpreadsheetCell>;
  merges: SpreadsheetRange[];
}

export const readSpreadsheetWorkbook = (
  bytes: Uint8Array
): SpreadsheetWorkbook => {
  const archive = readTemplateArchive(bytes, () => true);
  validateOfficeRelationships(archive);
  let workbookType = false;
  parseTemplateXml(templateArchiveText(archive, "[Content_Types].xml"), {
    open: (element) => {
      if (
        element.local === "Override" &&
        templateAttribute(element, "PartName") === "/xl/workbook.xml"
      ) {
        workbookType =
          templateAttribute(element, "ContentType") === contentType;
      }
    },
  });
  if (
    !workbookType ||
    Object.keys(archive).some((name) =>
      /^xl\/(?:externalLinks|embeddings|vbaProject)/iu.test(name)
    )
  ) {
    throw new Error(
      "Expected a non-macro XLSX workbook without external links"
    );
  }
  const sheets: { name: string; relationship: string; state: string }[] = [];
  const rawNames = new Map<string, string>();
  let date1904 = false;
  let name: string | null = null;
  let reference = "";
  parseTemplateXml(templateArchiveText(archive, "xl/workbook.xml"), {
    close: (element) => {
      if (element.local === "definedName" && name !== null) {
        if (name.startsWith("folio_")) {
          if (rawNames.has(name)) {
            throw new Error(`Duplicate binding: ${name}`);
          }
          rawNames.set(name, reference.trim());
        }
        name = null;
      }
    },
    open: (element) => {
      if (element.uri !== mainNamespace) {
        return;
      }
      if (element.local === "workbookPr") {
        date1904 = ["1", "true"].includes(
          templateAttribute(element, "date1904") ?? ""
        );
      }
      if (element.local === "sheet") {
        sheets.push({
          name: templateAttribute(element, "name") ?? "",
          relationship:
            templateAttribute(element, "id", relationshipNamespace) ?? "",
          state: templateAttribute(element, "state") ?? "visible",
        });
      }
      if (element.local === "definedName") {
        name = templateAttribute(element, "name") ?? null;
        reference = "";
        if (
          name?.startsWith("folio_") &&
          templateAttribute(element, "localSheetId") !== undefined
        ) {
          throw new Error("Folio bindings must be workbook-scoped");
        }
      }
    },
    text: (value) => {
      if (name !== null) {
        reference += value;
      }
    },
  });
  const editableSheets = sheets.filter(
    (entry) => entry.name !== "_folio_options"
  );
  const helpers = sheets.filter((entry) => entry.name === "_folio_options");
  const [sheet] = editableSheets;
  if (
    editableSheets.length !== 1 ||
    !sheet?.name ||
    !sheet.relationship ||
    sheet.state !== "visible" ||
    helpers.length > 1 ||
    helpers.some(
      (entry) =>
        !["hidden", "veryHidden"].includes(entry.state) || !entry.relationship
    ) ||
    new Set(sheets.map((entry) => entry.relationship)).size !== sheets.length
  ) {
    throw new Error("Excel templates must contain exactly one worksheet");
  }
  const [helper] = helpers;
  let helperFound = !helper;
  let sheetPath: string | null = null;
  parseTemplateXml(templateArchiveText(archive, "xl/_rels/workbook.xml.rels"), {
    open: (element) => {
      if (
        element.local === "Relationship" &&
        helper &&
        templateAttribute(element, "Id") === helper.relationship
      ) {
        const target = templateAttribute(element, "Target") ?? "";
        const helperPath = target.startsWith("/")
          ? target.slice(1)
          : `xl/${target}`;
        if (
          templateAttribute(element, "Type") !==
            `${relationshipNamespace}/worksheet` ||
          !/^xl\/worksheets\/[^/]+\.xml$/u.test(helperPath) ||
          !archive[helperPath]
        ) {
          throw new Error("Invalid system option worksheet");
        }
        helperFound = true;
      }
      if (
        element.local !== "Relationship" ||
        templateAttribute(element, "Id") !== sheet.relationship
      ) {
        return;
      }
      if (
        templateAttribute(element, "Type") !==
        `${relationshipNamespace}/worksheet`
      ) {
        throw new Error("Invalid worksheet relationship");
      }
      const target = templateAttribute(element, "Target") ?? "";
      sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      if (!/^xl\/worksheets\/[^/]+\.xml$/u.test(sheetPath)) {
        throw new Error("Invalid worksheet path");
      }
    },
  });
  if (!helperFound) {
    throw new Error("System option worksheet is unavailable");
  }
  if (!sheetPath) {
    throw new Error("Worksheet is unavailable");
  }
  const names = new Map(
    [...rawNames].map(([key, value]) => [key, parseSpreadsheetRange(value)])
  );
  if ([...names.values()].some((range) => range.sheet !== sheet.name)) {
    throw new Error("Binding references a missing worksheet");
  }
  const strings: string[] = [];
  if (archive["xl/sharedStrings.xml"]) {
    let text = "";
    let inText = false;
    parseTemplateXml(templateArchiveText(archive, "xl/sharedStrings.xml"), {
      close: (element) => {
        if (element.local === "t") {
          inText = false;
        }
        if (element.local === "si") {
          strings.push(text);
        }
      },
      open: (element) => {
        if (element.local === "si") {
          text = "";
        }
        if (element.local === "t") {
          inText = true;
        }
      },
      text: (value) => {
        if (inText) {
          text += value;
        }
      },
    });
  }
  const cells = new Map<string, SpreadsheetCell>();
  const merges: SpreadsheetRange[] = [];
  let cell: SpreadsheetCell | null = null;
  let cellValue = "";
  let formula = "";
  let capture: "value" | "formula" | "inline" | null = null;
  parseTemplateXml(templateArchiveText(archive, sheetPath), {
    close: (element) => {
      if (["f", "v", "t"].includes(element.local)) {
        capture = null;
      }
      if (element.local !== "c" || !cell) {
        return;
      }
      if (cell.formula !== null) {
        cell.formula = formula;
      }
      if (cell.type === "s") {
        const index = Number(cellValue);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          strings[index] === undefined
        ) {
          throw new Error("Invalid shared string index");
        }
        cell.value = strings[index] as string;
      } else if (["str", "inlineStr", "e", "d"].includes(cell.type)) {
        cell.value = cellValue;
      } else if (cell.type === "b") {
        if (!["0", "1"].includes(cellValue)) {
          throw new Error("Invalid boolean cell");
        }
        cell.value = cellValue === "1";
      } else if (cellValue !== "") {
        const value = Number(cellValue);
        if (!Number.isFinite(value)) {
          throw new TypeError("Invalid numeric cell");
        }
        cell.value = value;
      }
      cells.set(cell.address, cell);
      cell = null;
    },
    open: (element) => {
      if (element.uri !== mainNamespace) {
        return;
      }
      if (element.local === "mergeCell") {
        merges.push(
          parseSpreadsheetRange(
            `'${sheet.name.replaceAll("'", "''")}'!${templateAttribute(element, "ref") ?? ""}`
          )
        );
      }
      if (element.local === "c") {
        const address = templateAttribute(element, "r") ?? "";
        if (cells.has(address)) {
          throw new Error(`Duplicate cell: ${address}`);
        }
        cell = {
          address,
          ...spreadsheetCellPosition(address),
          formula: null,
          hasCachedValue: false,
          style: Number(templateAttribute(element, "s") ?? "0"),
          type: templateAttribute(element, "t") ?? "n",
          value: null,
        };
        cellValue = "";
        formula = "";
      }
      if (!cell) {
        return;
      }
      if (element.local === "f") {
        capture = "formula";
        cell.formula = "";
      }
      if (element.local === "v") {
        capture = "value";
        cell.hasCachedValue = true;
      }
      if (element.local === "t" && cell.type === "inlineStr") {
        capture = "inline";
        cell.hasCachedValue = true;
      }
    },
    text: (value) => {
      if (capture === "formula") {
        formula += value;
      }
      if (capture === "value" || capture === "inline") {
        cellValue += value;
      }
    },
  });
  for (const value of cells.values()) {
    if (
      value.formula &&
      (/[[\]]|\b(?:NOW|TODAY|RAND|RANDBETWEEN|WEBSERVICE|RTD|INDIRECT|OFFSET)\s*\(/iu.test(
        value.formula
      ) ||
        value.formula.includes("!"))
    ) {
      throw new Error(`Unsupported formula at ${value.address}`);
    }
  }
  return {
    archive,
    cells,
    date1904,
    merges,
    names,
    sheet: sheet.name,
    sheetPath,
  };
};

export const resolveSpreadsheetContract = (
  bindings: SpreadsheetBindings,
  workbook: SpreadsheetWorkbook
): SpreadsheetContract => {
  const locations: Record<string, SpreadsheetRange> = {};
  const anchors = [
    ...bindings.fields.map((field) => field.anchor),
    ...(bindings.table ? [bindings.table.anchor] : []),
  ];
  for (const anchor of anchors) {
    const range = workbook.names.get(anchor);
    if (!range) {
      throw new Error(`Missing field binding: ${anchor}`);
    }
    locations[anchor] = range;
  }
  for (const field of bindings.fields) {
    const range = locations[field.anchor] as SpreadsheetRange;
    const merged = workbook.merges.find(
      (merge) => JSON.stringify(merge) === JSON.stringify(range)
    );
    if (
      (range.firstRow !== range.lastRow ||
        range.firstColumn !== range.lastColumn) &&
      !merged
    ) {
      throw new Error(
        `Select one cell or one complete merged cell: ${field.label}`
      );
    }
    if (
      workbook.merges.some(
        (merge) => spreadsheetRangesOverlap(merge, range) && merge !== merged
      )
    ) {
      throw new Error(`Field overlaps a merged cell: ${field.label}`);
    }
  }
  if (bindings.table) {
    const range = locations[bindings.table.anchor] as SpreadsheetRange;
    if (
      workbook.merges.some((merge) => spreadsheetRangesOverlap(merge, range))
    ) {
      throw new Error("Merged cells cannot cross table body rows");
    }
    if (!bindings.table.columns.some((column) => !column.computed)) {
      throw new Error("A table needs at least one input column");
    }
    if (
      bindings.table.columns.some(
        (column) => column.offset > range.lastColumn - range.firstColumn
      )
    ) {
      throw new Error("A column is outside its table");
    }
  }
  const ranges = Object.values(locations);
  if (
    ranges.some((range, index) =>
      ranges
        .slice(index + 1)
        .some((other) => spreadsheetRangesOverlap(range, other))
    )
  ) {
    throw new Error("Fields and tables cannot overlap");
  }
  return { ...bindings, locations };
};

// oxlint-disable-next-line complexity -- Each declared cell type has distinct validation and empty/cache semantics.
export const spreadsheetFieldValue = (
  cell: SpreadsheetCell | undefined,
  field: SpreadsheetField | SpreadsheetColumn,
  workbook: SpreadsheetWorkbook
): unknown => {
  if (field.computed && (!cell || cell.formula === null)) {
    throw new Error(
      `Computed formula was changed: ${cell?.address ?? field.label}`
    );
  }
  if (!cell) {
    return null;
  }
  if (cell.type === "e") {
    throw new Error(`Formula error at ${cell.address}: ${cell.value}`);
  }
  if (!field.computed && cell.formula !== null) {
    throw new Error(`Input cells cannot contain formulas: ${cell.address}`);
  }
  if (field.computed && cell.formula === null) {
    throw new Error(`Computed formula was changed: ${cell.address}`);
  }
  if (field.computed && (!cell.hasCachedValue || cell.value === null)) {
    throw new Error(`Computed result is unavailable at ${cell.address}`);
  }
  if (cell.value === null || cell.value === "") {
    return null;
  }
  if (field.type === "text") {
    return String(cell.value);
  }
  if (field.type === "number") {
    if (typeof cell.value !== "number") {
      throw new TypeError(`Enter a number at ${cell.address}`);
    }
    return cell.value;
  }
  if (field.type === "boolean") {
    if (typeof cell.value === "boolean") {
      return cell.value;
    }
    if (["true", "ใช่"].includes(String(cell.value).toLowerCase())) {
      return true;
    }
    if (["false", "ไม่ใช่"].includes(String(cell.value).toLowerCase())) {
      return false;
    }
    throw new Error(`Choose yes or no at ${cell.address}`);
  }
  if (field.type === "dropdown") {
    if (!field.options.includes(String(cell.value))) {
      throw new Error(`Invalid selection at ${cell.address}`);
    }
    return String(cell.value);
  }
  if (typeof cell.value === "number") {
    if (!workbook.date1904 && cell.value >= 60 && cell.value < 61) {
      throw new Error(`Invalid Excel calendar date: ${cell.address}`);
    }
    const epoch = workbook.date1904
      ? Date.UTC(1904, 0, 1)
      : Date.UTC(1899, 11, 31);
    const days =
      Math.floor(cell.value) - (!workbook.date1904 && cell.value >= 61 ? 1 : 0);
    const date = new Date(epoch + days * 86_400_000);
    if (!Number.isFinite(date.getTime())) {
      throw new TypeError(`Invalid date at ${cell.address}`);
    }
    return date.toISOString().slice(0, 10);
  }
  const value = String(cell.value).slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Enter an ISO date at ${cell.address}`);
  }
  return value;
};

export const extractSpreadsheetData = (
  workbook: SpreadsheetWorkbook,
  contract: SpreadsheetContract,
  required: boolean
): {
  data: Record<string, unknown>;
  errors: { address: string; message: string }[];
} => {
  const data: Record<string, unknown> = {};
  const errors: { address: string; message: string }[] = [];
  const pictures = readSpreadsheetPictures(workbook, contract);
  const read = (
    address: string,
    field: SpreadsheetField | SpreadsheetColumn
  ): unknown => {
    try {
      const value = spreadsheetFieldValue(
        workbook.cells.get(address),
        field,
        workbook
      );
      if (required && field.required && value === null) {
        throw new Error(`Required field: ${field.label} (${address})`);
      }
      return value;
    } catch (error) {
      errors.push({
        address,
        message: error instanceof Error ? error.message : "Invalid cell",
      });
      return null;
    }
  };
  for (const field of contract.fields) {
    const range = contract.locations[field.anchor] as SpreadsheetRange;
    if (field.type === "picture") {
      if (required && field.required && !pictures.has(field.id)) {
        errors.push({
          address: `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}`,
          message: `Required picture: ${field.label}`,
        });
      }
      continue;
    }
    data[field.key] = read(
      `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}`,
      field
    );
  }
  if (contract.table) {
    const { table } = contract;
    const range = contract.locations[table.anchor] as SpreadsheetRange;
    const rows = new Set<number>();
    const inputColumns = new Set(
      table.columns
        .filter((column) => !column.computed)
        .map((column) => range.firstColumn + column.offset)
    );
    for (const cell of workbook.cells.values()) {
      if (
        cell.row >= range.firstRow &&
        cell.row <= range.lastRow &&
        inputColumns.has(cell.column) &&
        cell.value !== null &&
        cell.value !== ""
      ) {
        rows.add(cell.row);
      }
    }
    data[table.key] = [...rows]
      .toSorted((a, b) => a - b)
      .map((row) => {
        const values: Record<string, unknown> = {};
        for (const column of table.columns) {
          values[column.key] = read(
            `${spreadsheetColumnName(range.firstColumn + column.offset)}${row + 1}`,
            column
          );
        }
        return values;
      });
  }
  return { data, errors };
};
