import path from "node:path";

import { strToU8, zipSync } from "fflate";

import { templateArchiveText, templateRelationshipPartPath } from "../package";
import {
  responsePictureImageDimensions,
  responsePictureRelationships,
} from "../pictures";
import { spreadsheetColumnName } from "./contract";
import type {
  SpreadsheetBindings,
  SpreadsheetContract,
  SpreadsheetRange,
} from "./contract";
import { spreadsheetPicturePlaceholder } from "./picture-placeholder";
import {
  marker,
  descendants,
  localAttribute,
  relationshipTree,
  drawingParts,
  readSpreadsheetPictures,
} from "./picture-reader";
import type { SpreadsheetPicture } from "./picture-reader";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "./workbook";
import type { SpreadsheetWorkbook } from "./workbook";
import {
  serializeSpreadsheetXml,
  spreadsheetXmlChildren,
  spreadsheetXmlElement,
  spreadsheetXmlTree,
} from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

export { readSpreadsheetPictures } from "./picture-reader";

/** Moving a frame in the template editor moves its field before publication. */
// oxlint-disable-next-line complexity -- Validate each mapped drawing before updating its associated named range.
export const synchronizeSpreadsheetPictureAnchors = (
  bytes: Uint8Array,
  bindings: SpreadsheetBindings
): Uint8Array => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const fields = new Map(
    bindings.fields
      .filter((field) => field.type === "picture")
      .map((field) => [marker(field), field])
  );
  if (fields.size === 0) {
    return bytes;
  }
  const book = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, "xl/workbook.xml")
  );
  const seen = new Set<string>();
  for (const part of drawingParts(workbook)) {
    for (const anchor of part.tree.children) {
      if (typeof anchor === "string") {
        continue;
      }
      const matches = descendants(anchor, "cNvPr").filter((node) =>
        fields.has(node.attributes.name ?? "")
      );
      if (matches.length === 0) {
        continue;
      }
      const field = fields.get(matches[0]?.attributes.name ?? "");
      if (!field || matches.length !== 1 || seen.has(field.id)) {
        throw new Error("พบกรอบรูปซ้ำ กรุณาลบกรอบที่ซ้ำก่อนเผยแพร่");
      }
      seen.add(field.id);
      const [from] = spreadsheetXmlChildren(anchor, "from");
      const row = Number(
        from && spreadsheetXmlChildren(from, "row")[0]?.children.join("")
      );
      const column = Number(
        from && spreadsheetXmlChildren(from, "col")[0]?.children.join("")
      );
      if (
        !from ||
        !Number.isSafeInteger(row) ||
        row < 0 ||
        row >= 1_048_576 ||
        !Number.isSafeInteger(column) ||
        column < 0 ||
        column >= 16_384
      ) {
        throw new Error(
          `ตำแหน่งกรอบรูปไม่ถูกต้อง: ${field.label} กรุณาวางกรอบบนเซลล์ในชีต`
        );
      }
      const merged = workbook.merges.find(
        (range) =>
          row >= range.firstRow &&
          row <= range.lastRow &&
          column >= range.firstColumn &&
          column <= range.lastColumn
      );
      if (
        merged &&
        (row !== merged.firstRow || column !== merged.firstColumn)
      ) {
        throw new Error(
          `กรอบรูป ${field.label} อยู่กลางเซลล์รวม กรุณาย้ายมุมซ้ายบนของกรอบไปที่มุมซ้ายบนของเซลล์รวม`
        );
      }
      const previous = workbook.names.get(field.anchor);
      const range = merged ?? {
        firstColumn: column,
        firstRow: row,
        lastColumn: column,
        lastRow: row,
        sheet: workbook.sheet,
      };
      if (previous && JSON.stringify(previous) === JSON.stringify(range)) {
        continue;
      }
      const name = descendants(book, "definedName").find(
        (node) => node.attributes.name === field.anchor
      );
      if (!name) {
        throw new Error(`ไม่พบตำแหน่งอ้างอิงของกรอบรูป: ${field.label}`);
      }
      const start = `$${spreadsheetColumnName(range.firstColumn)}$${range.firstRow + 1}`;
      const end = `$${spreadsheetColumnName(range.lastColumn)}$${range.lastRow + 1}`;
      name.children = [
        `'${workbook.sheet.replaceAll("'", "''")}'!${start}${start === end ? "" : `:${end}`}`,
      ];
    }
  }
  workbook.archive["xl/workbook.xml"] = strToU8(serializeSpreadsheetXml(book));
  const synchronized = zipSync(workbook.archive, { level: 6 });
  const updated = readSpreadsheetWorkbook(synchronized);
  const contract = resolveSpreadsheetContract(bindings, updated);
  readSpreadsheetPictures(updated, contract, { includePlaceholders: true });
  return synchronized;
};

