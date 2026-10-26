// oxlint-disable sort-keys -- Target descriptors follow their binding identity; validation branches are explicit.
import { strToU8, zipSync } from "fflate";

import { templateRelationshipPartPath, templateArchiveText } from "../package";
import { responsePictureRelationships } from "../pictures";
import {
  reconcileSpreadsheetColumns,
  spreadsheetColumnAnchor,
} from "./columns";
import type { SpreadsheetBindings, SpreadsheetRange } from "./contract";
import { parseSpreadsheetRange } from "./contract";
import { readUploadPocMetadata } from "./upload-poc-package";
import { uploadPocGuid } from "./upload-poc-preview";
import { readSpreadsheetWorkbook } from "./workbook";
import {
  serializeSpreadsheetXml,
  spreadsheetXmlTree,
  spreadsheetXmlElement,
} from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

export { uploadPocGuid, uploadPocPreview } from "./upload-poc-preview";
// @ts-expect-error -- Shared native command is JavaScript serialized into the ONLYOFFICE sandbox.
export { spreadsheetUploadPocCommand } from "./upload-poc-command.js";

export interface UploadPocTarget {
  anchor: string;
  bindingId: string;
  kind: "field" | "column";
  sheet: string;
  tag: string;
  bodyAnchor?: string;
  columnOffset?: number;
}

const local = (node: SpreadsheetXmlNode): string =>
  node.name.split(":").at(-1) ?? node.name;
const nodes = (
  node: SpreadsheetXmlNode,
  name: string
): SpreadsheetXmlNode[] => [
  ...(local(node) === name ? [node] : []),
  ...node.children.flatMap((child) =>
    typeof child === "string" ? [] : nodes(child, name)
  ),
];
const sameRange = (
  left: SpreadsheetRange | null | undefined,
  right: SpreadsheetRange | undefined
): boolean =>
  Boolean(
    left &&
    right &&
    ["sheet", "firstRow", "lastRow", "firstColumn", "lastColumn"].every(
      (key) =>
        left[key as keyof SpreadsheetRange] ===
        right[key as keyof SpreadsheetRange]
    )
  );

/** Managed names opt existing text mappings into a display-only POC; no new answer type. */
export const spreadsheetUploadPocTargets = (
  bytes: Uint8Array,
  input: SpreadsheetBindings
): UploadPocTarget[] => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const markers = nodes(
    spreadsheetXmlTree(
      templateArchiveText(workbook.archive, "xl/workbook.xml")
    ),
    "definedName"
  ).filter((node) => node.attributes.name?.startsWith("_folio_upload_poc_"));
  if (!markers.length) {
    return [];
  }
  const bindings = reconcileSpreadsheetColumns(input, workbook.names);
  const candidates = new Map<
    string,
    {
      target: UploadPocTarget;
      range: SpreadsheetRange | undefined;
      type: string;
      computed?: boolean;
    }
  >();
  for (const field of bindings.fields) {
    candidates.set(field.id, {
      computed: field.computed,
      range: workbook.names.get(field.anchor),
      target: {
        anchor: field.anchor,
        bindingId: field.id,
        kind: "field",
        sheet: workbook.sheet,
        tag: field.key,
      },
      type: field.type,
    });
  }
  if (bindings.table) {
    const body = workbook.names.get(bindings.table.anchor);
    for (const column of bindings.table.columns) {
      candidates.set(column.id, {
        computed: column.computed,
        range: body
          ? {
              ...body,
              firstColumn: body.firstColumn + column.offset,
              lastColumn: body.firstColumn + column.offset,
            }
          : undefined,
        target: {
          anchor: spreadsheetColumnAnchor(column.id),
          bindingId: column.id,
          bodyAnchor: bindings.table.anchor,
          columnOffset: column.offset,
          kind: "column",
          sheet: workbook.sheet,
          tag: `${bindings.table.key}.${column.key}`,
        },
        type: column.type,
      });
    }
  }
  const seen = new Set<string>();
  return markers.map((marker) => {
    const name = marker.attributes.name ?? "";
    const id = name.slice("_folio_upload_poc_".length);
    const candidate = candidates.get(id);
    if (
      !/^folio_[A-Za-z0-9_]+$/u.test(id) ||
      seen.has(id) ||
      !candidate ||
      candidate.type !== "text" ||
      candidate.computed ||
      marker.attributes.localSheetId !== undefined ||
      !sameRange(
        (() => {
          try {
            return parseSpreadsheetRange(
              marker.children
                .filter((child): child is string => typeof child === "string")
                .join("")
            );
          } catch {
            return null;
          }
        })(),
        candidate.range
      )
    ) {
      throw new Error(
        "Upload POC marker does not match an editable text mapping"
      );
    }
    seen.add(id);
    return candidate.target;
  });
};

