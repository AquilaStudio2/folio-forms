// oxlint-disable func-style -- Operation modules use function declarations at the pipeline boundaries.
import { isDeepStrictEqual } from "node:util";

import type { Prisma } from "@onlyoffice/db";
import { z } from "zod";

import { contentHash } from "../digests";
import {
  reconcileSpreadsheetColumns,
  spreadsheetBindingAnchors,
  spreadsheetTableColumnsAnchor,
} from "../documents/spreadsheets/columns";
import { spreadsheetBindingSchema } from "../documents/spreadsheets/contract";
import type { SpreadsheetBindings } from "../documents/spreadsheets/contract";
import { savedSpreadsheetUploadPocBindingComplete } from "../documents/spreadsheets/upload-poc";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../documents/spreadsheets/workbook";
import { validateAttachmentStorageMappings } from "../ecm/categories";
import { validateFieldRulePointer } from "../forms/field-rules";
import {
  spreadsheetDraftBindings,
  spreadsheetDraftFieldData,
} from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";
import type { Operation } from "../model-types";
import { readObject } from "../storage";

export const xlsxDraftCandidateSchema = z
  .object({
    bindings: spreadsheetBindingSchema,
    checkpoint: z.uuid(),
    revision: z.number().int().nonnegative(),
    version: z.literal(1),
  })
  .strict();

export type XlsxDraftCandidate = z.infer<typeof xlsxDraftCandidateSchema> & {
  baseObjectKey?: string;
  baseContentHash?: string | null;
  sessionId?: string;
  leaseId?: string;
};

// oxlint-disable-next-line complexity -- Check placement, prefill and attachment transitions before accepting the frozen draft.
export async function validateXlsxDraftCapture(
  candidate: XlsxDraftCandidate,
  previous: SpreadsheetBindings,
  bytes: Uint8Array
): Promise<SpreadsheetBindings> {
  const workbook = readSpreadsheetWorkbook(bytes);
  const bindings = reconcileSpreadsheetColumns(
    candidate.bindings,
    workbook.names
  );
  const roots = [
    ...bindings.fields,
    ...(bindings.table ? [bindings.table] : []),
  ];
  const previousRoots = [
    ...previous.fields,
    ...(previous.table ? [previous.table] : []),
  ];
  const unbound = roots.filter((root) => root.unbound);
  const base = candidate.baseObjectKey
    ? await readObject(candidate.baseObjectKey)
    : null;
  if (
    !base ||
    (candidate.baseContentHash !== null &&
      contentHash(base) !== candidate.baseContentHash)
  ) {
    fail(409, "stale_document", "The saved Excel base could not be verified");
  }
  const rejectedSavedNames = new Set<string>();
  const saved = readSpreadsheetWorkbook(base, rejectedSavedNames);
  for (const root of unbound) {
    const prior = previousRoots.find((entry) => entry.id === root.id);
    const names =
      "columns" in root
        ? spreadsheetBindingAnchors({ ...bindings, fields: [], table: root })
        : [root.anchor];
    if (
      names.some((name) => workbook.names.has(name)) ||
      (prior &&
        (!prior.unbound ||
          saved.names.has(prior.anchor) ||
          rejectedSavedNames.has(prior.anchor)))
    ) {
      fail(
        422,
        "invalid_template",
        "An existing placement cannot be declared unbound"
      );
    }
  }
  const placed = resolveSpreadsheetContract(
    {
      ...bindings,
      fields: bindings.fields.filter((root) => !root.unbound),
      table: bindings.table?.unbound ? null : bindings.table,
    },
    workbook
  );
  if (placed.table?.columns.length) {
    const marker = workbook.names.get(
      spreadsheetTableColumnsAnchor(placed.table.id)
    );
    if (
      !marker ||
      JSON.stringify(marker) !==
        JSON.stringify(placed.locations[placed.table.anchor])
    ) {
      fail(
        422,
        "invalid_template",
        "Confirm every table column placement before saving"
      );
    }
  }
  const retainedNames = new Set(spreadsheetBindingAnchors(bindings));
  for (const name of spreadsheetBindingAnchors(previous)) {
    if (!retainedNames.has(name) && workbook.names.has(name)) {
      fail(
        422,
        "invalid_template",
        "A removed Excel placement is still present"
      );
    }
  }
  const priorFields = [...previous.fields, ...(previous.table?.columns ?? [])];
  const pointers = new Set<string>();
  for (const field of bindings.fields) {
    validateFieldRulePointer(field.prefillPointer);
    if (
      field.prefillPointer
        ? pointers.has(field.prefillPointer)
        : field.prefillPolicy === "lock_when_available"
    ) {
      fail(422, "invalid_field_config", "Invalid or duplicate prefill pointer");
    }
    if (field.prefillPointer) {
      pointers.add(field.prefillPointer);
    }
  }
  for (const field of [
    ...bindings.fields,
    ...(bindings.table?.columns ?? []),
  ]) {
    const prior = priorFields.find((entry) => entry.id === field.id);
    if (field.computed && !prior?.computed) {
      fail(
        422,
        "invalid_field_config",
        "New computed Excel fields are not supported"
      );
    }
    if (prior?.attachment && "anchor" in prior && "offset" in field) {
      const {
        anchor: _anchor,
        prefillPointer: _pointer,
        prefillPolicy: _policy,
        ...savedField
      } = prior;
      if (
        previous.table ||
        !isDeepStrictEqual(field, { ...savedField, offset: field.offset }) ||
        !savedSpreadsheetUploadPocBindingComplete(base, previous, field.id)
      ) {
        fail(
          422,
          "attachment_mapping_unproved",
          "ยืนยันการย้ายช่องแนบเดิมเข้าตารางไม่ได้"
        );
      }
    }
    if (
      field.attachment &&
      prior &&
      !prior.attachment &&
      (!("anchor" in prior
        ? "anchor" in field && prior.anchor === field.anchor
        : "offset" in field &&
          prior.offset === field.offset &&
          previous.table?.id === bindings.table?.id &&
          previous.table?.anchor === bindings.table?.anchor) ||
        !savedSpreadsheetUploadPocBindingComplete(base, previous, field.id))
    ) {
      fail(
        422,
        "attachment_mapping_unproved",
        "ยืนยัน marker, binding, Tag และตำแหน่งปุ่มเดิมไม่ได้ กรุณาบันทึกต้นแบบเดิมให้สำเร็จและแก้ mapping ที่ขัดแย้งก่อนตั้งค่าช่องแนบ"
      );
    }
  }
  return bindings;
}

