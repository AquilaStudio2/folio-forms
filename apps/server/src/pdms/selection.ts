import { prisma } from "@onlyoffice/db";
import { z } from "zod";

import { spreadsheetColumnName } from "../documents/spreadsheets/contract";
import type { SpreadsheetContract } from "../documents/spreadsheets/contract";
import { fail } from "../http/errors";
import type { OperationMetadata } from "../operations/model";

export const pdmsSelectionSchema = z
  .object({
    actorId: z.string().min(1),
    bindingId: z.string().regex(/^folio_[A-Za-z0-9_]+$/u),
    documentKey: z.string().min(1),
    leaseId: z.uuid(),
    name: z.string().min(1),
    sessionId: z.uuid(),
  })
  .strict();

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
  const field = contract.fields.find(
    (candidate) => candidate.id === selection.bindingId
  );
  const range = field ? contract.locations[field.anchor] : null;
  if (
    !session ||
    !field ||
    !range ||
    field.source !== "pdms-project-name" ||
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
  return {
    address: `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}`,
    value: selection.name,
  };
};