export interface SavedUploadPocButton {
  bindingId: string;
  tag: string;
  rowIndex: number | null;
}

/** Authorize picking only for controls already present in the canonical saved artifact. */
// oxlint-disable-next-line complexity -- Match each persisted OLE to its trusted marker, field, row and physical anchor before authorizing selection.
export const savedSpreadsheetUploadPocButtons = (
  bytes: Uint8Array,
  bindings: SpreadsheetBindings
): SavedUploadPocButton[] => {
  const workbook = readSpreadsheetWorkbook(bytes);
  let targets: UploadPocTarget[];
  try {
    targets = spreadsheetUploadPocTargets(bytes, bindings);
  } catch {
    // Old markers may refer to renamed/deleted live mappings. Keep editing possible,
    // but do not authorize file selection until the next successful template save.
    return [];
  }
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  const relationships = responsePictureRelationships(
    workbook.archive,
    workbook.sheetPath
  );
  const result: SavedUploadPocButton[] = [];
  for (const object of nodes(sheet, "oleObject")) {
    if (object.attributes.progId !== uploadPocGuid) {
      continue;
    }
    const id = Object.entries(object.attributes).find(
      ([key]) => key.split(":").at(-1) === "id"
    )?.[1];
    const part = id && relationships.get(id);
    if (!part || !workbook.archive[part]) {
      continue;
    }
    const metadata = readUploadPocMetadata(workbook.archive[part]);
    const target = targets.find(
      (entry) =>
        entry.bindingId === metadata.bindingId && entry.tag === metadata.tag
    );
    if (!target) {
      continue;
    }
    const range = workbook.names.get(target.bodyAnchor ?? target.anchor);
    const [from] = nodes(object, "from");
    if (!range || !from) {
      continue;
    }
    const row = Number(nodes(from, "row")[0]?.children.join(""));
    const column = Number(nodes(from, "col")[0]?.children.join(""));
    const rowIndex = target.kind === "field" ? null : metadata.rowIndex;
    if (
      target.kind === "column" &&
      (!Number.isSafeInteger(rowIndex) ||
        Number(rowIndex) < 0 ||
        Number(rowIndex) > range.lastRow - range.firstRow)
    ) {
      continue;
    }
    if (
      target.kind === "field" &&
      metadata.rowIndex !== null &&
      metadata.rowIndex !== undefined
    ) {
      continue;
    }
    if (
      row !== range.firstRow + (rowIndex ?? 0) ||
      column !== range.firstColumn + (target.columnOffset ?? 0)
    ) {
      continue;
    }
    result.push({
      bindingId: metadata.bindingId,
      tag: metadata.tag,
      rowIndex: rowIndex ?? null,
    });
  }
  return result.filter(
    (entry) =>
      result.filter(
        (candidate) =>
          candidate.bindingId === entry.bindingId &&
          candidate.rowIndex === entry.rowIndex
      ).length === 1
  );
};

