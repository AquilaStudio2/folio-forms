import { z } from "zod";

const keySchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
  .refine(
    (value) => !["__proto__", "constructor", "prototype"].includes(value),
    "Reserved field key"
  );
const fieldSchema = z
  .object({
    computed: z.boolean().default(false),
    id: z.string().regex(/^folio_[A-Za-z0-9_]+$/u),
    key: keySchema,
    label: z.string().trim().min(1).max(200),
    options: z.array(z.string().min(1)).default([]),
    required: z.boolean().default(false),
    type: z.enum(["text", "number", "date", "dropdown", "boolean"]),
  })
  .strict();

export const spreadsheetBindingSchema = z
  .object({
    fields: z.array(
      fieldSchema
        .extend({
          anchor: z.string().regex(/^folio_[A-Za-z0-9_]+$/u),
          prefillPointer: z.string().nullable().default(null),
          prefillPolicy: z
            .enum(["editable", "lock_when_available"])
            .default("editable"),
        })
        .strict()
    ),
    table: z
      .object({
        anchor: z.string().regex(/^folio_[A-Za-z0-9_]+$/u),
        columns: z.array(
          fieldSchema
            .extend({
              offset: z.number().int().min(0).max(16_383),
            })
            .strict()
        ),
        id: z.string().regex(/^folio_[A-Za-z0-9_]+$/u),
        key: keySchema,
        label: z.string().trim().min(1).max(200),
      })
      .strict()
      .nullable(),
    version: z.literal(1),
  })
  .strict()
  .superRefine((bindings, context) => {
    const rootKeys = bindings.fields.map((field) => field.key);
    if (bindings.table) {
      rootKeys.push(bindings.table.key);
    }
    const identities = bindings.fields.map((field) => field.id);
    const anchors = bindings.fields.map((field) => field.anchor);
    if (bindings.table) {
      identities.push(
        bindings.table.id,
        ...bindings.table.columns.map((column) => column.id)
      );
      anchors.push(bindings.table.anchor);
    }
    const sets = [
      rootKeys,
      identities,
      anchors,
      bindings.table?.columns.map((column) => column.key) ?? [],
      bindings.table?.columns.map((column) => String(column.offset)) ?? [],
    ];
    if (sets.some((values) => new Set(values).size !== values.length)) {
      context.addIssue({
        code: "custom",
        message: "Duplicate key, identity, anchor, or column",
      });
    }
    for (const field of [
      ...bindings.fields,
      ...(bindings.table?.columns ?? []),
    ]) {
      if (field.type === "dropdown" && field.options.length === 0) {
        context.addIssue({
          code: "custom",
          message: `Dropdown options are required: ${field.key}`,
        });
      }
      if (
        field.computed &&
        "prefillPointer" in field &&
        field.prefillPointer !== null
      ) {
        context.addIssue({
          code: "custom",
          message: "Computed fields cannot use Prefill",
        });
      }
    }
  });

export type SpreadsheetBindings = z.infer<typeof spreadsheetBindingSchema>;
export type SpreadsheetField = SpreadsheetBindings["fields"][number];
export type SpreadsheetColumn = NonNullable<
  SpreadsheetBindings["table"]
>["columns"][number];
export interface SpreadsheetRange {
  sheet: string;
  firstRow: number;
  lastRow: number;
  firstColumn: number;
  lastColumn: number;
}
export interface SpreadsheetContract extends SpreadsheetBindings {
  locations: Record<string, SpreadsheetRange>;
}
export const emptySpreadsheetBindings = (): SpreadsheetBindings => ({
  fields: [],
  table: null,
  version: 1,
});

export const spreadsheetColumnName = (column: number): string => {
  if (!Number.isSafeInteger(column) || column < 0 || column >= 16_384) {
    throw new Error("Invalid XLSX column");
  }
  let name = "";
  for (
    let value = column + 1;
    value > 0;
    value = Math.floor((value - 1) / 26)
  ) {
    name = String.fromCodePoint(65 + ((value - 1) % 26)) + name;
  }
  return name;
};

export const spreadsheetCellPosition = (
  address: string
): { row: number; column: number } => {
  const match = /^\$?(?<column>[A-Z]+)\$?(?<row>[1-9]\d*)$/iu.exec(address);
  if (!match) {
    throw new Error(`Invalid cell address: ${address}`);
  }
  let column = 0;
  for (const character of (match[1] ?? "").toUpperCase()) {
    column = column * 26 + (character.codePointAt(0) ?? 0) - 64;
  }
  const row = Number(match[2]);
  if (!Number.isSafeInteger(row) || row > 1_048_576 || column > 16_384) {
    throw new Error("Cell exceeds XLSX format bounds");
  }
  return { column: column - 1, row: row - 1 };
};

export const parseSpreadsheetRange = (reference: string): SpreadsheetRange => {
  const match =
    /^(?:'(?<quotedSheet>(?:[^']|'')+)'|(?<sheet>[^'!]+))!(?<range>[^!]+)$/u.exec(
      reference
    );
  if (!match) {
    throw new Error(`Invalid named range: ${reference}`);
  }
  const sheet = (match[1]?.replaceAll("''", "'") ?? match[2]) as string;
  const addresses = (match[3] ?? "").split(":");
  if (addresses.length > 2) {
    throw new Error("A field must reference one rectangular range");
  }
  const first = spreadsheetCellPosition(addresses[0] ?? "");
  const last = spreadsheetCellPosition(addresses[1] ?? addresses[0] ?? "");
  if (last.row < first.row || last.column < first.column) {
    throw new Error("Invalid range order");
  }
  return {
    firstColumn: first.column,
    firstRow: first.row,
    lastColumn: last.column,
    lastRow: last.row,
    sheet,
  };
};

export const spreadsheetRangesOverlap = (
  a: SpreadsheetRange,
  b: SpreadsheetRange
): boolean =>
  a.sheet === b.sheet &&
  a.firstRow <= b.lastRow &&
  a.lastRow >= b.firstRow &&
  a.firstColumn <= b.lastColumn &&
  a.lastColumn >= b.firstColumn;
