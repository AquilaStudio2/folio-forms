import { FieldType, prisma, Prisma } from "@onlyoffice/db";
import { z } from "zod";

import type { ParsedTemplateField } from "../documents/fields";
import { spreadsheetBindingSchema } from "../documents/spreadsheets/contract";
import type {
  SpreadsheetBindings,
  SpreadsheetContract,
} from "../documents/spreadsheets/contract";
import { readSpreadsheetPictures } from "../documents/spreadsheets/pictures";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../documents/spreadsheets/workbook";
import type { SpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
import { fail } from "../http/errors";
import { readObject } from "../storage";
import { excelBindingSchema, excelBindingSchemas } from "./excel-binding";
import type {
  ExcelColumnBinding,
  ExcelScalarBinding,
  ExcelTableBinding,
} from "./excel-binding";

export const storedSpreadsheetBindings = (
  value: unknown
): SpreadsheetBindings => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Spreadsheet bindings are unavailable");
  }
  const { locations: _locations, ...bindings } = value as Record<
    string,
    unknown
  >;
  return spreadsheetBindingSchema.parse(bindings);
};

export const validateSpreadsheetPublication = (
  bindings: SpreadsheetBindings
): void => {
  if (
    bindings.fields.some((field) => field.unbound) ||
    bindings.table?.unbound
  ) {
    fail(422, "invalid_template", "กรุณาผูกตำแหน่งช่อง Excel ให้ครบก่อนเผยแพร่");
  }
  const attachments = [
    ...bindings.fields,
    ...(bindings.table?.columns ?? []),
  ].filter((field) => field.attachment);
  const missingCategories = attachments.filter(
    (field) =>
      field.attachment?.mode !== "template" ||
      field.attachment.document_category_id === null ||
      !field.attachment.storage_template_id ||
      !field.attachment.template_name
  );
  const missingMetadata = attachments.length
    ? ["docs_number"].filter(
        (key) =>
          bindings.fields.filter(
            (field) => field.key === key && !field.attachment && !field.computed
          ).length !== 1
      )
    : [];
  if (missingCategories.length || missingMetadata.length) {
    const problems: string[] = [];
    if (missingCategories.length) {
      problems.push(
        `ยังไม่ได้เลือกแม่แบบจัดเก็บเอกสารให้ช่อง ${missingCategories.map((field) => `${field.label} (Tag: ${field.key})`).join(", ")}`
      );
    }
    if (missingMetadata.length) {
      problems.push(
        `ยังไม่มีช่องกรอกเดี่ยวที่ใช้ได้สำหรับ Tag ${missingMetadata.join(" และ ")}`
      );
    }
    fail(
      422,
      missingCategories.length
        ? "attachment_category_required"
        : "attachment_metadata_required",
      `ไม่สามารถเผยแพร่ได้ เนื่องจาก${problems.join(" และ")}`
    );
  }
  if (bindings.fields.length === 0 && !bindings.table) {
    fail(
      422,
      "invalid_template",
      "เพิ่มช่องกรอกหรือตารางอย่างน้อยหนึ่งรายการก่อนเผยแพร่"
    );
  }
  if (
    bindings.table &&
    !bindings.table.columns.some((column) => !column.computed)
  ) {
    fail(
      422,
      "invalid_template",
      "ตั้งค่าคอลัมน์ที่กรอกได้อย่างน้อยหนึ่งคอลัมน์ในตารางก่อนเผยแพร่"
    );
  }
};

interface SpreadsheetStoredField {
  binding: unknown;
  attachment?: boolean;
  attachmentCategory?: string | null;
  attachmentStorageMode?: string;
  attachmentCategoryId?: number | null;
  attachmentTemplateId?: string | null;
  attachmentTemplateName?: string | null;
  label: string | null;
  options: unknown;
  position: number | null;
  prefillPointer?: string | null;
  prefillPolicy: string;
  required: boolean;
  source?: string | null;
  tag: string;
  type: FieldType | null;
}
interface SpreadsheetStoredPrefill {
  pointer: string;
  policy: string;
  tag: string;
}
const storedOptions = z.array(
  z.object({ displayText: z.string(), value: z.string() }).strict()
);

const spreadsheetFieldType = (type: FieldType | null): string => {
  if (type === FieldType.checkbox) {
    return "boolean";
  }
  if (
    type === FieldType.text ||
    type === FieldType.number ||
    type === FieldType.date ||
    type === FieldType.dropdown ||
    type === FieldType.picture
  ) {
    return type;
  }
  throw new Error("Unsupported spreadsheet field type");
};