/** A placement ACK proves this exact binding, including every canonical table row. */
export const savedSpreadsheetUploadPocBindingComplete = (
  bytes: Uint8Array,
  bindings: SpreadsheetBindings,
  bindingId: string
): boolean => {
  let target: UploadPocTarget | undefined;
  try {
    target = spreadsheetUploadPocTargets(bytes, bindings).find(
      (entry) => entry.bindingId === bindingId
    );
  } catch {
    return false;
  }
  if (!target) {
    return false;
  }
  const slots = savedSpreadsheetUploadPocButtons(bytes, bindings).filter(
    (entry) => entry.bindingId === bindingId && entry.tag === target.tag
  );
  if (target.kind === "field") {
    return slots.length === 1 && slots[0]?.rowIndex === null;
  }
  const body =
    target.bodyAnchor &&
    readSpreadsheetWorkbook(bytes).names.get(target.bodyAnchor);
  if (!body) {
    return false;
  }
  const expected = body.lastRow - body.firstRow + 1;
  return (
    expected > 0 &&
    slots.length === expected &&
    new Set(slots.map((entry) => entry.rowIndex)).size === expected &&
    slots.every(
      (entry) =>
        Number.isSafeInteger(entry.rowIndex) &&
        Number(entry.rowIndex) >= 0 &&
        Number(entry.rowIndex) < expected
    )
  );
};

