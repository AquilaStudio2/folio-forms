import { prisma } from "@onlyoffice/db";
import { z } from "zod";

import { spreadsheetColumnName } from "../documents/spreadsheets/contract";
import type { SpreadsheetContract } from "../documents/spreadsheets/contract";
import { fail } from "../http/errors";
import type { OperationMetadata } from "../operations/model";

export const pdmsSelectionRowSchema = z
  .object({ documentKey: z.string().min(1), index: z.number().int().min(0) })
  .strict();

export const pdmsSelectionSchema = z
  .object({
    actorId: z.string().min(1),
    bindingId: z.string().regex(/^folio_[A-Za-z0-9_]+$/u),
    documentKey: z.string().min(1),
    leaseId: z.uuid(),
    name: z.string().min(1),
    row: pdmsSelectionRowSchema.optional(),
    sessionId: z.uuid(),
  })
  .strict();

/** A physical row is meaningful only within this saved document revision. */
export const resolvePdmsSelectionTarget = (
  contract: SpreadsheetContract,
  selection: {
    bindingId: string;
    row?: z.infer<typeof pdmsSelectionRowSchema>;
  },
  documentKey: string
) => {
  const field = contract.fields.find(
    (candidate) => candidate.id === selection.bindingId
  );
  if (field) {
    if (selection.row || field.source !== "pdms-project-name") {
      fail(422, "invalid_pdms_selection", "เลือกช่องโครงการที่ถูกต้อง");
    }
    const range = contract.locations[field.anchor];
    if (!range) {
      fail(422, "invalid_pdms_selection", "ไม่พบตำแหน่งช่องโครงการ");
    }
    return { column: range.firstColumn, row: range.firstRow };
  }
  const { table } = contract;
  const column = table?.columns.find(
    (candidate) => candidate.id === selection.bindingId
  );
  if (
    !table ||
    !column ||
    column.source !== "pdms-project-name" ||
    !selection.row
  ) {
    fail(422, "invalid_pdms_selection", "เลือกช่องและแถวโครงการที่ถูกต้อง");
  }
  if (selection.row.documentKey !== documentKey) {
    fail(409, "pdms_selection_stale", "แถวเปลี่ยนหลังการเลือก กรุณาเลือกโครงการใหม่");
  }
  const body = contract.locations[table.anchor];
  if (!body || selection.row.index > body.lastRow - body.firstRow) {
    fail(422, "invalid_pdms_selection", "ไม่พบแถวโครงการที่เลือก");
  }
  return {
    column: body.firstColumn + column.offset,
    row: body.firstRow + selection.row.index,
  };
};

/** Resolve a picker target exclusively from the frozen, trusted operation and saved contract. */
export const pdmsSelectionValue = async (
  metadata: OperationMetadata,
  contract: SpreadsheetContract,
  response: { id: string; draftDocumentKey: string | null }
) => {
  if (!metadata.pdmsSelection) {
    return null;
  }
  const selection = pdmsSelectionSchema.parse(metadata.pdmsSelection);
  const session = await prisma.pdmsProjectCatalogSession.findUnique({
    where: { id: selection.sessionId },
  });
  if (
    !session ||
    session.status !== "ready" ||
    session.documentKey !== selection.documentKey ||
    response.draftDocumentKey !== selection.documentKey ||
    session.formId !== metadata.formId ||
    session.targetType !== "response" ||
    session.targetId !== response.id ||
    session.actorId !== selection.actorId ||
    session.leaseId !== selection.leaseId ||
    metadata.pdmsCatalogSessionId !== selection.sessionId ||
    !z.array(z.string()).parse(session.names).includes(selection.name)
  ) {
    fail(409, "pdms_selection_stale", "การเลือกโครงการไม่ตรงกับเอกสารที่บันทึก");
  }
  const target = resolvePdmsSelectionTarget(
    contract,
    selection,
    selection.documentKey
  );
  return {
    address: `${spreadsheetColumnName(target.column)}${target.row + 1}`,
    text: true as const,
    value: selection.name,
  };
};
