// oxlint-disable complexity -- Rebuild each schema type and its OOXML relationships as one atomic archive update.
import { createHash } from "node:crypto";

import { strToU8, zipSync } from "fflate";

import {
  maxTemplateArchiveExpandedBytes,
  templateArchiveText,
} from "../package";
import {
  parseSpreadsheetRange,
  spreadsheetCellPosition,
  spreadsheetColumnName,
  spreadsheetRangesOverlap,
} from "./contract";
import type { SpreadsheetBindings, SpreadsheetRange } from "./contract";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "./workbook";
import {
  serializeSpreadsheetXml,
  spreadsheetXmlChildren,
  spreadsheetXmlElement,
  spreadsheetXmlTree,
} from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

const helperName = "_folio_options";
const helperPath = "xl/worksheets/folio-options.xml";
const mainNamespace =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipNamespace =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const local = (node: SpreadsheetXmlNode): string =>
  node.name.split(":").at(-1) ?? "";
const rangeAddress = (range: SpreadsheetRange): string =>
  `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}:${spreadsheetColumnName(range.lastColumn)}${range.lastRow + 1}`;
const nodeText = (node: SpreadsheetXmlNode): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : nodeText(child)))
    .join("");
const validationOrigin = (ranges: SpreadsheetRange[]): string =>
  `${Math.min(...ranges.map((range) => range.firstRow))}:${Math.min(...ranges.map((range) => range.firstColumn))}`;

const subtractRange = (
  range: SpreadsheetRange,
  input: SpreadsheetRange
): SpreadsheetRange[] => {
  if (!spreadsheetRangesOverlap(range, input)) {
    return [range];
  }
  const firstRow = Math.max(range.firstRow, input.firstRow);
  const lastRow = Math.min(range.lastRow, input.lastRow);
  const firstColumn = Math.max(range.firstColumn, input.firstColumn);
  const lastColumn = Math.min(range.lastColumn, input.lastColumn);
  return [
    { ...range, lastRow: firstRow - 1 },
    { ...range, firstRow: lastRow + 1 },
    { ...range, firstRow, lastColumn: firstColumn - 1, lastRow },
    { ...range, firstColumn: lastColumn + 1, firstRow, lastRow },
  ].filter(
    (item) =>
      item.firstRow <= item.lastRow && item.firstColumn <= item.lastColumn
  );
};

const removeValidationNodes = (
  node: SpreadsheetXmlNode,
  managed: SpreadsheetRange[]
): void => {
  const [firstManaged] = managed;
  if (!firstManaged) {
    return;
  }
  node.children = node.children.filter((child) => {
    if (typeof child === "string" || local(child) !== "dataValidation") {
      return true;
    }
    const [referenceNode] = spreadsheetXmlChildren(child, "sqref");
    const reference =
      child.attributes.sqref ?? (referenceNode && nodeText(referenceNode));
    if (!reference) {
      return true;
    }
    const original = reference
      .trim()
      .split(/\s+/u)
      .map((address) =>
        parseSpreadsheetRange(
          `'${firstManaged.sheet.replaceAll("'", "''")}'!${address}`
        )
      );
    let remaining = original;
    for (const input of managed) {
      remaining = remaining.flatMap((range) => subtractRange(range, input));
    }
    if (!remaining.length) {
      return false;
    }
    if (
      !original.some((range) =>
        managed.some((input) => spreadsheetRangesOverlap(range, input))
      )
    ) {
      return true;
    }
    // Native authoring already splits intersecting rules. If an old custom
    // relative formula still crosses a mapped cell, retain the saved artifact
    // rather than silently shifting the formula's origin in XML.
    if (
      validationOrigin(original) !== validationOrigin(remaining) &&
      child.children.some(
        (item) =>
          typeof item !== "string" &&
          ["formula1", "formula2"].includes(local(item)) &&
          /(?<![A-Za-z0-9_.$])(?:[A-Z]{1,3}\$?[1-9]\d*|\$[A-Z]{1,3}[1-9]\d*)(?![A-Za-z0-9_.])/iu.test(
            nodeText(item)
          )
      )
    ) {
      throw new Error(
        "Reapply the mapped field validation before publishing overlapping custom formulas"
      );
    }
    const nextReference = remaining.map(rangeAddress).join(" ");
    if (referenceNode) {
      referenceNode.children = [nextReference];
    } else {
      child.attributes.sqref = nextReference;
    }
    return true;
  });
  for (const child of node.children) {
    if (typeof child !== "string") {
      removeValidationNodes(child, managed);
      if (local(child) === "dataValidations") {
        child.attributes.count = String(
          spreadsheetXmlChildren(child, "dataValidation").length
        );
      }
    }
  }
  node.children = node.children.filter(
    (child) =>
      typeof child === "string" ||
      local(child) !== "dataValidations" ||
      spreadsheetXmlChildren(child, "dataValidation").length > 0
  );
};