export async function replaceXlsxDraftBindings(
  tx: Prisma.TransactionClient,
  draftId: string,
  bindings: SpreadsheetBindings
): Promise<void> {
  const previous = await spreadsheetDraftBindings(draftId, tx);
  await validateAttachmentStorageMappings(tx, bindings, previous);
  await tx.draftFieldRule.deleteMany({ where: { templateDraftId: draftId } });
  const fields = spreadsheetDraftFieldData(bindings);
  if (fields.length > 0) {
    await tx.draftFieldRule.createMany({
      data: fields.map((field) => ({ ...field, templateDraftId: draftId })),
    });
  }
}

export async function lockXlsxDraftCommit(
  tx: Prisma.TransactionClient,
  operation: Operation,
  candidate: XlsxDraftCandidate,
  lockForm = true
): Promise<void> {
  if (lockForm) {
    await tx.$queryRaw`SELECT id FROM forms WHERE id = ${operation.formId}::uuid FOR UPDATE`;
  }
  const [lease] = await tx.$queryRaw<{ id: string }[]>`
    SELECT l.id FROM editor_leases l
    JOIN session s ON s.id = l.holder_session_id
    JOIN "user" u ON u.id = l.holder_user_id
    WHERE l.id = ${candidate.leaseId}::uuid
      AND l.target_type = 'template_draft'
      AND l.target_id = ${operation.targetId}::uuid
      AND l.holder_user_id = ${operation.actorId}
      AND l.holder_session_id = ${candidate.sessionId}
      AND l.expires_at > NOW() AND s.expires_at > NOW()
      AND u.enabled AND u.role = 'admin'
    FOR UPDATE OF l
  `;
  const form = await tx.form.findUnique({
    include: { publishedTemplate: true },
    where: { id: operation.formId },
  });
  if (
    !lease ||
    !form ||
    form.status === "published" ||
    form.publishedTemplate
  ) {
    fail(
      409,
      "stale_operation",
      "The Excel authoring lease is no longer current"
    );
  }
}
