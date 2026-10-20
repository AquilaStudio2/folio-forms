import { AuditOutcome, OperationStatus, Prisma, prisma } from "@onlyoffice/db";
import type { Elysia } from "elysia";
import { z } from "zod";

import { createFormAudit } from "../audit/events";
import {
  spreadsheetBindingSchema,
  spreadsheetDuplicateTagMessage,
} from "../documents/spreadsheets/contract";
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
    spreadsheetColumnOffsets: z
      .array(
        z.tuple([
          z.string().regex(/^folio_[A-Za-z0-9_]+$/u),
          z.number().int().min(0).max(16_383),
        ])
      )
      .max(16_384)
      .optional(),
  })
  .strict();

const recoverySchema = z
  .object({
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
      fail(400, "invalid_field_config", "กรุณาเลือกข้อมูลเริ่มต้นก่อนล็อกช่อง");
    }
    if (field.prefillPointer) {
      if (pointers.has(field.prefillPointer)) {
        fail(
          409,
          "field_rule_conflict",
          "มีช่องอื่นใช้ข้อมูลเริ่มต้นนี้แล้ว กรุณาเลือกข้อมูลอื่น"
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
      fail(404, "not_found", "ไม่พบตารางเดิม กรุณาเปิดต้นแบบใหม่แล้วลองอีกครั้ง");
    }
    next.table = null;
  } else {
    if (next.table && next.table.id !== value?.id) {
      fail(
        409,
        "field_rule_conflict",
        "มีตารางรายการแล้ว กรุณาแก้ไขตารางเดิมหรือลบตารางเดิมก่อน"
      );
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
  change: z.infer<typeof changeSchema>["change"],
  columnOffsets?: z.infer<typeof changeSchema>["spreadsheetColumnOffsets"]
): SpreadsheetBindings => {
  const next = structuredClone(bindings);
  const { action, id, kind, value } = change;
  if (columnOffsets) {
    const positions = new Map(columnOffsets);
    const current = next.table?.columns;
    if (
      kind !== "column" ||
      action !== "upsert" ||
      !current ||
      positions.size !== columnOffsets.length ||
      positions.size !== current.length ||
      current.some((column) => !positions.has(column.id)) ||
      new Set(positions.values()).size !== positions.size ||
      columnOffsets.some(
        ([, offset]) =>
          !Number.isSafeInteger(offset) || offset < 0 || offset > 16_383
      ) ||
      (typeof value?.id === "string" &&
        positions.has(value.id) &&
        positions.get(value.id) !== value.offset)
    ) {
      fail(
        400,
        "invalid_field_config",
        "ตำแหน่งคอลัมน์ต้องครบทุกรายการ ไม่ซ้ำกัน และตรงกับคอลัมน์ที่แก้ไข กรุณาอ่านการตั้งค่าล่าสุดแล้วลองอีกครั้ง"
      );
    }
    for (const column of current) {
      column.offset = positions.get(column.id) as number;
    }
  }
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
      "คำขอตั้งค่าช่องไม่ถูกต้อง กรุณาเปิดต้นแบบใหม่แล้วลองอีกครั้ง"
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
      fail(400, "invalid_field_config", "กรุณาสร้างตารางรายการก่อนเพิ่มคอลัมน์");
    }
    const items =
      kind === "field"
        ? next.fields
        : (next.table as NonNullable<SpreadsheetBindings["table"]>).columns;
    const targetId = action === "delete" ? id : value?.id;
    const index = items.findIndex((item) => item.id === targetId);
    if (action === "delete") {
      if (index === -1) {
        fail(404, "not_found", "ไม่พบช่องเดิม กรุณาเปิดต้นแบบใหม่แล้วลองอีกครั้ง");
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
    if (
      parsed.error.issues.some(
        (issue) =>
          issue.code === "custom" &&
          issue.params?.folioCode === "duplicate_field_tag"
      )
    ) {
      fail(409, "duplicate_field_tag", spreadsheetDuplicateTagMessage);
    }
    fail(
      400,
      "invalid_field_config",
      "การตั้งค่าช่องไม่ถูกต้อง กรุณาตรวจสอบชื่อช่อง tag ชนิดข้อมูล และตัวเลือก แล้วลองอีกครั้ง"
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
          fail(409, "invalid_field_config", "แบบฟอร์มนี้ไม่รองรับการตั้งค่าช่อง Excel");
        }
        return {
          bindings: await spreadsheetDraftBindings(templateDraft.id),
          documentKey: templateDraft.documentKey,
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
          fail(409, "invalid_field_config", "แบบฟอร์มนี้ไม่รองรับการตั้งค่าช่อง Excel");
        }
        const parsed = changeSchema.safeParse(
          await readJsonRecord(request, 256 * 1024)
        );
        if (!parsed.success) {
          fail(
            400,
            "invalid_field_config",
            "คำขอตั้งค่าช่องไม่ถูกต้อง กรุณาเปิดต้นแบบใหม่แล้วลองอีกครั้ง"
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
              "แบบฟอร์มที่เผยแพร่แล้วแก้ไขช่องไม่ได้ กรุณาทำสำเนาแบบฟอร์มก่อนแก้ไข"
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
              "การตั้งค่าช่องเปลี่ยนไปแล้ว กรุณาเปิดต้นแบบใหม่ก่อนบันทึก"
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
              "กำลังบันทึกเอกสาร กรุณารอให้เสร็จแล้วลองอีกครั้ง"
            );
          }
          const bindings = applySpreadsheetBindingChange(
            await spreadsheetDraftBindings(draft.id, tx),
            input.change,
            input.spreadsheetColumnOffsets
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
              "การตั้งค่าช่องเปลี่ยนไปแล้ว กรุณาเปิดต้นแบบใหม่ก่อนบันทึก"
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
          return {
            bindings,
            documentKey: draft.documentKey,
            revision: input.revision + 1,
          };
        });
      },
      { parse: "none" }
    );

  app.post(
    "/api/admin/forms/:publicId/spreadsheet-bindings/recover",
    async ({ request, params }) => {
      const { authorization, capabilityScope, form, templateDraft } =
        await requireFieldRuleContext(request, params.publicId);
      if (form.documentKind !== "xlsx") {
        fail(409, "invalid_field_config", "แบบฟอร์มนี้ไม่รองรับการตั้งค่าช่อง Excel");
      }
      const parsed = recoverySchema.safeParse(
        await readJsonRecord(request, 8 * 1024)
      );
      if (!parsed.success) {
        fail(
          400,
          "invalid_field_config",
          "คำขอยืนยันการตั้งค่าช่องไม่ถูกต้อง กรุณาลองอีกครั้ง"
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
            "แบบฟอร์มที่เผยแพร่แล้วแก้ไขช่องไม่ได้ กรุณาทำสำเนาแบบฟอร์มก่อนแก้ไข"
          );
        }
        const draft = current.templateDraft;
        if (
          !draft ||
          draft.id !== templateDraft.id ||
          draft.documentKey !== input.documentKey ||
          draft.bindingRevision < input.revision
        ) {
          fail(
            409,
            "stale_document",
            "ต้นแบบหรือการตั้งค่าช่องเปลี่ยนไปแล้ว กรุณาตรวจสอบต้นแบบล่าสุดก่อนดำเนินการต่อ"
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
            "กำลังบันทึกเอกสาร กรุณารอให้เสร็จแล้วลองอีกครั้ง"
          );
        }
        let revision = draft.bindingRevision;
        if (revision === input.revision) {
          // An ordinary GET can see the old metadata while a disconnected
          // PATCH is still queued. Advancing its revision under the same lock
          // makes that old PATCH unable to commit after this confirmation.
          const updated = await tx.templateDraft.updateMany({
            data: { bindingRevision: { increment: 1 } },
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
              "การตั้งค่าช่องเปลี่ยนระหว่างยืนยัน กรุณาลองอีกครั้ง"
            );
          }
          revision += 1;
        }
        return {
          bindings: await spreadsheetDraftBindings(draft.id, tx),
          documentKey: draft.documentKey,
          recovery: { baseRevision: input.revision, settled: true },
          revision,
        };
      });
    },
    { parse: "none" }
  );
};
