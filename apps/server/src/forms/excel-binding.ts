import { z } from "zod";

const identity = z.string().regex(/^folio_[A-Za-z0-9_]+$/u);

/** Placement metadata stored in both DraftFieldRule.binding and ManifestField.binding. */
export const excelBindingSchemas = {
  column: z
    .object({
      computed: z.boolean(),
      id: identity,
      offset: z.number().int().min(0).max(16_383),
    })
    .strict(),
  scalar: z
    .object({ anchor: identity, computed: z.boolean(), id: identity })
    .strict(),
  table: z.object({ anchor: identity, id: identity }).strict(),
};

export const excelBindingSchema = z.union([
  excelBindingSchemas.scalar,
  excelBindingSchemas.table,
  excelBindingSchemas.column,
]);

export type ExcelBinding = z.infer<typeof excelBindingSchema>;
export type ExcelScalarBinding = z.infer<typeof excelBindingSchemas.scalar>;
export type ExcelTableBinding = z.infer<typeof excelBindingSchemas.table>;
export type ExcelColumnBinding = z.infer<typeof excelBindingSchemas.column>;