/** Rebuild the existing editor contract from shared field rows without reading a document. */
// oxlint-disable-next-line complexity -- Validate each distinct scalar, table and column storage shape.
export const spreadsheetBindingsFromFields = (
  rows: readonly SpreadsheetStoredField[],
  prefillFields: readonly SpreadsheetStoredPrefill[] = []
): SpreadsheetBindings => {
  if (
    rows.some(
      (row) =>
        !Number.isSafeInteger(row.position) ||
        (row.position as number) < 0 ||
        row.binding === null ||
        row.label === null ||
        row.type === null
    )
  ) {
    throw new Error("Incomplete spreadsheet field metadata");
  }
  if (new Set(rows.map((row) => row.position)).size !== rows.length) {
    throw new Error("Duplicate spreadsheet field position");
  }
  const ordered = rows.toSorted(
    (left, right) => (left.position ?? 0) - (right.position ?? 0)
  );
  const tableRow = ordered.find((row) => row.type === FieldType.table);
  if (ordered.filter((row) => row.type === FieldType.table).length > 1) {
    throw new Error("Only one spreadsheet table is supported");
  }
  const fields: Record<string, unknown>[] = [];
  const columns: Record<string, unknown>[] = [];
  for (const row of ordered) {
    if (row.type === FieldType.table) {
      if (
        row.tag.includes(".") ||
        row.options !== null ||
        row.required ||
        row.prefillPointer ||
        row.prefillPolicy !== "editable"
      ) {
        throw new Error("Invalid spreadsheet table field");
      }
      continue;
    }
    const base = {
      ...(row.attachment
        ? {
            attachment:
              row.attachmentStorageMode === "template"
                ? {
                    category: null,
                    document_category_id: row.attachmentCategoryId ?? null,
                    mode: "template",
                    storage_template_id: row.attachmentTemplateId ?? null,
                    template_name: row.attachmentTemplateName ?? null,
                  }
                : { category: row.attachmentCategory ?? null, mode: "legacy" },
          }
        : {}),
      key: row.tag,
      label: row.label,
      options:
        row.type === FieldType.dropdown
          ? storedOptions.parse(row.options).map((option) => option.value)
          : [],
      required: row.required,
      ...(row.source ? { source: row.source } : {}),
      type: spreadsheetFieldType(row.type),
    };
    if (row.type !== FieldType.dropdown && row.options !== null) {
      throw new Error("Unexpected spreadsheet field options");
    }
    if (row.tag.includes(".")) {
      const [parent, key, extra] = row.tag.split(".");
      if (
        !tableRow ||
        parent !== tableRow.tag ||
        !key ||
        extra !== undefined ||
        row.prefillPointer ||
        row.prefillPolicy !== "editable"
      ) {
        throw new Error("Invalid spreadsheet table column");
      }
      columns.push({
        ...base,
        ...excelBindingSchemas.column.parse(row.binding),
        key,
      });
    } else {
      const prefill = prefillFields.find((item) => item.tag === row.tag);
      fields.push({
        ...base,
        ...excelBindingSchemas.scalar.parse(row.binding),
        prefillPointer: prefill?.pointer ?? row.prefillPointer ?? null,
        prefillPolicy: prefill?.policy ?? row.prefillPolicy,
      });
    }
  }
  return spreadsheetBindingSchema.parse({
    fields,
    table: tableRow
      ? {
          ...excelBindingSchemas.table.parse(tableRow.binding),
          columns,
          key: tableRow.tag,
          label: tableRow.label,
        }
      : null,
    version: 1,
  });
};

const sharedType = (type: string): FieldType =>
  type === "boolean" ? FieldType.checkbox : (type as FieldType);
const attachmentStorageData = (
  attachment: SpreadsheetBindings["fields"][number]["attachment"]
) => ({
  attachment: Boolean(attachment),
  attachmentCategory: attachment?.category ?? null,
  attachmentCategoryId:
    attachment?.mode === "template" ? attachment.document_category_id : null,
  attachmentStorageMode: attachment?.mode ?? "legacy",
  attachmentTemplateId:
    attachment?.mode === "template" ? attachment.storage_template_id : null,
  attachmentTemplateName:
    attachment?.mode === "template" ? attachment.template_name : null,
});
const sharedSpreadsheetRows = (input: SpreadsheetBindings) => {
  const bindings = spreadsheetBindingSchema.parse(input);
  if (
    [...bindings.fields, ...(bindings.table?.columns ?? [])].some(
      (field) => field.type !== "dropdown" && field.options.length > 0
    )
  ) {
    throw new Error("Options are only supported for spreadsheet dropdowns");
  }
  const rows = bindings.fields.map((field) => ({
    ...attachmentStorageData(field.attachment),
    binding: excelBindingSchema.parse({
      anchor: field.anchor,
      computed: field.computed,
      id: field.id,
      placeholder: field.placeholder,
      ...(field.unbound ? { unbound: true } : {}),
    } satisfies ExcelScalarBinding),
    label: field.label,
    options:
      field.type === "dropdown"
        ? field.options.map((value) => ({ displayText: value, value }))
        : Prisma.DbNull,
    prefillPointer: field.prefillPointer,
    prefillPolicy: field.prefillPolicy,
    required: field.required,
    source: field.source ?? null,
    tag: field.key,
    type: sharedType(field.type),
  }));
  if (bindings.table) {
    rows.push({
      attachment: false,
      attachmentCategory: null,
      attachmentCategoryId: null,
      attachmentStorageMode: "legacy",
      attachmentTemplateId: null,
      attachmentTemplateName: null,
      binding: excelBindingSchema.parse({
        anchor: bindings.table.anchor,
        id: bindings.table.id,
        ...(bindings.table.unbound ? { unbound: true } : {}),
      } satisfies ExcelTableBinding),
      label: bindings.table.label,
      options: Prisma.DbNull,
      prefillPointer: null,
      prefillPolicy: "editable",
      required: false,
      source: null,
      tag: bindings.table.key,
      type: FieldType.table,
    });
    for (const column of bindings.table.columns) {
      rows.push({
        ...attachmentStorageData(column.attachment),
        binding: excelBindingSchema.parse({
          computed: column.computed,
          id: column.id,
          offset: column.offset,
          placeholder: column.placeholder,
        } satisfies ExcelColumnBinding),
        label: column.label,
        options:
          column.type === "dropdown"
            ? column.options.map((value) => ({ displayText: value, value }))
            : Prisma.DbNull,
        prefillPointer: null,
        prefillPolicy: "editable",
        required: column.required,
        source: column.source ?? null,
        tag: `${bindings.table.key}.${column.key}`,
        type: sharedType(column.type),
      });
    }
  }
  return rows.map(({ source, ...row }, position) => ({
    ...row,
    position,
    ...(source ? { source } : {}),
  }));
};