const office =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const drawingNamespace =
  "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const drawingMain = "http://schemas.openxmlformats.org/drawingml/2006/main";
const writePart = (
  workbook: SpreadsheetWorkbook,
  name: string,
  node: SpreadsheetXmlNode
): void => {
  workbook.archive[name] = strToU8(serializeSpreadsheetXml(node));
};
const nextRelationship = (tree: SpreadsheetXmlNode): string => {
  const used = new Set(
    spreadsheetXmlChildren(tree, "Relationship").map(
      (node) => node.attributes.Id
    )
  );
  let index = 1;
  while (used.has(`rId${index}`)) {
    index += 1;
  }
  return `rId${index}`;
};

/** Rebuild only mapped pictures; all other drawings and layout come from the trusted artifact. */
export const overlaySpreadsheetPictures = (
  bytes: Uint8Array,
  contract: SpreadsheetContract,
  pictures: ReadonlyMap<string, SpreadsheetPicture>,
  options: { lockPosition?: boolean } = {}
): Uint8Array => {
  const fields = contract.fields.filter((field) => field.type === "picture");
  if (fields.length === 0) {
    return bytes;
  }
  const workbook = readSpreadsheetWorkbook(bytes);
  const types = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, "[Content_Types].xml")
  );
  const markers = new Set(fields.map(marker));
  const candidates = new Set<string>();
  const parts = drawingParts(workbook);
  for (const part of parts) {
    const removed = new Set<string>();
    part.tree.children = part.tree.children.filter((node) => {
      if (
        typeof node === "string" ||
        !descendants(node, "cNvPr").some((property) =>
          markers.has(property.attributes.name ?? "")
        )
      ) {
        return true;
      }
      for (const blip of descendants(node, "blip")) {
        const id = localAttribute(blip, "embed");
        if (id) {
          removed.add(id);
        }
      }
      return false;
    });
    const retained = new Set(
      descendants(part.tree, "blip").map((node) =>
        localAttribute(node, "embed")
      )
    );
    const targets = responsePictureRelationships(workbook.archive, part.path);
    const relationships = relationshipTree(workbook, part.path);
    relationships.children = relationships.children.filter((node) => {
      if (
        typeof node === "string" ||
        !removed.has(node.attributes.Id ?? "") ||
        retained.has(node.attributes.Id)
      ) {
        return true;
      }
      const target = targets.get(node.attributes.Id ?? "");
      if (target) {
        candidates.add(target);
      }
      return false;
    });
    writePart(workbook, part.path, part.tree);
    writePart(workbook, templateRelationshipPartPath(part.path), relationships);
  }
  // Do not delete shared media used by a static image or another worksheet part.
  const referenced = new Set<string>();
  for (const name of Object.keys(workbook.archive).filter((entry) =>
    entry.endsWith(".rels")
  )) {
    const source = name.replace(/_rels\//u, "").replace(/\.rels$/u, "");
    for (const target of responsePictureRelationships(
      workbook.archive,
      source
    ).values()) {
      if (target) {
        referenced.add(target);
      }
    }
  }
  for (const candidate of candidates) {
    if (referenced.has(candidate)) {
      continue;
    }
    // oxlint-disable-next-line no-dynamic-delete -- ZIP package entries are a keyed byte dictionary.
    delete workbook.archive[candidate];
    types.children = types.children.filter(
      (node) =>
        typeof node === "string" || node.attributes.PartName !== `/${candidate}`
    );
  }
  if (pictures.size > 0) {
    let [part] = parts;
    if (!part) {
      part = {
        path: `xl/drawings/pictures-${crypto.randomUUID()}.xml`,
        tree: spreadsheetXmlTree(
          `<xdr:wsDr xmlns:xdr="${drawingNamespace}" xmlns:a="${drawingMain}" xmlns:r="${office}"/>`
        ),
      };
      const relationships = relationshipTree(workbook, workbook.sheetPath);
      const id = nextRelationship(relationships);
      relationships.children.push(
        spreadsheetXmlElement(relationships, "Relationship", {
          Id: id,
          Target: path.posix.relative(
            path.posix.dirname(workbook.sheetPath),
            part.path
          ),
          Type: `${office}/drawing`,
        })
      );
      writePart(
        workbook,
        templateRelationshipPartPath(workbook.sheetPath),
        relationships
      );
      const sheet = spreadsheetXmlTree(
        templateArchiveText(workbook.archive, workbook.sheetPath)
      );
      const drawing = spreadsheetXmlElement(sheet, "drawing", {
        "r:id": id,
        "xmlns:r": office,
      });
      const tail = sheet.children.findIndex(
        (node) =>
          typeof node !== "string" &&
          [
            "legacyDrawing",
            "legacyDrawingHF",
            "picture",
            "oleObjects",
            "controls",
            "webPublishItems",
            "tableParts",
            "extLst",
          ].includes(node.name.split(":").at(-1) ?? "")
      );
      sheet.children.splice(
        tail === -1 ? sheet.children.length : tail,
        0,
        drawing
      );
      writePart(workbook, workbook.sheetPath, sheet);
      types.children.push(
        spreadsheetXmlElement(types, "Override", {
          ContentType:
            "application/vnd.openxmlformats-officedocument.drawing+xml",
          PartName: `/${part.path}`,
        })
      );
    }
    const relationships = relationshipTree(workbook, part.path);
    let drawingId = Math.max(
      0,
      ...descendants(part.tree, "cNvPr").map(
        (node) => Number(node.attributes.id) || 0
      )
    );
    for (const field of fields) {
      const picture = pictures.get(field.id);
      const range = contract.locations[field.anchor];
      if (!picture || !range) {
        continue;
      }
      const dimensions = responsePictureImageDimensions(picture.bytes);
      if (!dimensions) {
        throw new Error("Invalid spreadsheet picture");
      }
      const media = `xl/media/picture-${crypto.randomUUID()}.${dimensions.format}`;
      workbook.archive[media] = picture.bytes;
      types.children.push(
        spreadsheetXmlElement(types, "Override", {
          ContentType: `image/${dimensions.format}`,
          PartName: `/${media}`,
        })
      );
      const id = nextRelationship(relationships);
      relationships.children.push(
        spreadsheetXmlElement(relationships, "Relationship", {
          Id: id,
          Target: path.posix.relative(path.posix.dirname(part.path), media),
          Type: `${office}/image`,
        })
      );
      drawingId += 1;
      part.tree.children.push(
        spreadsheetXmlTree(
          `<xdr:oneCellAnchor xmlns:xdr="${drawingNamespace}" xmlns:a="${drawingMain}" xmlns:r="${office}"><xdr:from><xdr:col>${range.firstColumn}</xdr:col><xdr:colOff>${picture.columnOffset ?? 0}</xdr:colOff><xdr:row>${range.firstRow}</xdr:row><xdr:rowOff>${picture.rowOffset ?? 0}</xdr:rowOff></xdr:from><xdr:ext cx="${picture.width}" cy="${picture.height}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${drawingId}" name="${marker(field)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"${options.lockPosition ? ' noMove="1" noResize="0"' : ""}/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${picture.width}" cy="${picture.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`
        )
      );
    }
    writePart(workbook, part.path, part.tree);
    writePart(workbook, templateRelationshipPartPath(part.path), relationships);
  }
  writePart(workbook, "[Content_Types].xml", types);
  return zipSync(workbook.archive, { level: 6 });
};

