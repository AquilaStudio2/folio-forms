// oxlint-disable complexity -- Token and OOXML reference guards explicitly distinguish every supported grammar branch.
import { createHash } from "node:crypto";

import { strToU8, zipSync } from "fflate";

import { readTemplateArchive, templateArchiveText } from "../package";
import type { SpreadsheetRowChange } from "./builder-script";
import {
  parseSpreadsheetRange,
  spreadsheetCellPosition,
  spreadsheetColumnName,
} from "./contract";
import type { SpreadsheetRange } from "./contract";
import { readSpreadsheetWorkbook } from "./workbook";
import {
  serializeSpreadsheetXml,
  spreadsheetXmlChildren,
  spreadsheetXmlElement,
  spreadsheetXmlTree,
} from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

export interface SpreadsheetFormulaBinding {
  name: string;
  firstColumnOffset: number;
  lastColumnOffset: number;
}
export interface SpreadsheetPrintArea {
  reference: string;
  localSheetId?: string;
}

interface FormulaToken {
  text: string;
  kind: "word" | "quoted" | "space" | "symbol";
}

// Complete body references retain table semantics throughout aggregate expressions,
// including nested grouping and arithmetic. Singleton bodies grow the same way.
const aggregates = new Set([
  "SUM",
  "AVERAGE",
  "MIN",
  "MAX",
  "COUNT",
  "COUNTA",
  "COUNTBLANK",
  "SUMIF",
  "SUMIFS",
  "COUNTIF",
  "COUNTIFS",
  "AVERAGEIF",
  "AVERAGEIFS",
  "SUMPRODUCT",
  "SUBTOTAL",
  "AGGREGATE",
  "MEDIAN",
  "STDEV",
  "STDEV.S",
  "STDEV.P",
  "VAR",
  "VAR.S",
  "VAR.P",
]);

const formulaTokens = (formula: string): FormulaToken[] => {
  const tokens: FormulaToken[] = [];
  let index = 0;
  while (index < formula.length) {
    const start = index;
    const character = formula[index];
    if (character === '"' || character === "'") {
      index += 1;
      while (index < formula.length) {
        const quotedCharacter = formula[index];
        index += 1;
        if (quotedCharacter === character) {
          if (formula[index] !== character) {
            break;
          }
          index += 1;
        }
      }
      tokens.push({ kind: "quoted", text: formula.slice(start, index) });
      continue;
    }
    const word = /^[A-Za-z_$\\][A-Za-z0-9_.$\\]*/u.exec(formula.slice(index));
    const whitespace = /^\s+/u.exec(formula.slice(index));
    if (word || whitespace) {
      const text = (word ?? whitespace)?.[0] ?? "";
      tokens.push({ kind: word ? "word" : "space", text });
      index += text.length;
    } else {
      tokens.push({ kind: "symbol", text: character ?? "" });
      index += 1;
    }
  }
  return tokens;
};

