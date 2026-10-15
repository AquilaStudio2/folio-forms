import { templateArchiveText, templateRelationshipPartPath } from "../package";
import {
  responsePictureImageDimensions,
  responsePictureRelationships,
  validateResponsePictureMediaBytes,
} from "../pictures";
import type { SpreadsheetContract, SpreadsheetField } from "./contract";
import { isSpreadsheetPicturePlaceholder } from "./picture-placeholder-detection";
import type { SpreadsheetWorkbook } from "./workbook";
import { spreadsheetXmlChildren, spreadsheetXmlTree } from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

const packages = "http://schemas.openxmlformats.org/package/2006/relationships";
export const marker = (field: SpreadsheetField): string =>
  `folio_picture_${field.id}`;
export const descendants = (
  node: SpreadsheetXmlNode,
  name: string
): SpreadsheetXmlNode[] =>
  node.children.flatMap((child) =>
    typeof child === "string"
      ? []
      : [
          ...(child.name.split(":").at(-1) === name ? [child] : []),
          ...descendants(child, name),
        ]
  );
export const localAttribute = (
  node: SpreadsheetXmlNode,
  name: string
): string | undefined =>
  Object.entries(node.attributes).find(
    ([key]) => key.split(":").at(-1) === name
  )?.[1];
export const relationshipTree = (
  workbook: SpreadsheetWorkbook,
  source: string
): SpreadsheetXmlNode => {
  const rels = templateRelationshipPartPath(source);
  return workbook.archive[rels]
    ? spreadsheetXmlTree(templateArchiveText(workbook.archive, rels))
    : spreadsheetXmlTree(`<Relationships xmlns="${packages}"/>`);
};
export const drawingParts = (workbook: SpreadsheetWorkbook) => {
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  const relationships = responsePictureRelationships(
    workbook.archive,
    workbook.sheetPath
  );
  return spreadsheetXmlChildren(sheet, "drawing").map((node) => {
    const target = relationships.get(localAttribute(node, "id") ?? "");
    if (
      !target ||
      !workbook.archive[target] ||
      !target.startsWith("xl/drawings/")
    ) {
      throw new Error("Invalid spreadsheet drawing relationship");
    }
    return {
      path: target,
      tree: spreadsheetXmlTree(templateArchiveText(workbook.archive, target)),
    };
  });
};

export interface SpreadsheetPicture {
  bytes: Uint8Array;
  width: number;
  height: number;
  columnOffset?: number;
  rowOffset?: number;
}

/** Pictures remain embedded in the workbook, just as DOCX pictures remain in word/media. */
// oxlint-disable-next-line complexity -- Validate each untrusted image relationship, anchor, payload and dimension before copying bytes.
export const readSpreadsheetPictures = (
  workbook: SpreadsheetWorkbook,
  contract: SpreadsheetContract,
  options: { includePlaceholders?: boolean } = {}
): Map<string, SpreadsheetPicture> => {
  const fields = new Map(
    contract.fields
      .filter((field) => field.type === "picture")
      .map((field) => [marker(field), field])
  );
  const pictures = new Map<string, SpreadsheetPicture>();
  const seen = new Set<string>();
  if (fields.size === 0) {
    return pictures;
  }
  for (const part of drawingParts(workbook)) {
    const relationships = responsePictureRelationships(
      workbook.archive,
      part.path
    );
    for (const anchor of part.tree.children) {
      if (typeof anchor === "string") {
        continue;
      }
      const matching = descendants(anchor, "cNvPr").filter((node) =>
        fields.has(node.attributes.name ?? "")
      );
      if (matching.length === 0) {
        continue;
      }
      const field = fields.get(matching[0]?.attributes.name ?? "");
      if (!field || matching.length !== 1 || seen.has(field.id)) {
        throw new Error("Duplicate spreadsheet picture field");
      }
      seen.add(field.id);
      const [from] = spreadsheetXmlChildren(anchor, "from");
      const range = contract.locations[field.anchor];
      const coordinate = (name: string) =>
        Number(
          from && spreadsheetXmlChildren(from, name)[0]?.children.join("")
        );
      if (
        !from ||
        !range ||
        coordinate("row") !== range.firstRow ||
        coordinate("col") !== range.firstColumn
      ) {
        throw new Error(`Picture moved outside its field: ${field.label}`);
      }
      const columnOffset = Number(
        spreadsheetXmlChildren(from, "colOff")[0]?.children.join("") ?? 0
      );
      const rowOffset = Number(
        spreadsheetXmlChildren(from, "rowOff")[0]?.children.join("") ?? 0
      );
      if (
        ![columnOffset, rowOffset].every(
          (value) => Number.isSafeInteger(value) && value >= 0
        )
      ) {
        throw new Error(`Invalid picture position: ${field.label}`);
      }
      const [picture] = spreadsheetXmlChildren(anchor, "pic");
      const blips = picture ? descendants(picture, "blip") : [];
      const media = relationships.get(
        blips[0] ? (localAttribute(blips[0], "embed") ?? "") : ""
      );
      const bytes = media && workbook.archive[media];
      if (!picture || blips.length !== 1 || !bytes) {
        throw new Error(`Missing embedded picture: ${field.label}`);
      }
      const dimensions = responsePictureImageDimensions(bytes);
      validateResponsePictureMediaBytes(
        field.key,
        bytes,
        {
          pictureMaxBytes: 10 * 1024 * 1024,
          pictureMaxHeight: 4096,
          pictureMaxWidth: 4096,
          required: field.required,
          tag: field.key,
          type: "picture",
        },
        dimensions
      );
      const extent = descendants(picture, "ext").find(
        (node) => node.attributes.cx && node.attributes.cy
      );
      const width = Number(
        extent?.attributes.cx ?? (dimensions?.width ?? 0) * 9525
      );
      const height = Number(
        extent?.attributes.cy ?? (dimensions?.height ?? 0) * 9525
      );
      if (
        ![width, height].every(
          (value) =>
            Number.isSafeInteger(value) && value > 0 && value <= 4096 * 9525
        )
      ) {
        throw new Error(`Invalid picture display size: ${field.label}`);
      }
      if (
        options.includePlaceholders ||
        !isSpreadsheetPicturePlaceholder(bytes)
      ) {
        pictures.set(field.id, {
          bytes,
          columnOffset,
          height,
          rowOffset,
          width,
        });
      }
    }
  }
  return pictures;
};
