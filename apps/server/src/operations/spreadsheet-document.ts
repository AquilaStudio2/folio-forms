import { prisma } from "@onlyoffice/db";

import { spreadsheetColumnName } from "../documents/spreadsheets/contract";
import type { SpreadsheetRange } from "../documents/spreadsheets/contract";
import { processSpreadsheet } from "../documents/spreadsheets/engine";
import {
  protectSpreadsheet,
  spreadsheetInputRanges,
  unprotectSpreadsheet,
  validateSpreadsheetEdits,
} from "../documents/spreadsheets/protection";
import {
  extractSpreadsheetData,
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../documents/spreadsheets/workbook";
import {
  spreadsheetContractForTemplate,
  spreadsheetDraftBindings,
  storedSpreadsheetBindings,
  validateSpreadsheetPublication,
} from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";
import { readObject } from "../storage";
import type { OperationMetadata } from "./model";

export class SpreadsheetValidationError extends Error {
  readonly errors: { address: string; message: string }[];
  constructor(errors: { address: string; message: string }[]) {
    super(errors.map((error) => error.message).join("\n"));
    this.name = "SpreadsheetValidationError";
    this.errors = errors;
  }
}

const rangeAddress = (range: SpreadsheetRange): string =>
  `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}:${spreadsheetColumnName(range.lastColumn)}${range.lastRow + 1}`;

// oxlint-disable-next-line complexity -- Actions share the trusted-workbook processing boundary.
export const prepareSpreadsheetOperation = async (
  metadata: OperationMetadata,
  snapshot: Uint8Array,
  heartbeat: () => Promise<unknown>
): Promise<Uint8Array> => {
  const form = await prisma.form.findUnique({
    include: { templateDraft: true },
    where: { id: metadata.formId },
  });
  if (!form || form.documentKind !== "xlsx") {
    throw new Error("Spreadsheet form is unavailable");
  }
  const current = readSpreadsheetWorkbook(snapshot);
  if (metadata.action === "save-template" || metadata.action === "publish") {
    if (
      !form.templateDraft ||
      form.templateDraft.bindingRevision !== metadata.bindingRevision
    ) {
      fail(
        409,
        "stale_operation",
        "Spreadsheet configuration changed while saving"
      );
    }
    const bindings = await spreadsheetDraftBindings(form.templateDraft.id);
    // A Template Draft may contain unfinished mappings. Saving preserves the
    // editor snapshot; only publication freezes and validates the contract.
    if (metadata.action === "save-template") {
      return snapshot;
    }
    validateSpreadsheetPublication(bindings);
    try {
      resolveSpreadsheetContract(bindings, current);
    } catch (error) {
      fail(
        422,
        "invalid_template",
        error instanceof Error ? error.message : "ตรวจสอบช่วงเซลล์และคอลัมน์ของฟอร์ม"
      );
    }
    const result = await processSpreadsheet(unprotectSpreadsheet(snapshot), {
      bindings,
      heartbeat,
    });
    const workbook = readSpreadsheetWorkbook(result.workbook);
    const contract = resolveSpreadsheetContract(bindings, workbook);
    return protectSpreadsheet(result.workbook, contract);
  }

  const response = metadata.responseId
    ? await prisma.response.findUnique({
        include: { prefillSnapshot: true },
        where: { id: metadata.responseId },
      })
    : null;
  if (!response) {
    throw new Error("Spreadsheet response is unavailable");
  }
  let baseObjectKey = response.draftObjectKey;
  if (metadata.action === "save-correction") {
    const latest = await prisma.correction.findFirst({
      orderBy: { revision: "desc" },
      where: { submissionId: metadata.submissionId },
    });
    const submission = metadata.submissionId
      ? await prisma.submission.findUnique({
          where: { id: metadata.submissionId },
        })
      : null;
    baseObjectKey =
      metadata.workspaceObjectKey ??
      latest?.objectKey ??
      submission?.objectKey ??
      null;
  }
  if (!baseObjectKey) {
    throw new Error("Spreadsheet base artifact is unavailable");
  }
  const baseBytes = await readObject(baseObjectKey);
  const previous = readSpreadsheetWorkbook(baseBytes);
  // Resolve positions from the trusted saved artifact before checking client edits.
  const contract = await spreadsheetContractForTemplate(
    response.publishedTemplateId,
    previous
  );
  const lockedRecord = (response.prefillSnapshot?.lockedFields ?? {}) as Record<
    string,
    unknown
  >;
  const locked = new Set(
    metadata.action === "save-correction"
      ? []
      : Object.keys(lockedRecord).filter((key) => lockedRecord[key] === true)
  );
  validateSpreadsheetEdits(previous, current, contract, locked);
  const inputs = spreadsheetInputRanges(contract, locked);
  const values = [...current.cells.values()]
    .filter((cell) =>
      inputs.some(
        (range) =>
          cell.row >= range.firstRow &&
          cell.row <= range.lastRow &&
          cell.column >= range.firstColumn &&
          cell.column <= range.lastColumn
      )
    )
    .map((cell) => ({ address: cell.address, value: cell.value }));
  const rowChange = metadata.spreadsheetRowChange as
    | { action: "insert" | "delete"; index: number }
    | undefined;
  if (
    rowChange &&
    (!contract.table ||
      metadata.action !== "save-draft" ||
      !["insert", "delete"].includes(rowChange.action) ||
      !Number.isSafeInteger(rowChange.index) ||
      rowChange.index < 0)
  ) {
    throw new Error("Invalid spreadsheet row operation");
  }
  const result = await processSpreadsheet(unprotectSpreadsheet(baseBytes), {
    bindings: storedSpreadsheetBindings(contract),
    clearRanges: inputs.map(rangeAddress),
    heartbeat,
    values,
    ...(rowChange && contract.table
      ? {
          rowChange: {
            action: rowChange.action,
            bodyName: contract.table.anchor,
            index: rowChange.index,
            inputColumns: contract.table.columns
              .filter((column) => !column.computed)
              .map((column) => column.offset),
          },
        }
      : {}),
  });
  const workbook = readSpreadsheetWorkbook(result.workbook);
  const nextContract = resolveSpreadsheetContract(
    storedSpreadsheetBindings(contract),
    workbook
  );
  const extracted = extractSpreadsheetData(
    workbook,
    nextContract,
    metadata.action === "submit" || metadata.action === "save-correction"
  );
  if (extracted.errors.length && metadata.action !== "save-draft") {
    throw new SpreadsheetValidationError(extracted.errors);
  }
  metadata.data = extracted.data;
  metadata.spreadsheetErrors = extracted.errors;
  return protectSpreadsheet(result.workbook, nextContract, locked);
};