/** Rewrite complete body references only; quoted text and partial ranges remain literal. */
export const rewriteSpreadsheetAggregates = (
  formula: string,
  body: SpreadsheetRange,
  bindingName: (firstColumn: number, lastColumn: number) => string
): string => {
  const tokens = formulaTokens(formula);
  const significant = tokens
    .map((token, index) => (token.kind === "space" ? -1 : index))
    .filter((index) => index >= 0);
  const stack: string[] = [];
  let bracketDepth = 0;
  for (let cursor = 0; cursor < significant.length; cursor += 1) {
    const index = significant[cursor] as number;
    const token = tokens[index] as FormulaToken;
    const previous = tokens[significant[cursor - 1] ?? -1];
    if (token.text === "[") {
      bracketDepth += 1;
      continue;
    }
    if (token.text === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (token.text === "(") {
      stack.push(
        previous?.kind === "word"
          ? previous.text.toUpperCase().replace(/^_XLFN\./u, "")
          : ""
      );
      continue;
    }
    if (token.text === ")") {
      stack.pop();
      continue;
    }
    if (
      bracketDepth > 0 ||
      !stack.some((name) => aggregates.has(name)) ||
      [":", "!"].includes(previous?.text ?? "") ||
      token.kind !== "word" ||
      !/^\$?[A-Za-z]+\$?[1-9]\d*$/u.test(token.text)
    ) {
      continue;
    }
    const colon = tokens[significant[cursor + 1] ?? -1];
    const last =
      colon?.text === ":" ? tokens[significant[cursor + 2] ?? -1] : token;
    const endCursor = colon?.text === ":" ? cursor + 2 : cursor;
    if (
      !last ||
      !/^\$?[A-Za-z]+\$?[1-9]\d*$/u.test(last.text) ||
      [":", "!", "("].includes(
        tokens[significant[endCursor + 1] ?? -1]?.text ?? ""
      )
    ) {
      continue;
    }
    let firstPosition;
    let lastPosition;
    try {
      firstPosition = spreadsheetCellPosition(token.text);
      lastPosition = spreadsheetCellPosition(last.text);
    } catch {
      continue;
    }
    if (
      firstPosition.row !== body.firstRow ||
      lastPosition.row !== body.lastRow ||
      firstPosition.column < body.firstColumn ||
      lastPosition.column > body.lastColumn ||
      firstPosition.column > lastPosition.column
    ) {
      continue;
    }
    token.text = bindingName(
      firstPosition.column - body.firstColumn,
      lastPosition.column - body.firstColumn
    );
    for (
      let blank = index + 1;
      blank <= (significant[endCursor] as number);
      blank += 1
    ) {
      (tokens[blank] as FormulaToken).text = "";
    }
    cursor = endCursor;
  }
  return tokens.map((token) => token.text).join("");
};

export const prepareSpreadsheetRowFormulas = (
  bytes: Uint8Array,
  change: SpreadsheetRowChange
): {
  workbook: Uint8Array;
  formulaBindings: SpreadsheetFormulaBinding[];
  printAreas: SpreadsheetPrintArea[];
} => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const body = workbook.names.get(change.bodyName);
  if (!body) {
    throw new Error("Missing table body binding");
  }
  const prefix = `_folio_dyn_${createHash("sha256").update(change.bodyName).digest("hex").slice(0, 16)}_`;
  const bindings = new Map<string, SpreadsheetFormulaBinding>();
  const book = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, "xl/workbook.xml")
  );
  let [definedNames] = spreadsheetXmlChildren(book, "definedNames");
  if (!definedNames) {
    definedNames = spreadsheetXmlElement(book, "definedNames", {});
    book.children.push(definedNames);
  }
  const names = new Map<string, SpreadsheetXmlNode>();
  for (const node of spreadsheetXmlChildren(definedNames, "definedName")) {
    const name = node.attributes.name ?? "";
    if (
      name.toLowerCase().startsWith(prefix) &&
      (name !== name.toLowerCase() || names.has(name))
    ) {
      throw new Error("An internal formula binding name collides");
    }
    names.set(name, node);
  }
  const printAreas: SpreadsheetPrintArea[] = [];
  const printArea = names.get("_xlnm.Print_Area");
  if (printArea) {
    const text = printArea.children
      .filter((node) => typeof node === "string")
      .join("");
    // Multi-area print layouts are left to the spreadsheet engine; a single
    // rectangle ending exactly at the body must include boundary insertions.
    try {
      const area = parseSpreadsheetRange(text);
      if (
        area.sheet === body.sheet &&
        area.firstRow <= body.firstRow &&
        area.lastRow === body.lastRow
      ) {
        let delta = 0;
        if (change.action === "insert") {
          delta = 1;
        } else if (body.lastRow > body.firstRow) {
          delta = -1;
        }
        printAreas.push({
          localSheetId: printArea.attributes.localSheetId,
          reference: `'${area.sheet.replaceAll("'", "''")}'!$${spreadsheetColumnName(area.firstColumn)}$${area.firstRow + 1}:$${spreadsheetColumnName(area.lastColumn)}$${area.lastRow + delta + 1}`,
        });
      }
    } catch {
      // The engine preserves print layouts that are not one rectangular area.
    }
  }
  const reference = (first: number, last: number) =>
    `'${body.sheet.replaceAll("'", "''")}'!$${spreadsheetColumnName(body.firstColumn + first)}$${body.firstRow + 1}:$${spreadsheetColumnName(body.firstColumn + last)}$${body.lastRow + 1}`;
  const register = (first: number, last: number): string => {
    const name = `${prefix}${first}_${last}`;
    if (
      first < 0 ||
      first > last ||
      last > body.lastColumn - body.firstColumn
    ) {
      throw new Error("Invalid internal formula binding");
    }
    const existing = names.get(name);
    if (existing) {
      const actual = parseSpreadsheetRange(
        existing.children.filter((node) => typeof node === "string").join("")
      );
      if (
        existing.attributes.localSheetId !== undefined ||
        JSON.stringify(actual) !==
          JSON.stringify(parseSpreadsheetRange(reference(first, last)))
      ) {
        throw new Error("An internal formula binding was changed");
      }
    } else {
      const created = spreadsheetXmlElement(definedNames, "definedName", {
        hidden: "1",
        name,
      });
      created.children = [reference(first, last)];
      definedNames.children.push(created);
      names.set(name, created);
    }
    bindings.set(name, {
      firstColumnOffset: first,
      lastColumnOffset: last,
      name,
    });
    return name;
  };
  for (const name of names.keys()) {
    if (!name.startsWith(prefix)) {
      continue;
    }
    const offsets = /^(?<first>\d+)_(?<last>\d+)$/u.exec(
      name.slice(prefix.length)
    );
    if (!offsets) {
      throw new Error("Invalid internal formula binding name");
    }
    register(Number(offsets.groups?.first), Number(offsets.groups?.last));
  }
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  const [data] = spreadsheetXmlChildren(sheet, "sheetData");
  if (!data) {
    throw new Error("Missing worksheet data");
  }
  for (const row of spreadsheetXmlChildren(data, "row")) {
    for (const cell of spreadsheetXmlChildren(row, "c")) {
      const parsed = workbook.cells.get(cell.attributes.r ?? "");
      if (
        !parsed?.formula ||
        (parsed.row >= body.firstRow &&
          parsed.row <= body.lastRow &&
          parsed.column >= body.firstColumn &&
          parsed.column <= body.lastColumn)
      ) {
        continue;
      }
      const [formula] = spreadsheetXmlChildren(cell, "f");
      if (!formula) {
        continue;
      }
      formula.children = [
        rewriteSpreadsheetAggregates(parsed.formula, body, register),
      ];
    }
  }
  workbook.archive["xl/workbook.xml"] = strToU8(serializeSpreadsheetXml(book));
  workbook.archive[workbook.sheetPath] = strToU8(
    serializeSpreadsheetXml(sheet)
  );
  return {
    formulaBindings: [...bindings.values()],
    printAreas,
    workbook: zipSync(workbook.archive, { level: 6 }),
  };
};

export const applySpreadsheetPrintAreas = (
  bytes: Uint8Array,
  areas: SpreadsheetPrintArea[]
): Uint8Array => {
  if (!areas.length) {
    return bytes;
  }
  const archive = readTemplateArchive(bytes, () => true);
  const book = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/workbook.xml")
  );
  const [names] = spreadsheetXmlChildren(book, "definedNames");
  if (!names) {
    throw new Error("The spreadsheet engine removed the print layout");
  }
  for (const area of areas) {
    const node = spreadsheetXmlChildren(names, "definedName").find(
      (name) =>
        name.attributes.name === "_xlnm.Print_Area" &&
        name.attributes.localSheetId === area.localSheetId
    );
    if (!node) {
      throw new Error("The spreadsheet engine removed the print layout");
    }
    node.children = [area.reference];
  }
  archive["xl/workbook.xml"] = strToU8(serializeSpreadsheetXml(book));
  return zipSync(archive, { level: 6 });
};
