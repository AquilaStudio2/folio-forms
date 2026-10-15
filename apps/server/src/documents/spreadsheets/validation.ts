// oxlint-disable complexity -- Rebuild each schema type and its OOXML relationships as one atomic archive update.
import { createHash } from "node:crypto";

import { strToU8, zipSync } from "fflate";

import {
  maxTemplateArchiveExpandedBytes,
  templateArchiveText,
} from "../package";
import { spreadsheetColumnName } from "./contract";
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

const removeValidationNodes = (node: SpreadsheetXmlNode): void => {
  node.children = node.children.filter(
    (child) => typeof child === "string" || local(child) !== "dataValidations"
  );
  for (const child of node.children) {
    if (typeof child !== "string") {
      removeValidationNodes(child);
    }
  }
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
  names.children = names.children.filter(
    (node) =>
      typeof node === "string" ||
      !node.attributes.name?.startsWith("_folio_options_")
  );
  const previousHelper = spreadsheetXmlChildren(sheets, "sheet").find(
    (node) => node.attributes.name === helperName
  );
  const oldRelationshipId = previousHelper?.attributes["r:id"];
  const oldRelationship = spreadsheetXmlChildren(
    relationships,
    "Relationship"
  ).find((node) => node.attributes.Id === oldRelationshipId);
  const oldPart = oldRelationship?.attributes.Target;
  if (oldPart) {
    const oldPath = oldPart.startsWith("/")
      ? oldPart.slice(1)
      : `xl/${oldPart}`;
    Reflect.deleteProperty(archive, oldPath);
    types.children = types.children.filter(
      (node) =>
        typeof node === "string" || node.attributes.PartName !== `/${oldPath}`
    );
  }
  sheets.children = sheets.children.filter((node) => node !== previousHelper);
  relationships.children = relationships.children.filter(
    (node) => node !== oldRelationship
  );
  const helper = spreadsheetXmlTree(
    `<worksheet xmlns="${mainNamespace}"><sheetData/></worksheet>`
  );
  const helperData = spreadsheetXmlChildren(
    helper,
    "sheetData"
  )[0] as SpreadsheetXmlNode;
  const rules = spreadsheetXmlElement(helper, "dataValidations", {});
  const helperRows = new Map<number, SpreadsheetXmlNode>();
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
  let optionRow = 0;
  const listReference = (id: string, options: string[]): string => {
    if (options.length > 1_048_576) {
      throw new Error("Dropdown options exceed the XLSX worksheet row limit");
    }
    if (optionRow + options.length > 1_048_576) {
      optionColumn += 1;
      optionRow = 0;
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
    const name = `_folio_options_${createHash("sha256").update(id).digest("hex").slice(0, 20)}`;
    const defined = spreadsheetXmlElement(names, "definedName", {
      hidden: "1",
      name,
    });
    defined.children = [
      `'${helperName}'!$${column}$${firstRow}:$${column}$${optionRow}`,
    ];
    names.children.push(defined);
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
    if (field.computed || field.type === "text") {
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
    let formula: string;
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
    } else {
      rule.attributes.type = "date";
      rule.attributes.operator = "between";
      formula = "0";
      const maximum = spreadsheetXmlElement(rule, "formula2");
      maximum.children = [workbook.date1904 ? "2957003" : "2958465"];
      rule.children.push(maximum);
    }
    const first = spreadsheetXmlElement(rule, "formula1");
    first.children = [formula];
    rule.children.unshift(first);
    rules.children.push(rule);
  }
  const sheet = spreadsheetXmlTree(
    templateArchiveText(archive, workbook.sheetPath)
  );
  removeValidationNodes(sheet);
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
  if (optionRow || optionColumn) {
    helperData.children = [...helperRows.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([, row]) => row);
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
    archive[helperPath] = strToU8(serializeSpreadsheetXml(helper));
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