export const spreadsheetDraftFieldData = (bindings: SpreadsheetBindings) =>
  sharedSpreadsheetRows(bindings);
export const spreadsheetManifestFieldData = (bindings: SpreadsheetBindings) =>
  sharedSpreadsheetRows(bindings).map(
    ({ prefillPointer: _pointer, ...row }) => ({
      ...row,
      pictureMaxBytes: row.type === FieldType.picture ? 10 * 1024 * 1024 : null,
      pictureMaxHeight: row.type === FieldType.picture ? 4096 : null,
      pictureMaxWidth: row.type === FieldType.picture ? 4096 : null,
      placeholder: null,
    })
  );

type SpreadsheetFieldClient = Pick<
  Prisma.TransactionClient,
  "draftFieldRule" | "fieldManifest" | "publishedTemplate"
>;
export const spreadsheetDraftBindings = async (
  templateDraftId: string,
  client: Pick<SpreadsheetFieldClient, "draftFieldRule"> = prisma
): Promise<SpreadsheetBindings> =>
  spreadsheetBindingsFromFields(
    await client.draftFieldRule.findMany({
      orderBy: { position: "asc" },
      where: { templateDraftId },
    })
  );

export const spreadsheetBindingsForTemplate = async (
  publishedTemplateId: string,
  client: Pick<
    SpreadsheetFieldClient,
    "fieldManifest" | "publishedTemplate"
  > = prisma
): Promise<SpreadsheetBindings> => {
  const manifest = await client.fieldManifest.findUnique({
    include: {
      fields: { orderBy: { position: "asc" } },
      publishedTemplate: {
        include: { prefillConfiguration: { include: { fields: true } } },
      },
    },
    where: { publishedTemplateId },
  });
  if (!manifest) {
    throw new Error("Spreadsheet fields are unavailable");
  }
  return spreadsheetBindingsFromFields(
    manifest.fields,
    manifest.publishedTemplate.prefillConfiguration?.fields
  );
};

export const spreadsheetContractForTemplate = async (
  publishedTemplateId: string,
  workbook?: SpreadsheetWorkbook
): Promise<SpreadsheetContract> => {
  const bindings = await spreadsheetBindingsForTemplate(publishedTemplateId);
  let savedWorkbook = workbook;
  if (!savedWorkbook) {
    const template = await prisma.publishedTemplate.findUnique({
      select: { objectKey: true },
      where: { id: publishedTemplateId },
    });
    if (!template) {
      throw new Error("Spreadsheet template is unavailable");
    }
    savedWorkbook = readSpreadsheetWorkbook(
      await readObject(template.objectKey)
    );
  }
  return resolveSpreadsheetContract(bindings, savedWorkbook);
};

export const spreadsheetScalarManifestFields = (
  bindings: SpreadsheetBindings
): ParsedTemplateField[] =>
  bindings.fields.map((field) => ({
    label: field.label,
    options:
      field.type === "dropdown"
        ? field.options.map((option) => ({
            displayText: option,
            value: option,
          }))
        : null,
    pictureMaxBytes: field.type === "picture" ? 10 * 1024 * 1024 : null,
    pictureMaxHeight: field.type === "picture" ? 4096 : null,
    pictureMaxWidth: field.type === "picture" ? 4096 : null,
    placeholder: null,
    tag: field.key,
    type: sharedType(field.type),
  }));

export const spreadsheetPicturePresence = (
  bytes: Uint8Array,
  fields: readonly SpreadsheetStoredField[]
): Record<string, boolean> => {
  const workbook = readSpreadsheetWorkbook(bytes);
  const contract = resolveSpreadsheetContract(
    spreadsheetBindingsFromFields(fields),
    workbook
  );
  const pictures = readSpreadsheetPictures(workbook, contract);
  return Object.fromEntries(
    contract.fields
      .filter((field) => field.type === "picture")
      .map((field) => [field.key, pictures.has(field.id)])
  );
};