/** Rebuild every editable field's validation from the versioned server contract. */
export const applySpreadsheetValidation = (
  bytes: Uint8Array,
  bindings: SpreadsheetBindings
): Uint8Array => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const contract = resolveSpreadsheetContract(bindings, workbook);
  const { archive } = workbook;
  const book = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/workbook.xml")
  );
  const [sheets] = spreadsheetXmlChildren(book, "sheets");
  if (!sheets) {
    throw new Error("Missing workbook sheets");
  }
  const relationships = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/_rels/workbook.xml.rels")
  );
  const types = spreadsheetXmlTree(
    templateArchiveText(archive, "[Content_Types].xml")
  );
  let [names] = spreadsheetXmlChildren(book, "definedNames");
  if (!names) {
    names = spreadsheetXmlElement(book, "definedNames", {});
    book.children.push(names);
  }
  const previousHelper = spreadsheetXmlChildren(sheets, "sheet").find(
    (node) => node.attributes.name === helperName
  );
  const oldRelationshipId = previousHelper?.attributes["r:id"];
  const oldRelationship = spreadsheetXmlChildren(
    relationships,
    "Relationship"
  ).find((node) => node.attributes.Id === oldRelationshipId);
  const oldPart = oldRelationship?.attributes.Target;
  let currentHelperPath = helperPath;
  if (oldPart) {
    currentHelperPath = oldPart.startsWith("/")
      ? oldPart.slice(1)
      : `xl/${oldPart}`;
  }
  const helper = spreadsheetXmlTree(
    oldPart
      ? templateArchiveText(archive, currentHelperPath)
      : `<worksheet xmlns="${mainNamespace}"><sheetData/></worksheet>`
  );
  const helperData = spreadsheetXmlChildren(
    helper,
    "sheetData"
  )[0] as SpreadsheetXmlNode;
  const rules = spreadsheetXmlElement(helper, "dataValidations", {});
  const helperRows = new Map(
    spreadsheetXmlChildren(helperData, "row").map((row) => [
      Number(row.attributes.r) - 1,
      row,
    ])
  );
  const helperCells = new Map(
    [...helperRows.values()]
      .flatMap((row) => spreadsheetXmlChildren(row, "c"))
      .map((cell) => [cell.attributes.r, cell])
  );
  const shared = archive["xl/sharedStrings.xml"]
    ? spreadsheetXmlChildren(
        spreadsheetXmlTree(
          templateArchiveText(archive, "xl/sharedStrings.xml")
        ),
        "si"
      )
    : [];
  const listValue = (cell: SpreadsheetXmlNode | undefined): string | null => {
    if (!cell || spreadsheetXmlChildren(cell, "f").length) {
      return null;
    }
    if (cell.attributes.t === "inlineStr") {
      return spreadsheetXmlChildren(cell, "is").map(nodeText).join("");
    }
    if (cell.attributes.t === "s") {
      const item =
        shared[
          Number(spreadsheetXmlChildren(cell, "v").map(nodeText).join(""))
        ];
      return item ? nodeText(item) : null;
    }
    return null;
  };
  const existingLists = new Map<string, string>();
  const existingNames = new Set<string>();
  for (const defined of spreadsheetXmlChildren(names, "definedName")) {
    const name = defined.attributes.name ?? "";
    existingNames.add(name.toLowerCase());
    let range;
    try {
      range = parseSpreadsheetRange(nodeText(defined).replace(/^=/u, ""));
    } catch {
      continue;
    }
    if (
      range.sheet !== helperName ||
      range.firstColumn !== range.lastColumn ||
      range.lastRow - range.firstRow + 1 > helperCells.size
    ) {
      continue;
    }
    const values = [];
    for (let row = range.firstRow; row <= range.lastRow; row += 1) {
      values.push(
        listValue(
          helperCells.get(
            `${spreadsheetColumnName(range.firstColumn)}${row + 1}`
          )
        )
      );
    }
    if (values.every((value) => value !== null)) {
      existingLists.set(JSON.stringify(values), name);
    }
  }
  const styles = spreadsheetXmlTree(
    templateArchiveText(archive, "xl/styles.xml")
  );
  const [cellStyles] = spreadsheetXmlChildren(styles, "cellXfs");
  if (!cellStyles) {
    throw new Error("Missing workbook cell styles");
  }
  const formats = spreadsheetXmlChildren(cellStyles, "xf");
  let helperStyle = formats.findIndex(
    (format) =>
      spreadsheetXmlChildren(format, "protection")[0]?.attributes.locked === "1"
  );
  if (helperStyle === -1) {
    const [defaultStyle] = formats;
    if (!defaultStyle) {
      throw new Error("Missing default workbook style");
    }
    const lockedStyle = structuredClone(defaultStyle);
    lockedStyle.attributes.applyProtection = "1";
    lockedStyle.children = lockedStyle.children.filter(
      (node) => typeof node === "string" || local(node) !== "protection"
    );
    lockedStyle.children.push(
      spreadsheetXmlElement(lockedStyle, "protection", { locked: "1" })
    );
    helperStyle = formats.length;
    cellStyles.children.push(lockedStyle);
    cellStyles.attributes.count = String(formats.length + 1);
  }
  let optionColumn = 0;
  for (const address of helperCells.keys()) {
    optionColumn = Math.max(
      optionColumn,
      spreadsheetCellPosition(address ?? "").column + 1
    );
  }
  let optionRow = 0;
  const listReference = (id: string, options: string[]): string => {
    const existing = existingLists.get(JSON.stringify(options));
    if (existing) {
      return existing;
    }
    if (options.length > 1_048_576) {
      throw new Error("Dropdown options exceed the XLSX worksheet row limit");
    }
    if (optionRow + options.length > 1_048_576) {
      optionColumn += 1;
      optionRow = 0;
    }
    if (optionColumn > 16_383) {
      throw new Error(
        "Dropdown options exceed the XLSX worksheet column limit"
      );
    }
    const column = spreadsheetColumnName(optionColumn);
    const firstRow = optionRow + 1;
    for (const option of options) {
      if (option.length > 32_767) {
        throw new Error("A dropdown option exceeds the XLSX cell text limit");
      }
      let row = helperRows.get(optionRow);
      if (!row) {
        row = spreadsheetXmlElement(helperData, "row", {
          r: String(optionRow + 1),
        });
        helperRows.set(optionRow, row);
      }
      const cell = spreadsheetXmlElement(row, "c", {
        r: `${column}${optionRow + 1}`,
        s: String(helperStyle),
        t: "inlineStr",
      });
      const inline = spreadsheetXmlElement(cell, "is");
      const text = spreadsheetXmlElement(inline, "t", {
        "xml:space": "preserve",
      });
      text.children = [option];
      inline.children = [text];
      cell.children = [inline];
      row.children.push(cell);
      optionRow += 1;
    }
    const prefix = `_folio_options_${createHash("sha256").update(id).digest("hex").slice(0, 20)}`;
    let name = prefix;
    for (let suffix = 1; existingNames.has(name.toLowerCase()); suffix += 1) {
      name = `${prefix}_${suffix}`;
    }
    const defined = spreadsheetXmlElement(names, "definedName", {
      hidden: "1",
      name,
    });
    defined.children = [
      `'${helperName}'!$${column}$${firstRow}:$${column}$${optionRow}`,
    ];
    names.children.push(defined);
    existingNames.add(name.toLowerCase());
    existingLists.set(JSON.stringify(options), name);
    return name;
  };
  const fields = contract.fields.map((field) => ({
    field,
    range: contract.locations[field.anchor] as SpreadsheetRange,
  }));
  if (contract.table) {
    const body = contract.locations[contract.table.anchor] as SpreadsheetRange;
    for (const field of contract.table.columns) {
      fields.push({
        field: {
          ...field,
          anchor: contract.table.anchor,
          prefillPointer: null,
          prefillPolicy: "editable",
        },
        range: {
          ...body,
          firstColumn: body.firstColumn + field.offset,
          lastColumn: body.firstColumn + field.offset,
        },
      });
    }
  }
  for (const { field, range } of fields) {
    if (field.computed || field.source) {
      continue;
    }
    if (field.type === "text" && !field.placeholder) {
      continue;
    }
    const rule = spreadsheetXmlElement(rules, "dataValidation", {
      allowBlank: "1",
      error: `Enter a valid value for ${field.label}`,
      errorStyle: "stop",
      errorTitle: "Invalid value",
      showErrorMessage: "1",
      sqref: rangeAddress(range),
    });
    if (field.placeholder) {
      rule.attributes.prompt = field.placeholder.slice(0, 255);
      rule.attributes.promptTitle = field.label.slice(0, 32);
      rule.attributes.showInputMessage = "1";
    }
    let formula: string | undefined;
    if (field.type === "dropdown" || field.type === "boolean") {
      rule.attributes.type = "list";
      rule.attributes.showDropDown = "0";
      formula = listReference(
        field.id,
        field.type === "boolean" ? ["TRUE", "FALSE"] : field.options
      );
    } else if (field.type === "number") {
      rule.attributes.type = "custom";
      formula = `ISNUMBER(${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1})`;
    } else if (field.type === "date") {
      rule.attributes.type = "date";
      rule.attributes.operator = "between";
      formula = "0";
      const maximum = spreadsheetXmlElement(rule, "formula2");
      maximum.children = [workbook.date1904 ? "2957003" : "2958465"];
      rule.children.push(maximum);
    }
    if (formula !== undefined) {
      const first = spreadsheetXmlElement(rule, "formula1");
      first.children = [formula];
      rule.children.unshift(first);
    }
    rules.children.push(rule);
  }
  const sheet = spreadsheetXmlTree(
    templateArchiveText(archive, workbook.sheetPath)
  );
  removeValidationNodes(
    sheet,
    fields.map(({ range }) => range)
  );
  for (const previous of spreadsheetXmlChildren(sheet, "dataValidations")) {
    rules.children.unshift(
      ...spreadsheetXmlChildren(previous, "dataValidation")
    );
  }
  sheet.children = sheet.children.filter(
    (child) => typeof child === "string" || local(child) !== "dataValidations"
  );
  rules.name = sheet.name.includes(":")
    ? `${sheet.name.split(":")[0]}:dataValidations`
    : "dataValidations";
  // Build validation children with the worksheet namespace prefix, if present.
  const prefix = sheet.name.includes(":") ? `${sheet.name.split(":")[0]}:` : "";
  const setPrefix = (node: SpreadsheetXmlNode): void => {
    node.name = `${prefix}${local(node)}`;
    for (const child of node.children) {
      if (typeof child !== "string") {
        setPrefix(child);
      }
    }
  };
  setPrefix(rules);
  rules.attributes.count = String(rules.children.length);
  if (rules.children.length) {
    const after = new Set([
      "sheetData",
      "sheetCalcPr",
      "sheetProtection",
      "protectedRanges",
      "scenarios",
      "autoFilter",
      "sortState",
      "dataConsolidate",
      "customSheetViews",
      "mergeCells",
      "phoneticPr",
      "conditionalFormatting",
    ]);
    let insertion = 0;
    for (let index = 0; index < sheet.children.length; index += 1) {
      const node = sheet.children[index];
      if (typeof node !== "string" && node && after.has(local(node))) {
        insertion = index + 1;
      }
    }
    sheet.children.splice(insertion, 0, rules);
  }
  if (optionRow || previousHelper) {
    helperData.children = [...helperRows.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([, row]) => row);
    if (!previousHelper) {
      helper.children.push(
        spreadsheetXmlElement(helper, "sheetProtection", {
          objects: "1",
          password: "DAA7",
          scenarios: "1",
          sheet: "1",
        })
      );
      const usedIds = new Set(
        spreadsheetXmlChildren(relationships, "Relationship").map(
          (node) => node.attributes.Id
        )
      );
      let relationshipId = "rIdFolioOptions";
      while (usedIds.has(relationshipId)) {
        relationshipId += "_";
      }
      relationships.children.push(
        spreadsheetXmlElement(relationships, "Relationship", {
          Id: relationshipId,
          Target: "worksheets/folio-options.xml",
          Type: `${relationshipNamespace}/worksheet`,
        })
      );
      book.attributes["xmlns:r"] = relationshipNamespace;
      const maximumSheetId = Math.max(
        0,
        ...spreadsheetXmlChildren(sheets, "sheet").map((node) =>
          Number(node.attributes.sheetId)
        )
      );
      sheets.children.push(
        spreadsheetXmlElement(sheets, "sheet", {
          name: helperName,
          "r:id": relationshipId,
          sheetId: String(maximumSheetId + 1),
          state: "veryHidden",
        })
      );
      types.children.push(
        spreadsheetXmlElement(types, "Override", {
          ContentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
          PartName: `/${helperPath}`,
        })
      );
    }
    archive[currentHelperPath] = strToU8(serializeSpreadsheetXml(helper));
  }
  archive[workbook.sheetPath] = strToU8(serializeSpreadsheetXml(sheet));
  archive["xl/workbook.xml"] = strToU8(serializeSpreadsheetXml(book));
  archive["xl/_rels/workbook.xml.rels"] = strToU8(
    serializeSpreadsheetXml(relationships)
  );
  archive["[Content_Types].xml"] = strToU8(serializeSpreadsheetXml(types));
  archive["xl/styles.xml"] = strToU8(serializeSpreadsheetXml(styles));
  if (
    Object.values(archive).reduce((sum, part) => sum + part.byteLength, 0) >
    maxTemplateArchiveExpandedBytes
  ) {
    throw new Error("Dropdown options exceed the workbook resource budget");
  }
  return zipSync(archive, { level: 6 });
};