/** Community 9.4 has no drawing Delete API. Remove only this POC's OLE nodes and VML previews before native regeneration. */
export const stripSpreadsheetUploadPoc = (
  bytes: Uint8Array,
  retainBindingIds: ReadonlySet<string> = new Set()
): Uint8Array => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  const relationships = responsePictureRelationships(
    workbook.archive,
    workbook.sheetPath
  );
  const removedTargets = new Set<string>();
  const ids = new Set(
    nodes(sheet, "oleObject")
      .filter((node) => {
        if (node.attributes.progId !== uploadPocGuid) {
          return false;
        }
        const id = Object.entries(node.attributes).find(
          ([key]) => key.split(":").at(-1) === "id"
        )?.[1];
        const target = id && relationships.get(id);
        const part = target && workbook.archive[target];
        if (!part || !target) {
          throw new Error("Missing POC object metadata");
        }
        if (retainBindingIds.has(readUploadPocMetadata(part).bindingId)) {
          return false;
        }
        removedTargets.add(target);
        return true;
      })
      .map((node) => node.attributes.shapeId)
  );
  if (!ids.size) {
    return bytes;
  }
  const prune = (node: SpreadsheetXmlNode): void => {
    node.children = node.children.filter((child) => {
      if (typeof child === "string") {
        return true;
      }
      const objects = nodes(child, "oleObject");
      if (
        objects.length &&
        objects.every((object) => ids.has(object.attributes.shapeId))
      ) {
        return false;
      }
      prune(child);
      return true;
    });
  };
  // Start below the worksheet so a sheet containing only POC objects is not removed.
  for (const child of sheet.children) {
    if (typeof child !== "string") {
      prune(child);
    }
  }
  sheet.children = sheet.children.filter(
    (child) =>
      typeof child === "string" ||
      local(child) !== "oleObjects" ||
      nodes(child, "oleObject").length > 0
  );
  workbook.archive[workbook.sheetPath] = strToU8(
    serializeSpreadsheetXml(sheet)
  );
  for (const legacy of nodes(sheet, "legacyDrawing")) {
    const relationshipId = Object.entries(legacy.attributes).find(
      ([key]) => key.split(":").at(-1) === "id"
    )?.[1];
    const name = relationshipId && relationships.get(relationshipId);
    if (
      !name ||
      !workbook.archive[name] ||
      !name.startsWith("xl/drawings/") ||
      !name.endsWith(".vml")
    ) {
      continue;
    }
    const vml = spreadsheetXmlTree(templateArchiveText(workbook.archive, name));
    vml.children = vml.children.filter(
      (child) =>
        typeof child === "string" ||
        local(child) !== "shape" ||
        !ids.has((child.attributes.id ?? "").replace(/^_x0000_s/u, ""))
    );
    workbook.archive[name] = strToU8(serializeSpreadsheetXml(vml));
  }
  const embedded = new Set<string>();
  const relationshipsPath = templateRelationshipPartPath(workbook.sheetPath);
  const relations = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, relationshipsPath)
  );
  relations.children = relations.children.filter((child) => {
    if (typeof child === "string") {
      return true;
    }
    const target = relationships.get(child.attributes.Id ?? "");
    if (target && removedTargets.has(target)) {
      embedded.add(target);
      return false;
    }
    return true;
  });
  for (const name of embedded) {
    Reflect.deleteProperty(workbook.archive, name);
  }
  workbook.archive[relationshipsPath] = strToU8(
    serializeSpreadsheetXml(relations)
  );
  const types = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, "[Content_Types].xml")
  );
  types.children = types.children.filter(
    (child) =>
      typeof child === "string" ||
      !embedded.has((child.attributes.PartName ?? "").replace(/^\//u, ""))
  );
  workbook.archive["[Content_Types].xml"] = strToU8(
    serializeSpreadsheetXml(types)
  );
  return zipSync(workbook.archive);
};

/** Native 9.4 AddOleObject leaves its bottom-right anchor at A1. Normalize only managed previews so reopening keeps their physical size. */
// oxlint-disable-next-line complexity -- Validate every metadata, mapped range and preview geometry before changing only owned OLE anchors.
export const normalizeSpreadsheetUploadPocAnchors = (
  bytes: Uint8Array
): Uint8Array => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  const objects = nodes(sheet, "oleObject").filter(
    (node) =>
      node.attributes.progId === uploadPocGuid && nodes(node, "objectPr").length
  );
  if (!objects.length) {
    return bytes;
  }
  const relationships = responsePictureRelationships(
    workbook.archive,
    workbook.sheetPath
  );
  const book = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, "xl/workbook.xml")
  );
  const markers = new Map(
    nodes(book, "definedName").map((node) => [node.attributes.name, node])
  );
  const geometry = new Map<
    string,
    {
      column: number;
      row: number;
      endColumn: number;
      endRow: number;
      height: number;
      width: number;
    }
  >();
  const defaultHeight = Number(
    nodes(sheet, "sheetFormatPr")[0]?.attributes.defaultRowHeight ?? 14.25
  );
  const columnDefinitions = nodes(sheet, "col").filter(
    (node) => node.attributes.min !== undefined
  );
  const defaultWidth = Number(
    nodes(sheet, "sheetFormatPr")[0]?.attributes.defaultColWidth ?? 8.43
  );
  const rowHeights = new Map(
    nodes(sheet, "row").map((node) => [
      Number(node.attributes.r) - 1,
      Number(node.attributes.ht ?? defaultHeight),
    ])
  );
  for (const object of objects) {
    const relationshipId = Object.entries(object.attributes).find(
      ([key]) => key.split(":").at(-1) === "id"
    )?.[1];
    const part = relationshipId && relationships.get(relationshipId);
    if (!part || !workbook.archive[part]) {
      throw new Error("Missing POC metadata");
    }
    const metadata = readUploadPocMetadata(workbook.archive[part]);
    const marker = markers.get(`_folio_upload_poc_${metadata.bindingId}`);
    if (!marker) {
      throw new Error("Missing POC placement marker");
    }
    const range = parseSpreadsheetRange(
      marker.children
        .filter((child): child is string => typeof child === "string")
        .join("")
    );
    for (const properties of nodes(object, "objectPr")) {
      properties.attributes.locked = "0";
    }
    const [anchor] = nodes(object, "anchor");
    const from = anchor && nodes(anchor, "from")[0];
    const to = anchor && nodes(anchor, "to")[0];
    const row = Number(from && nodes(from, "row")[0]?.children.join(""));
    const column = Number(from && nodes(from, "col")[0]?.children.join(""));
    if (
      !from ||
      !to ||
      range.sheet !== workbook.sheet ||
      column !== range.firstColumn ||
      !Number.isSafeInteger(row) ||
      row < range.firstRow ||
      row > range.lastRow
    ) {
      throw new Error("Invalid POC preview anchor");
    }
    for (const name of ["colOff", "rowOff"]) {
      const [coordinate] = nodes(from, name);
      if (!coordinate) {
        throw new Error("Incomplete POC preview anchor");
      }
      coordinate.children = ["0"];
    }
    const lastRow = metadata.tag.includes(".") ? row : range.lastRow;
    let cellHeight = 0;
    for (let current = row; current <= lastRow; current += 1) {
      cellHeight += rowHeights.get(current) ?? defaultHeight;
    }
    let cellWidth = 0;
    for (let current = column; current <= range.lastColumn; current += 1) {
      const definition = columnDefinitions.find(
        (node) =>
          Number(node.attributes.min) <= current + 1 &&
          Number(node.attributes.max) >= current + 1
      );
      cellWidth +=
        definition?.attributes.hidden === "1"
          ? 0
          : Math.floor(
              Number(definition?.attributes.width ?? defaultWidth) * 7 + 5
            );
    }
    const scale = Math.min(1, cellWidth / 110, (cellHeight * 4) / 3 / 24);
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error("Upload POC cell has no visible space");
    }
    const width = 110 * scale;
    const height = 24 * scale;
    // Offsets preserve the compact preview even when it ends before the next grid boundary.
    for (const [name, value] of [
      ["col", column],
      ["colOff", Math.round(width * 9525)],
      ["row", row],
      ["rowOff", Math.round(height * 9525)],
    ] as const) {
      const [coordinate] = nodes(to, name);
      if (!coordinate) {
        throw new Error("Incomplete POC preview anchor");
      }
      coordinate.children = [String(value)];
    }
    geometry.set(object.attributes.shapeId ?? "", {
      column,
      row,
      endColumn: column,
      endRow: row,
      height,
      width,
    });
  }
  workbook.archive[workbook.sheetPath] = strToU8(
    serializeSpreadsheetXml(sheet)
  );
  for (const legacy of nodes(sheet, "legacyDrawing")) {
    const relationshipId = Object.entries(legacy.attributes).find(
      ([key]) => key.split(":").at(-1) === "id"
    )?.[1];
    const part = relationshipId && relationships.get(relationshipId);
    if (!part || !workbook.archive[part]) {
      continue;
    }
    const vml = spreadsheetXmlTree(templateArchiveText(workbook.archive, part));
    for (const shape of nodes(vml, "shape")) {
      const bounds = geometry.get(
        (shape.attributes.id ?? "").replace(/^_x0000_s/u, "")
      );
      if (!bounds) {
        continue;
      }
      shape.attributes.style = (shape.attributes.style ?? "").replace(
        /height:[0-9.]+pt/u,
        `height:${bounds.height * 0.75}pt`
      );
      shape.attributes.style = (shape.attributes.style ?? "").replace(
        /width:[0-9.]+pt/u,
        `width:${bounds.width * 0.75}pt`
      );
      const [client] = nodes(shape, "ClientData");
      if (!client) {
        throw new Error("Missing POC preview interaction metadata");
      }
      const [locked] = nodes(client, "Locked");
      if (locked) {
        locked.children = ["False"];
      } else {
        client.children.push({
          ...spreadsheetXmlElement(client, "Locked"),
          children: ["False"],
        });
      }
      const [anchor] = nodes(shape, "Anchor");
      if (!anchor) {
        throw new Error("Missing POC preview geometry");
      }
      anchor.children = [
        String([
          bounds.column,
          0,
          bounds.row,
          0,
          bounds.endColumn,
          Math.round(bounds.width),
          bounds.endRow,
          Math.round(bounds.height),
        ]),
      ];
    }
    workbook.archive[part] = strToU8(serializeSpreadsheetXml(vml));
  }
  return zipSync(workbook.archive);
};