const pictureExtent = (pixels: number): number =>
  Math.round(
    Math.max(1, Math.min(4096, Number.isFinite(pixels) ? pixels : 1)) * 9525
  );

/** Use the trusted worksheet layout when an older template has no picture frame. */
const pictureRangeExtent = (
  workbook: SpreadsheetWorkbook,
  range: SpreadsheetRange
): { width: number; height: number } => {
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  const [defaults] = spreadsheetXmlChildren(sheet, "sheetFormatPr");
  const columns = descendants(sheet, "col");
  const rows = descendants(sheet, "row");
  let width = 0;
  let height = 0;
  for (
    let column = range.firstColumn;
    column <= range.lastColumn;
    column += 1
  ) {
    const definition = columns.find(
      (node) =>
        Number(node.attributes.min) <= column + 1 &&
        Number(node.attributes.max) >= column + 1
    );
    width +=
      definition?.attributes.hidden === "1"
        ? 0
        : Math.floor(
            Number(
              definition?.attributes.width ??
                defaults?.attributes.defaultColWidth ??
                8.43
            ) *
              7 +
              5
          );
  }
  for (let row = range.firstRow; row <= range.lastRow; row += 1) {
    const definition = rows.find(
      (node) => Number(node.attributes.r) === row + 1
    );
    height +=
      definition?.attributes.hidden === "1"
        ? 0
        : (Number(
            definition?.attributes.ht ??
              defaults?.attributes.defaultRowHeight ??
              15
          ) *
            96) /
          72;
  }
  return { height: pictureExtent(height), width: pictureExtent(width) };
};

