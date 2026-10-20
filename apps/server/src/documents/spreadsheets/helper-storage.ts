import path from "node:path";

import { strToU8, zipSync } from "fflate";

import {
  readTemplateArchive,
  templateArchiveText,
  validateOfficeRelationships,
} from "../package";
import {
  parseSpreadsheetRange,
  spreadsheetCellPosition,
  spreadsheetColumnName,
} from "./contract";
import type { SpreadsheetRange } from "./contract";
import {
  serializeSpreadsheetXml,
  spreadsheetXmlChildren,
  spreadsheetXmlElement,
  spreadsheetXmlTree,
} from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

const helperName = "_folio_options";
const ownedName = /^_folio_options_draft_\d+(?:_\d+)?$/iu;
const nameTokens = /_folio_options_draft_\d+(?:_\d+)?/giu;
const helperReference = /_folio_options(?:['"])?!/iu;
const dynamicReference = /\b(?:INDIRECT|EVALUATE)\s*\(/iu;
const uncertainReference = (fragment: string): boolean =>
  helperReference.test(fragment) ||
  dynamicReference.test(fragment) ||
  (fragment.toLowerCase().includes(helperName) &&
    fragment.trim().toLowerCase() !== helperName &&
    !fragment.match(nameTokens)?.length);
const local = (node: SpreadsheetXmlNode): string =>
  node.name.split(":").at(-1) ?? node.name;
const nodes = (node: SpreadsheetXmlNode, tag: string): SpreadsheetXmlNode[] => [
  ...(local(node) === tag ? [node] : []),
  ...node.children.flatMap((child) =>
    typeof child === "string" ? [] : nodes(child, tag)
  ),
];
const text = (node: SpreadsheetXmlNode): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");
const contains = (range: SpreadsheetRange, address: string): boolean => {
  const cell = spreadsheetCellPosition(address);
  return (
    cell.row >= range.firstRow &&
    cell.row <= range.lastRow &&
    cell.column === range.firstColumn
  );
};

interface OwnedList {
  node: SpreadsheetXmlNode;
  name: string;
  range: SpreadsheetRange;
  cells: SpreadsheetXmlNode[];
}

/**
 * Sweep only proven orphan draft-option storage in the saved copy. No live
 * editor objects, active ranges or formulas are moved. A successful save then
 * remounts that copy; a failed or uncertain save retains the editor's Undo and
 * rollback data. Dynamic/direct helper references conservatively pin storage.
 */
// oxlint-disable-next-line complexity -- Every ownership/reference check keeps uncertain author data intact.
export const compactSpreadsheetDraftOptions = (
  bytes: Uint8Array
): Uint8Array => {
  const archive = readTemplateArchive(bytes, () => true);
  validateOfficeRelationships(archive);
  const book = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/workbook.xml")
  );
  const helperSheet = nodes(book, "sheet").find(
    (node) => node.attributes.name === helperName
  );
  if (!helperSheet) {
    return bytes;
  }
  const relationships = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/_rels/workbook.xml.rels")
  );
  const relationId = Object.entries(helperSheet.attributes).find(([name]) =>
    name.endsWith(":id")
  )?.[1];
  const relation = nodes(relationships, "Relationship").find(
    (node) => node.attributes.Id === relationId
  );
  const target = relation?.attributes.Target;
  if (!target) {
    return bytes;
  }
  const helperPath = target.startsWith("/")
    ? target.slice(1)
    : path.posix.normalize(path.posix.join("xl", target));
  const helper = spreadsheetXmlTree(templateArchiveText(archive, helperPath));
  // A helper-local formula may reference A2 without spelling its sheet name.
  // Preserve every helper value rather than guessing its local dependencies.
  const plainHelperChildren = new Set([
    "sheetPr",
    "dimension",
    "sheetViews",
    "sheetFormatPr",
    "cols",
    "sheetData",
    "sheetProtection",
    "pageMargins",
    "pageSetup",
    "printOptions",
    "headerFooter",
  ]);
  if (
    nodes(helper, "f").length ||
    helper.children.some(
      (child) =>
        typeof child !== "string" && !plainHelperChildren.has(local(child))
    )
  ) {
    return bytes;
  }
  const [data] = spreadsheetXmlChildren(helper, "sheetData");
  const [definedNames] = spreadsheetXmlChildren(book, "definedNames");
  if (!data || !definedNames) {
    return bytes;
  }
  const shared = archive["xl/sharedStrings.xml"]
    ? spreadsheetXmlTree(templateArchiveText(archive, "xl/sharedStrings.xml"))
    : null;
  const strings = shared ? spreadsheetXmlChildren(shared, "si") : [];
  const cells = nodes(data, "c");
  const byAddress = new Map(cells.map((cell) => [cell.attributes.r, cell]));
  const value = (cell: SpreadsheetXmlNode | undefined): string | null => {
    if (!cell || nodes(cell, "f").length) {
      return null;
    }
    if (cell.attributes.t === "inlineStr") {
      return nodes(cell, "t").map(text).join("");
    }
    if (cell.attributes.t === "s") {
      const index = Number(
        spreadsheetXmlChildren(cell, "v")[0] &&
          text(spreadsheetXmlChildren(cell, "v")[0] as SpreadsheetXmlNode)
      );
      const item = strings[index];
      return item ? nodes(item, "t").map(text).join("") : null;
    }
    return null;
  };
  const candidates: OwnedList[] = [];
  for (const node of spreadsheetXmlChildren(definedNames, "definedName")) {
    const name = node.attributes.name ?? "";
    if (!ownedName.test(name) || node.attributes.hidden !== "1") {
      continue;
    }
    let range;
    try {
      range = parseSpreadsheetRange(text(node).replace(/^=/u, ""));
    } catch {
      continue;
    }
    if (
      range.sheet !== helperName ||
      range.firstRow !== 1 ||
      range.firstColumn !== range.lastColumn ||
      value(byAddress.get(`${spreadsheetColumnName(range.firstColumn)}1`)) !==
        "folio draft options"
    ) {
      continue;
    }
    const ownedCells = cells.filter(
      (cell) => cell.attributes.r && contains(range, cell.attributes.r)
    );
    if (
      ownedCells.length !== range.lastRow - range.firstRow + 1 ||
      ownedCells.some((cell) => value(cell) === null)
    ) {
      continue;
    }
    candidates.push({
      cells: ownedCells,
      name: name.toLowerCase(),
      node,
      range,
    });
  }
  if (!candidates.length) {
    return bytes;
  }
  const candidateNodes = new Set(candidates.map((candidate) => candidate.node));
  const referenced = new Set<string>();
  let pinned = false;
  const scan = (node: SpreadsheetXmlNode): void => {
    if (candidateNodes.has(node)) {
      return;
    }
    const formula = [
      "f",
      "formula",
      "formula1",
      "formula2",
      "definedName",
    ].includes(local(node));
    const content = formula ? text(node) : "";
    if (formula && dynamicReference.test(content)) {
      pinned = true;
    }
    const fragments = [
      ...(formula ? [content] : []),
      ...Object.values(node.attributes),
      ...node.children.filter(
        (child): child is string => typeof child === "string"
      ),
    ];
    for (const fragment of fragments) {
      if (uncertainReference(fragment)) {
        pinned = true;
      }
      for (const match of fragment.matchAll(nameTokens)) {
        const start = match.index ?? 0;
        const before = fragment[start - 1] ?? "";
        const after = fragment[start + match[0].length] ?? "";
        if (!/[A-Za-z0-9_.]/u.test(before) && !/[A-Za-z0-9_.]/u.test(after)) {
          referenced.add(match[0].toLowerCase());
        }
      }
    }
    for (const child of node.children) {
      if (typeof child !== "string") {
        scan(child);
      }
    }
  };
  const trees = new Map<string, SpreadsheetXmlNode>([
    ["xl/workbook.xml", book],
    [helperPath, helper],
  ]);
  for (const name of Object.keys(archive)) {
    if (!name.toLowerCase().endsWith(".xml")) {
      continue;
    }
    const tree =
      trees.get(name) ?? spreadsheetXmlTree(templateArchiveText(archive, name));
    trees.set(name, tree);
    scan(tree);
  }
  if (pinned) {
    return bytes;
  }
  const orphaned = candidates.filter(
    (candidate) => !referenced.has(candidate.name)
  );
  if (!orphaned.length) {
    return bytes;
  }
  const retainedCells = new Set(
    candidates
      .filter((candidate) => referenced.has(candidate.name))
      .flatMap((candidate) => candidate.cells)
  );
  const removedCells = new Set(
    orphaned
      .flatMap((candidate) => candidate.cells)
      .filter((cell) => !retainedCells.has(cell))
  );
  const removedNames = new Set(orphaned.map((candidate) => candidate.node));
  definedNames.children = definedNames.children.filter(
    (child) => typeof child === "string" || !removedNames.has(child)
  );
  for (const row of spreadsheetXmlChildren(data, "row")) {
    row.children = row.children.filter(
      (child) => typeof child === "string" || !removedCells.has(child)
    );
  }
  for (const column of new Set(
    orphaned.map((candidate) => candidate.range.firstColumn)
  )) {
    if (
      candidates.some(
        (candidate) =>
          referenced.has(candidate.name) &&
          candidate.range.firstColumn === column
      )
    ) {
      continue;
    }
    const address = `${spreadsheetColumnName(column)}1`;
    // Reuse only explicit server-reclaimed slots, never arbitrary blank cells.
    // Unknown extra cells in this column keep it reserved.
    if (
      cells.some(
        (cell) =>
          cell.attributes.r !== address &&
          !removedCells.has(cell) &&
          cell.attributes.r &&
          spreadsheetCellPosition(cell.attributes.r).column === column
      )
    ) {
      continue;
    }
    const marker = byAddress.get(address);
    if (marker) {
      marker.attributes.t = "inlineStr";
      const inline = spreadsheetXmlElement(marker, "is");
      const token = spreadsheetXmlElement(inline, "t");
      token.children = ["folio draft options free"];
      inline.children = [token];
      marker.children = [inline];
    }
  }
  data.children = data.children.filter(
    (child) =>
      typeof child === "string" ||
      local(child) !== "row" ||
      spreadsheetXmlChildren(child, "c").length > 0
  );
  const changed = new Set(["xl/workbook.xml", helperPath]);
  // Remove the actual orphan text too. Native XLSX snapshots normally store
  // these values in the shared-string table, not directly in helper cells.
  if (shared) {
    const usages: {
      cell: SpreadsheetXmlNode;
      value: SpreadsheetXmlNode;
      path: string;
      old: number;
    }[] = [];
    for (const [name, tree] of trees) {
      if (local(tree) !== "worksheet") {
        continue;
      }
      const worksheetCells = spreadsheetXmlChildren(tree, "sheetData").flatMap(
        (sheetData) =>
          spreadsheetXmlChildren(sheetData, "row").flatMap((row) =>
            spreadsheetXmlChildren(row, "c")
          )
      );
      for (const cell of worksheetCells) {
        if (cell.attributes.t !== "s") {
          continue;
        }
        const [item] = spreadsheetXmlChildren(cell, "v");
        const old = item ? Number(text(item)) : Number.NaN;
        if (!Number.isSafeInteger(old) || !strings[old] || !item) {
          return bytes;
        }
        usages.push({ cell, old, path: name, value: item });
      }
    }
    const used = [...new Set(usages.map((usage) => usage.old))].toSorted(
      (a, b) => a - b
    );
    const indexes = new Map(used.map((old, index) => [old, index]));
    shared.children = [
      ...used.map((old) => strings[old] as SpreadsheetXmlNode),
      ...shared.children.filter(
        (child) => typeof child === "string" || local(child) !== "si"
      ),
    ];
    shared.attributes.count = String(usages.length);
    shared.attributes.uniqueCount = String(used.length);
    for (const usage of usages) {
      const index = indexes.get(usage.old) as number;
      if (index !== usage.old) {
        usage.value.children = [String(index)];
        changed.add(usage.path);
      }
    }
    trees.set("xl/sharedStrings.xml", shared);
    changed.add("xl/sharedStrings.xml");
  }
  for (const name of changed) {
    archive[name] = strToU8(
      serializeSpreadsheetXml(trees.get(name) as SpreadsheetXmlNode)
    );
  }
  return zipSync(archive, { level: 6 });
};
