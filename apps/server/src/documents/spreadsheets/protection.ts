import { strToU8, zipSync } from "fflate";

import {
  maxTemplateArchiveExpandedBytes,
  templateArchiveText,
} from "../package";
import type { SpreadsheetContract, SpreadsheetRange } from "./contract";
import { spreadsheetColumnName } from "./contract";
import { readSpreadsheetWorkbook } from "./workbook";
import type { SpreadsheetCell, SpreadsheetWorkbook } from "./workbook";
import {
  spreadsheetXmlTree,
  spreadsheetXmlChildren,
  spreadsheetXmlElement,
  serializeSpreadsheetXml,
} from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

const inputRangeContains = (
  range: SpreadsheetRange,
  row: number,
  column: number
): boolean =>
  row >= range.firstRow &&
  row <= range.lastRow &&
  column >= range.firstColumn &&
  column <= range.lastColumn;
export const spreadsheetInputRanges = (
  contract: SpreadsheetContract,
  locked: ReadonlySet<string> = new Set()
): SpreadsheetRange[] => {
  const ranges = contract.fields
    .filter(
      (field) =>
        !field.computed && field.type !== "picture" && !locked.has(field.key)
    )
    .map((field) => contract.locations[field.anchor] as SpreadsheetRange);
  if (contract.table) {
    const body = contract.locations[contract.table.anchor] as SpreadsheetRange;
    for (const column of contract.table.columns.filter(
      (field) => !field.computed
    )) {
      ranges.push({
        ...body,
        firstColumn: body.firstColumn + column.offset,
        lastColumn: body.firstColumn + column.offset,
      });
    }
  }
  return ranges;
};

const protectedCellChanged = (
  before: SpreadsheetCell | undefined,
  after: SpreadsheetCell | undefined
): boolean =>
  (before?.formula ?? null) !== (after?.formula ?? null) ||
  (before?.formula === null &&
    (before.value ?? null) !== (after?.value ?? null)) ||
  (!before && after?.value !== null && after?.value !== undefined);

export const validateSpreadsheetEdits = (
  previous: SpreadsheetWorkbook,
  current: SpreadsheetWorkbook,
  contract: SpreadsheetContract,
  locked: ReadonlySet<string> = new Set()
): void => {
  if (
    previous.sheet !== current.sheet ||
    JSON.stringify(previous.merges) !== JSON.stringify(current.merges)
  ) {
    throw new Error("The worksheet structure was changed");
  }
  for (const [name, range] of previous.names) {
    if (JSON.stringify(current.names.get(name)) !== JSON.stringify(range)) {
      throw new Error(`The field position was changed: ${name}`);
    }
  }
  const inputs = spreadsheetInputRanges(contract, locked);
  const addresses = new Set([
    ...previous.cells.keys(),
    ...current.cells.keys(),
  ]);
  for (const address of addresses) {
    const before = previous.cells.get(address);
    const after = current.cells.get(address);
    const cell = after ?? before;
    if (!cell) {
      continue;
    }
    if (
      inputs.some((range) => inputRangeContains(range, cell.row, cell.column))
    ) {
      if (after?.formula !== null && after?.formula !== undefined) {
        throw new Error(`Input cannot contain a formula: ${address}`);
      }
      continue;
    }
    if (protectedCellChanged(before, after)) {
      throw new Error(`A protected cell was changed: ${address}`);
    }
  }
};

/** Remove protection only from the server's private worker copy. */
export const unprotectSpreadsheet = (bytes: Uint8Array): Uint8Array => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  sheet.children = sheet.children.filter(
    (node) =>
      typeof node === "string" ||
      node.name.split(":").at(-1) !== "sheetProtection"
  );
  workbook.archive[workbook.sheetPath] = strToU8(
    serializeSpreadsheetXml(sheet)
  );
  const book = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, "xl/workbook.xml")
  );
  book.children = book.children.filter(
    (node) =>
      typeof node === "string" ||
      node.name.split(":").at(-1) !== "workbookProtection"
  );
  workbook.archive["xl/workbook.xml"] = strToU8(serializeSpreadsheetXml(book));
  return zipSync(workbook.archive, { level: 6 });
};

const columnOf = (address: string): number => {
  let column = 0;
  for (const character of address.replaceAll(/\d/gu, "")) {
    column = column * 26 + (character.codePointAt(0) ?? 64) - 64;
  }
  return column - 1;
};

