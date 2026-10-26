import { z } from "zod";

import { fail } from "../../http/errors";
import { templateArchiveText } from "../package";
import type { SpreadsheetBindings } from "./contract";
import { parseSpreadsheetRange } from "./contract";
import {
  savedSpreadsheetUploadPocBindingComplete,
  savedSpreadsheetUploadPocButtons,
  spreadsheetUploadPocTargets,
} from "./upload-poc";
import { uploadPocGuid } from "./upload-poc-preview";
import { readSpreadsheetWorkbook } from "./workbook";
import { spreadsheetXmlTree } from "./xml";
import type { SpreadsheetXmlNode } from "./xml";

const bindingId = z
  .string()
  .max(255)
  .regex(/^folio_[A-Za-z0-9_]+$/u);
const checkpoint = z
  .string()
  .regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu)
  .transform((value) => value.toLowerCase());
const slot = z
  .object({
    bindingId,
    rowIndex: z.number().int().min(0).max(1_048_575).nullable(),
    tag: z
      .string()
      .max(200)
      .regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/u),
  })
  .strict();
const manifest = z
  .array(slot)
  .max(4096)
  .refine(
    (slots) =>
      new Set(
        slots.map((entry) => JSON.stringify([entry.bindingId, entry.rowIndex]))
      ).size === slots.length
  );
const deletedIds = z
  .array(bindingId)
  .min(1)
  .max(4096)
  .refine((ids) => new Set(ids).size === ids.length);
export const spreadsheetEditorSaveOptionKeys = [
  "preserveEditorSession",
  "preserveEditorSessionPurpose",
  "uploadPocBindingId",
  "spreadsheetSaveCheckpoint",
  "spreadsheetUploadPocSnapshot",
  "deletedUploadPocBindingIds",
] as const;
const placement = z
  .object({
    preserveEditorSession: z.literal(true),
    preserveEditorSessionPurpose: z.literal("placement").optional(),
    uploadPocBindingId: bindingId,
  })
  .strict();
const manual = z
  .object({
    preserveEditorSession: z.literal(true),
    preserveEditorSessionPurpose: z.literal("manual"),
    spreadsheetSaveCheckpoint: checkpoint,
    spreadsheetUploadPocSnapshot: manifest,
  })
  .strict();
const deletion = z
  .object({
    deletedUploadPocBindingIds: deletedIds,
    preserveEditorSession: z.literal(true),
    preserveEditorSessionPurpose: z.literal("delete"),
    spreadsheetSaveCheckpoint: checkpoint,
    spreadsheetUploadPocSnapshot: manifest,
  })
  .strict();
export const spreadsheetEditorSaveOptionsSchema = z.union([
  placement,
  manual,
  deletion,
]);
export type SpreadsheetEditorSaveOptions = z.infer<
  typeof spreadsheetEditorSaveOptionsSchema
>;
export const spreadsheetEditorSaveOptions = (
  value: Record<string, unknown>
): SpreadsheetEditorSaveOptions | undefined => {
  const options = Object.fromEntries(
    spreadsheetEditorSaveOptionKeys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]])
  );
  return Object.keys(options).length
    ? spreadsheetEditorSaveOptionsSchema.parse(options)
    : undefined;
};
const nodes = (
  node: SpreadsheetXmlNode,
  name: string
): SpreadsheetXmlNode[] => [
  ...(node.name.split(":").at(-1) === name ? [node] : []),
  ...node.children.flatMap((child) =>
    typeof child === "string" ? [] : nodes(child, name)
  ),
];
const invalid = (): never =>
  fail(
    422,
    "invalid_template",
    "ไฟล์ Excel ที่บันทึกยังไม่ตรงกับจุดตรวจสอบและปุ่มล่าสุด กรุณาเก็บหน้านี้ไว้แล้วลองบันทึกอีกครั้ง"
  );
export const spreadsheetEditorSaveCheckpointPrefix =
  "_folio_editor_save_checkpoint_";

