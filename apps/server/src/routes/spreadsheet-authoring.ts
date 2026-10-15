import { AuditOutcome, OperationStatus, Prisma, prisma } from "@onlyoffice/db";
import type { Elysia } from "elysia";
import { z } from "zod";

import { createFormAudit } from "../audit/events";
import { spreadsheetBindingSchema } from "../documents/spreadsheets/contract";
import type { SpreadsheetBindings } from "../documents/spreadsheets/contract";
import { lockActiveEditorLease } from "../editor/leases";
import {
  requireFieldRuleContext,
  validateFieldRulePointer,
} from "../forms/field-rules";
import {
  spreadsheetDraftBindings,
  spreadsheetDraftFieldData,
} from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";
import { readJsonRecord } from "../http/input";
import { activeOperationForForm } from "../operations/lifecycle";

const changeSchema = z
  .object({
    change: z
      .object({
        action: z.enum(["upsert", "delete"]),
        id: z.string().optional(),
        kind: z.enum(["field", "table", "column"]),
        value: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
    documentKey: z.string().min(1),
    revision: z.number().int().nonnegative(),
  })
  .strict();

const validateSpreadsheetPrefill = (bindings: SpreadsheetBindings): void => {
  const pointers = new Set<string>();
  for (const field of bindings.fields) {
    validateFieldRulePointer(field.prefillPointer);
    if (
      field.prefillPolicy === "lock_when_available" &&
      !field.prefillPointer
    ) {
      fail(400, "invalid_field_config", "Locked Prefill requires a pointer");
    }
    if (field.prefillPointer) {
      if (pointers.has(field.prefillPointer)) {
        fail(
          409,
          "field_rule_conflict",
          "The schema pointer is already configured"
        );
      }
      pointers.add(field.prefillPointer);
    }
  }
};

const applyTableChange = (
  next: SpreadsheetBindings,
  change: z.infer<typeof changeSchema>["change"]
): void => {
  const { action, id, value } = change;
  if (action === "delete") {
    if (next.table?.id !== id) {
      fail(404, "not_found", "Table binding was not found");
    }
    next.table = null;
  } else {
    if (next.table && next.table.id !== value?.id) {
      fail(409, "field_rule_conflict", "Only one repeating table is supported");
    }
    next.table = {
      ...value,
      columns:
        value && Object.hasOwn(value, "columns")
          ? value.columns
          : (next.table?.columns ?? []),
    } as unknown as NonNullable<SpreadsheetBindings["table"]>;
  }
};

// oxlint-disable-next-line complexity -- Check discriminated binding changes before parsing the complete contract.
export const applySpreadsheetBindingChange = (
  bindings: SpreadsheetBindings,
  change: z.infer<typeof changeSchema>["change"]
): SpreadsheetBindings => {
  const next = structuredClone(bindings);
  const { action, id, kind, value } = change;
  if (action === "upsert" && value?.computed === true) {
    fail(
      400,
      "invalid_field_config",
      "รุ่นนี้รองรับช่องกรอกเองเท่านั้น ยังไม่รองรับช่องสูตร"
    );
  }
  if (
    action === "delete"
      ? !id || value !== undefined
      : !value || id !== undefined
  ) {
    fail(
      400,
      "invalid_field_config",
      "Provide value for upsert or id for delete"
    );
  }
  if (
    kind === "table" &&
    Array.isArray(value?.columns) &&
    value.columns.some(
      (column: unknown) =>
        typeof column === "object" &&
        column !== null &&
        "computed" in column &&
        column.computed === true
    )
  ) {
    fail(400, "invalid_field_config", "รุ่นนี้ยังไม่รองรับคอลัมน์สูตร");
  }
  if (kind === "table") {
    applyTableChange(next, change);
  } else {
    if (kind === "column" && !next.table) {
      fail(400, "invalid_field_config", "Configure the repeating table first");
    }
    const items =
      kind === "field"
        ? next.fields
        : (next.table as NonNullable<SpreadsheetBindings["table"]>).columns;
    const targetId = action === "delete" ? id : value?.id;
    const index = items.findIndex((item) => item.id === targetId);
    if (action === "delete") {
      if (index === -1) {
        fail(404, "not_found", "Field binding was not found");
      }
      items.splice(index, 1);
    } else {
      // The full contract parser below validates the discriminated field shape.
      const candidate = value as unknown as (typeof items)[number];
      if (index === -1) {
        items.push(candidate as never);
      } else {
        items.splice(index, 1, candidate as never);
      }
    }
  }
  const parsed = spreadsheetBindingSchema.safeParse(next);
  if (!parsed.success) {
    fail(
      400,
      "invalid_field_config",
      parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }
  validateSpreadsheetPrefill(parsed.data);
  return parsed.data;
};

export const registerSpreadsheetAuthoringRoutes = (app: Elysia): void => {
  app
    .get(
      "/api/admin/forms/:publicId/spreadsheet-bindings",
      async ({ request, params }) => {
        const { form, templateDraft } = await requireFieldRuleContext(
          request,
          params.publicId
        );
        if (form.documentKind !== "xlsx") {
          fail(409, "invalid_field_config", "This Form is not an Excel Form");
        }
        return {
          bindings: await spreadsheetDraftBindings(templateDraft.id),
          revision: templateDraft.bindingRevision,
        };
      }
    )
    .patch(
      "/api/admin/forms/:publicId/spreadsheet-bindings",
      async ({ request, params }) => {
        const { authorization, capabilityScope, form, templateDraft } =
          await requireFieldRuleContext(request, params.publicId);
        if (form.documentKind !== "xlsx") {
          fail(409, "invalid_field_config", "This Form is not an Excel Form");
        }
        const parsed = changeSchema.safeParse(
          await readJsonRecord(request, 256 * 1024)
        );
        if (!parsed.success) {
          fail(
            400,
            "invalid_field_config",
            "Invalid spreadsheet binding change"
          );
        }
        const input = parsed.data;
        await activeOperationForForm(form.id);
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "forms" WHERE "id" = ${form.id}::uuid FOR UPDATE`
          );
          await lockActiveEditorLease(tx, authorization, capabilityScope);
          const current = await tx.form.findUnique({
            include: { publishedTemplate: true, templateDraft: true },
            where: { id: form.id },
          });
          if (
            !current ||
            current.publishedTemplate ||
            current.status === "published"
          ) {
            fail(
              409,
              "published_immutable",
              "Published forms cannot change bindings"
            );
          }
          const draft = current.templateDraft;
          if (
            !draft ||
            draft.id !== templateDraft.id ||
            draft.documentKey !== input.documentKey ||
            draft.bindingRevision !== input.revision
          ) {
            fail(
              409,
              "stale_document",
              "The spreadsheet configuration changed; reload it before saving"
            );
          }
          const active = await tx.operation.findFirst({
            select: { id: true },
            where: {
              formId: form.id,
              status: {
                in: [OperationStatus.pending, OperationStatus.processing],
              },
            },
          });
          if (active) {
            fail(
              409,
              "operation_in_progress",
              "Wait for the current document operation"
            );
          }
          const bindings = applySpreadsheetBindingChange(
            await spreadsheetDraftBindings(draft.id, tx),
            input.change
          );
          const updated = await tx.templateDraft.updateMany({
            data: {
              bindingRevision: { increment: 1 },
            },
            where: {
              bindingRevision: input.revision,
              documentKey: input.documentKey,
              id: draft.id,
            },
          });
          if (updated.count !== 1) {
            fail(
              409,
              "stale_document",
              "The spreadsheet configuration changed"
            );
          }
          await tx.draftFieldRule.deleteMany({
            where: { templateDraftId: draft.id },
          });
          const fields = spreadsheetDraftFieldData(bindings);
          if (fields.length > 0) {
            await tx.draftFieldRule.createMany({
              data: fields.map((field) => ({
                ...field,
                templateDraftId: draft.id,
              })),
            });
          }
          await tx.form.update({
            data: { updatedAt: new Date() },
            where: { id: form.id },
          });
          await createFormAudit(tx, {
            action: "configure_field_rule",
            actorId: authorization.actor.id,
            outcome: AuditOutcome.success,
            safeMetadata: {},
            targetId: form.publicId,
          });
          return { bindings, revision: input.revision + 1 };
        });
      },
      { parse: "none" }
    );
};