export const protectSpreadsheet = (
  bytes: Uint8Array,
  contract: SpreadsheetContract,
  locked: ReadonlySet<string> = new Set()
): Uint8Array => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const { archive } = workbook;
  const ranges = spreadsheetInputRanges(contract, locked);
  const potentialCells = ranges.reduce(
    (sum, range) =>
      sum +
      (range.lastRow - range.firstRow + 1) *
        (range.lastColumn - range.firstColumn + 1),
    0
  );
  if (potentialCells * 80 > maxTemplateArchiveExpandedBytes) {
    throw new Error("The editable range exceeds the workbook resource budget");
  }
  const styles = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/styles.xml")
  );
  const [xfs] = spreadsheetXmlChildren(styles, "cellXfs");
  if (!xfs) {
    throw new Error("The workbook has no cell styles");
  }
  const originals = spreadsheetXmlChildren(xfs, "xf");
  for (const style of originals) {
    style.attributes.applyProtection = "1";
    style.children = style.children.filter(
      (child) =>
        typeof child === "string" ||
        child.name.split(":").at(-1) !== "protection"
    );
    style.children.push(
      spreadsheetXmlElement(style, "protection", { locked: "1" })
    );
  }
  const unlockedStyles = new Map<number, number>();
  const unlockedStyle = (original: number): number => {
    const existing = unlockedStyles.get(original);
    if (existing !== undefined) {
      return existing;
    }
    if (!originals[original]) {
      throw new Error("Invalid cell style");
    }
    const style = structuredClone(originals[original]) as SpreadsheetXmlNode;
    const [protection] = spreadsheetXmlChildren(style, "protection");
    if (!protection) {
      throw new Error("Missing cell protection");
    }
    protection.attributes.locked = "0";
    const index = spreadsheetXmlChildren(xfs, "xf").length;
    xfs.children.push(style);
    unlockedStyles.set(original, index);
    return index;
  };
  const sheet = spreadsheetXmlTree(
    templateArchiveText(archive, workbook.sheetPath)
  );
  const [sheetData] = spreadsheetXmlChildren(sheet, "sheetData");
  if (!sheetData) {
    throw new Error("The workbook has no worksheet data");
  }
  const rows = new Map(
    spreadsheetXmlChildren(sheetData, "row").map((row) => [
      Number(row.attributes.r) - 1,
      row,
    ])
  );
  for (const range of ranges) {
    for (
      let rowNumber = range.firstRow;
      rowNumber <= range.lastRow;
      rowNumber += 1
    ) {
      let row = rows.get(rowNumber);
      if (!row) {
        row = spreadsheetXmlElement(sheetData, "row", {
          r: String(rowNumber + 1),
        });
        rows.set(rowNumber, row);
      }
      const cells = new Map(
        spreadsheetXmlChildren(row, "c").map((cell) => [
          cell.attributes.r,
          cell,
        ])
      );
      for (
        let column = range.firstColumn;
        column <= range.lastColumn;
        column += 1
      ) {
        const address = `${spreadsheetColumnName(column)}${rowNumber + 1}`;
        let cell = cells.get(address);
        if (!cell) {
          cell = spreadsheetXmlElement(row, "c", { r: address });
          row.children.push(cell);
          cells.set(address, cell);
        }
        cell.attributes.s = String(
          unlockedStyle(Number(cell.attributes.s ?? "0"))
        );
      }
      row.children = [...cells.values()].toSorted(
        (a, b) =>
          (workbook.cells.get(a.attributes.r ?? "")?.column ??
            columnOf(a.attributes.r ?? "")) -
          (workbook.cells.get(b.attributes.r ?? "")?.column ??
            columnOf(b.attributes.r ?? ""))
      );
    }
  }
  sheetData.children = [...rows.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([, row]) => row);
  xfs.attributes.count = String(spreadsheetXmlChildren(xfs, "xf").length);
  sheet.children = sheet.children.filter(
    (node) =>
      typeof node === "string" ||
      node.name.split(":").at(-1) !== "sheetProtection"
  );
  sheet.children.splice(
    sheet.children.indexOf(sheetData) + 1,
    0,
    spreadsheetXmlElement(sheet, "sheetProtection", {
      deleteColumns: "1",
      deleteRows: "1",
      formatCells: "1",
      formatColumns: "1",
      formatRows: "1",
      insertColumns: "1",
      insertRows: "1",
      objects: contract.fields.some((field) => field.type === "picture")
        ? "0"
        : "1",
      password: "DAA7",
      scenarios: "1",
      selectLockedCells: "0",
      selectUnlockedCells: "0",
      sheet: "1",
    })
  );
  const book = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/workbook.xml")
  );
  book.children = book.children.filter(
    (node) =>
      typeof node === "string" ||
      node.name.split(":").at(-1) !== "workbookProtection"
  );
  const [sheets] = spreadsheetXmlChildren(book, "sheets");
  if (!sheets) {
    throw new Error("Missing workbook sheets");
  }
  book.children.splice(
    book.children.indexOf(sheets),
    0,
    spreadsheetXmlElement(book, "workbookProtection", {
      lockStructure: "1",
      workbookPassword: "DAA7",
    })
  );
  archive["xl/workbook.xml"] = strToU8(serializeSpreadsheetXml(book));
  archive["xl/styles.xml"] = strToU8(serializeSpreadsheetXml(styles));
  archive[workbook.sheetPath] = strToU8(serializeSpreadsheetXml(sheet));
  if (
    Object.values(archive).reduce((size, part) => size + part.byteLength, 0) >
    maxTemplateArchiveExpandedBytes
  ) {
    throw new Error("The workbook exceeds its resource budget");
  }
  return zipSync(archive, { level: 6 });
};