const key = (entry: {
  bindingId: string;
  tag: string;
  rowIndex: number | null;
}) => JSON.stringify([entry.bindingId, entry.tag, entry.rowIndex]);

/** Frozen-workbook freshness and exact drawing consistency, before any package cleanup. */
// oxlint-disable-next-line complexity -- Every nonce, marker, native slot and deletion assertion fails closed.
export const validatePreservedSpreadsheetEditorSave = (
  bytes: Uint8Array,
  bindings: SpreadsheetBindings,
  input: Record<string, unknown>
): void => {
  let options: SpreadsheetEditorSaveOptions | undefined;
  try {
    options = spreadsheetEditorSaveOptions(input);
  } catch {
    return invalid();
  }
  if (!options) {
    return;
  }
  if ("uploadPocBindingId" in options) {
    if (
      !savedSpreadsheetUploadPocBindingComplete(
        bytes,
        bindings,
        options.uploadPocBindingId
      )
    ) {
      invalid();
    }
    return;
  }
  const workbook = readSpreadsheetWorkbook(bytes);
  const book = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, "xl/workbook.xml")
  );
  const names = nodes(book, "definedName");
  const checkpoints = names.filter((name) =>
    name.attributes.name?.startsWith(spreadsheetEditorSaveCheckpointPrefix)
  );
  const expectedName =
    spreadsheetEditorSaveCheckpointPrefix +
    options.spreadsheetSaveCheckpoint.replaceAll("-", "").toLowerCase();
  const [current] = checkpoints;
  if (!current) {
    return invalid();
  }
  if (
    checkpoints.length !== 1 ||
    current?.attributes.name !== expectedName ||
    current.attributes.hidden !== "1" ||
    current.attributes.localSheetId !== "0"
  ) {
    invalid();
  }
  let range;
  try {
    range = parseSpreadsheetRange(
      current.children.filter((child) => typeof child === "string").join("")
    );
  } catch {
    return invalid();
  }
  if (
    range.sheet !== workbook.sheet ||
    range.firstColumn !== 0 ||
    range.lastColumn !== 0 ||
    range.firstRow !== 0 ||
    range.lastRow !== 0
  ) {
    invalid();
  }
  const sheet = spreadsheetXmlTree(
    templateArchiveText(workbook.archive, workbook.sheetPath)
  );
  const objects = nodes(sheet, "oleObject").filter(
    (object) => object.attributes.progId === uploadPocGuid
  );
  const anchored = objects.filter(
    (object) => nodes(object, "objectPr").length > 0
  );
  const slots = savedSpreadsheetUploadPocButtons(bytes, bindings);
  if (
    new Set(objects.map((object) => object.attributes.shapeId)).size !==
      anchored.length ||
    slots.length !== anchored.length
  ) {
    invalid();
  }
  for (const target of spreadsheetUploadPocTargets(bytes, bindings)) {
    if (
      !savedSpreadsheetUploadPocBindingComplete(
        bytes,
        bindings,
        target.bindingId
      )
    ) {
      invalid();
    }
  }

  if (
    JSON.stringify(slots.map(key).toSorted()) !==
    JSON.stringify(options.spreadsheetUploadPocSnapshot.map(key).toSorted())
  ) {
    invalid();
  }
  if (options.preserveEditorSessionPurpose === "delete") {
    const active = new Set([
      ...bindings.fields.map((field) => field.id),
      ...(bindings.table
        ? [
            bindings.table.id,
            ...bindings.table.columns.map((column) => column.id),
          ]
        : []),
    ]);
    for (const id of options.deletedUploadPocBindingIds) {
      if (
        active.has(id) ||
        slots.some((entry) => entry.bindingId === id) ||
        names.some((name) =>
          [
            id,
            `folio_column_${id}`,
            `folio_columns_${id}`,
            `_folio_upload_poc_${id}`,
          ].includes(name.attributes.name ?? "")
        )
      ) {
        invalid();
      }
    }
  }
};