export interface SpreadsheetPictureFrame {
  id: string;
  anchor: string;
  width: number;
  height: number;
  columnOffset: number;
  rowOffset: number;
}

/** Read initial frame sizes from the immutable published workbook, including legacy mappings. */
export const readSpreadsheetPictureFrames = (
  bytes: Uint8Array,
  contract: SpreadsheetContract
): SpreadsheetPictureFrame[] => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const pictures = readSpreadsheetPictures(workbook, contract, {
    includePlaceholders: true,
  });
  return contract.fields
    .filter((field) => field.type === "picture")
    .map((field) => {
      const range = contract.locations[field.anchor];
      if (!range) {
        throw new Error(`Missing picture field range: ${field.label}`);
      }
      const picture = pictures.get(field.id);
      const { width, height } = picture ?? pictureRangeExtent(workbook, range);
      return {
        anchor: field.anchor,
        columnOffset: picture?.columnOffset ?? 0,
        height,
        id: field.id,
        rowOffset: picture?.rowOffset ?? 0,
        width,
      };
    });
};

/** Restore deleted frames and retain only the template's immutable position offsets. */
export const restoreSpreadsheetPictureFrames = (
  pictures: ReadonlyMap<string, SpreadsheetPicture>,
  frames: readonly SpreadsheetPictureFrame[]
): Map<string, SpreadsheetPicture> => {
  const restored = new Map<string, SpreadsheetPicture>();
  const placeholderBytes = Uint8Array.from(
    Buffer.from(
      spreadsheetPicturePlaceholder.dataUrl.split(",")[1] ?? "",
      "base64"
    )
  );
  for (const frame of frames) {
    const picture = pictures.get(frame.id);
    restored.set(frame.id, {
      bytes: picture?.bytes ?? placeholderBytes,
      columnOffset: frame.columnOffset,
      height: picture?.height ?? frame.height,
      rowOffset: frame.rowOffset,
      width: picture?.width ?? frame.width,
    });
  }
  return restored;
};

/** Published template photos are instructions, never a respondent's answer. */
export const resetSpreadsheetPicturePlaceholders = (
  bytes: Uint8Array,
  contract: SpreadsheetContract,
  options: { lockPosition?: boolean } = {}
): Uint8Array => {
  if (!contract.fields.some((field) => field.type === "picture")) {
    return bytes;
  }
  const workbook = readSpreadsheetWorkbook(bytes);
  const existing = readSpreadsheetPictures(workbook, contract, {
    includePlaceholders: true,
  });
  const placeholderBytes = Uint8Array.from(
    Buffer.from(
      spreadsheetPicturePlaceholder.dataUrl.split(",")[1] ?? "",
      "base64"
    )
  );
  const pictures = new Map<string, SpreadsheetPicture>();
  for (const field of contract.fields.filter(
    (entry) => entry.type === "picture"
  )) {
    const range = contract.locations[field.anchor];
    if (!range) {
      throw new Error(`Missing picture field range: ${field.label}`);
    }
    const previous = existing.get(field.id);
    const { width, height } = previous ?? pictureRangeExtent(workbook, range);
    pictures.set(field.id, {
      bytes: placeholderBytes,
      columnOffset: previous?.columnOffset ?? 0,
      height,
      rowOffset: previous?.rowOffset ?? 0,
      width,
    });
  }
  return overlaySpreadsheetPictures(bytes, contract, pictures, options);
};
