import { prisma } from "@onlyoffice/db";

import { reconcileSpreadsheetColumns } from "../documents/spreadsheets/columns";
import { spreadsheetColumnName } from "../documents/spreadsheets/contract";
import type {
  SpreadsheetRange,
  SpreadsheetContract,
} from "../documents/spreadsheets/contract";
import { validatePreservedSpreadsheetEditorSave } from "../documents/spreadsheets/editor-save-proof";
import { processSpreadsheet } from "../documents/spreadsheets/engine";
import { compactSpreadsheetDraftOptions } from "../documents/spreadsheets/helper-storage";
import {
  resetSpreadsheetPicturePlaceholders,
  readSpreadsheetPictures,
  overlaySpreadsheetPictures,
  synchronizeSpreadsheetPictureAnchors,
  restoreSpreadsheetPictureFrames,
} from "../documents/spreadsheets/pictures";
import {
  protectSpreadsheet,
  spreadsheetInputRanges,
  unprotectSpreadsheet,
  validateSpreadsheetEdits,
} from "../documents/spreadsheets/protection";
import { validateSpreadsheetSaveSnapshot } from "../documents/spreadsheets/save-snapshot";
import {
  normalizeSpreadsheetUploadPocAnchors,
  spreadsheetUploadPocTargets,
  stripSpreadsheetUploadPoc,
  validateSpreadsheetAttachmentButtons,
} from "../documents/spreadsheets/upload-poc";
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
import { spreadsheetPictureFramesForTemplate } from "../forms/spreadsheet-picture-frames";
import { fail } from "../http/errors";
import { pdmsSelectionValue } from "../pdms/selection";
import {
  canonicalAttachment,
  checkAttachmentJsonBytes,
} from "../responses/attachment-data";
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

export type PrepareAttachments = (
  contract: SpreadsheetContract,
  data: Record<string, unknown>,
  savedData: Record<string, unknown>
) => Promise<Record<string, unknown>>;

// oxlint-disable-next-line complexity -- Actions share the trusted-workbook processing boundary.
export const prepareSpreadsheetOperation = async (
  metadata: OperationMetadata,
  snapshot: Uint8Array,
  heartbeat: () => Promise<unknown>,
  prepareAttachments?: PrepareAttachments
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
    let bindings = await spreadsheetDraftBindings(form.templateDraft.id);
    if (metadata.spreadsheetAnchors) {
      validateSpreadsheetSaveSnapshot(
        metadata.spreadsheetAnchors,
        bindings,
        current
      );
    }
    try {
      bindings = reconcileSpreadsheetColumns(bindings, current.names);
    } catch (error) {
      fail(
        422,
        "invalid_template",
        error instanceof Error ? error.message : "ตรวจสอบตำแหน่งคอลัมน์ตาราง"
      );
    }
    // A Template Draft may contain unfinished mappings. Saving preserves the
    // editor snapshot; only publication freezes and validates the contract.
    if (metadata.action === "save-template") {
      if (metadata.preserveEditorSession) {
        validatePreservedSpreadsheetEditorSave(snapshot, bindings, metadata);
      }
      const targets = spreadsheetUploadPocTargets(snapshot, bindings);
      const stripped = stripSpreadsheetUploadPoc(
        snapshot,
        new Set(targets.map((target) => target.bindingId))
      );
      if (metadata.preserveEditorSession && stripped !== snapshot) {
        fail(
          422,
          "invalid_template",
          "Obsolete attachment buttons require a normal template save before preserving the editor session"
        );
      }
      return compactSpreadsheetDraftOptions(
        normalizeSpreadsheetUploadPocAnchors(stripped)
      );
    }
    validateSpreadsheetPublication(bindings);
    validateSpreadsheetAttachmentButtons(snapshot, bindings);
    let synchronized: Uint8Array;
    try {
      synchronized = synchronizeSpreadsheetPictureAnchors(snapshot, bindings);
      resolveSpreadsheetContract(
        bindings,
        readSpreadsheetWorkbook(synchronized)
      );
    } catch (error) {
      fail(
        422,
        "invalid_template",
        error instanceof Error ? error.message : "ตรวจสอบช่วงเซลล์และคอลัมน์ของฟอร์ม"
      );
    }
    const result = await processSpreadsheet(
      unprotectSpreadsheet(synchronized),
      {
        bindings,
        heartbeat,
      }
    );
    try {
      const workbook = readSpreadsheetWorkbook(result.workbook);
      const contract = resolveSpreadsheetContract(bindings, workbook);
      return protectSpreadsheet(
        resetSpreadsheetPicturePlaceholders(result.workbook, contract),
        contract
      );
    } catch (error) {
      fail(
        422,
        "invalid_template",
        error instanceof Error
          ? error.message
          : "ตรวจสอบกรอบรูปและช่วงเซลล์ของฟอร์ม"
      );
    }
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
  const correction =
    metadata.action === "save-correction" ||
    metadata.action === "save-correction-workspace";
  let baseObjectKey = response.draftObjectKey;
  let currentDocumentKey = response.draftDocumentKey;
  if (correction) {
    const workspace = await prisma.editorLease.findFirst({
      where: {
        id: metadata.workspaceLeaseId,
        targetId: response.id,
        targetType: "correction",
        workspaceBaseDocumentKey: metadata.baseDocumentKey,
        workspaceBaseRevision: metadata.baseRevision,
        workspaceDocumentKey: metadata.workspaceDocumentKey,
        workspaceObjectKey: metadata.workspaceObjectKey,
      },
    });
    if (
      !metadata.workspaceLeaseId ||
      !workspace ||
      response.status !== "submitted"
    ) {
      fail(
        409,
        "stale_operation",
        "The correction workspace is no longer current"
      );
    }
    baseObjectKey = workspace.workspaceObjectKey;
    currentDocumentKey = workspace.workspaceDocumentKey;
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
    correction
      ? []
      : Object.keys(lockedRecord).filter((key) => lockedRecord[key] === true)
  );
  validateSpreadsheetEdits(previous, current, contract, locked);
  const pictures = readSpreadsheetPictures(current, contract, {
    includePlaceholders: true,
  });
  const frames = contract.fields.some((field) => field.type === "picture")
    ? await spreadsheetPictureFramesForTemplate(response.publishedTemplateId)
    : [];
  const inputs = spreadsheetInputRanges(contract, locked);
  let sourceData = response.draftData;
  if (correction && contract.fields.some((field) => field.attachment)) {
    const source = metadata.baseRevision
      ? await prisma.correction.findFirst({
          select: { data: true },
          where: {
            responseId: response.id,
            revision: metadata.baseRevision,
            submissionId: metadata.submissionId,
          },
        })
      : await prisma.submission.findFirst({
          select: { data: true },
          where: { id: metadata.submissionId, responseId: response.id },
        });
    if (!source) {
      fail(409, "stale_operation", "ไม่พบข้อมูลไฟล์ของฉบับที่กำลังแก้ไข");
    }
    sourceData = source.data;
  }
  const savedData =
    sourceData && typeof sourceData === "object" && !Array.isArray(sourceData)
      ? (sourceData as Record<string, unknown>)
      : {};
  if (contract.fields.some((field) => field.attachment)) {
    validateSpreadsheetAttachmentButtons(
      baseBytes,
      storedSpreadsheetBindings(contract)
    );
    validateSpreadsheetAttachmentButtons(
      snapshot,
      storedSpreadsheetBindings(contract)
    );
  }
  let attachmentData = savedData;
  if (prepareAttachments) {
    const native = extractSpreadsheetData(
      current,
      contract,
      metadata.action === "submit",
      savedData
    );
    const ordinaryErrors = native.errors.filter(
      (error) =>
        !contract.fields.some(
          (field) =>
            field.attachment &&
            error.message === `Required attachment: ${field.label}`
        )
    );
    if (ordinaryErrors.length && metadata.action === "submit") {
      throw new SpreadsheetValidationError(ordinaryErrors);
    }
    attachmentData = await prepareAttachments(contract, native.data, savedData);
  }
  const attachmentAddresses = new Set(
    contract.fields
      .filter((field) => field.attachment)
      .map((field) => {
        const range = contract.locations[field.anchor];
        if (!range) {
          fail(
            422,
            "invalid_attachment",
            `ตำแหน่งช่อง ${field.key} ไม่ตรงกับเอกสาร`
          );
        }
        return `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}`;
      })
  );
  const values = [...current.cells.values()]
    .filter(
      (cell) =>
        inputs.some(
          (range) =>
            cell.row >= range.firstRow &&
            cell.row <= range.lastRow &&
            cell.column >= range.firstColumn &&
            cell.column <= range.lastColumn
        ) &&
        !attachmentAddresses.has(cell.address) &&
        // Native/canonical XLSX may include empty cells inside a merged input.
        // Writing a subordinate cell after its anchor clears the whole merge.
        !current.merges.some(
          (range) =>
            cell.row >= range.firstRow &&
            cell.row <= range.lastRow &&
            cell.column >= range.firstColumn &&
            cell.column <= range.lastColumn &&
            (cell.row !== range.firstRow || cell.column !== range.firstColumn)
        )
    )
    .map((cell) => {
      const hyperlink = current.hyperlinks.find(
        (link) =>
          cell.row >= link.range.firstRow &&
          cell.row <= link.range.lastRow &&
          cell.column >= link.range.firstColumn &&
          cell.column <= link.range.lastColumn
      );
      return {
        address: cell.address,
        value: cell.value,
        ...(hyperlink
          ? {
              hyperlink: {
                target: hyperlink.target,
                tooltip: hyperlink.tooltip,
              },
            }
          : {}),
      };
    });
  const selectedProject = await pdmsSelectionValue(metadata, contract, {
    documentKey: currentDocumentKey,
    targetId: response.id,
    targetType: correction ? "correction" : "response",
  });
  if (selectedProject) {
    values.push(selectedProject);
  }
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
  if (
    rowChange?.action === "insert" &&
    contract.table &&
    spreadsheetUploadPocTargets(
      baseBytes,
      storedSpreadsheetBindings(contract)
    ).some((target) => target.kind === "column")
  ) {
    const body = contract.locations[contract.table.anchor];
    if (!body || rowChange.index !== body.lastRow - body.firstRow + 1) {
      throw new Error("Upload POC supports appending table rows only");
    }
  }
  for (const field of contract.fields.filter(
    (candidate) => candidate.attachment
  )) {
    const range = contract.locations[field.anchor];
    if (!range) {
      fail(422, "invalid_attachment", `ตำแหน่งช่อง ${field.key} ไม่ตรงกับเอกสาร`);
    }
    const attachment = canonicalAttachment(attachmentData[field.key]);
    values.push({
      address: `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}`,
      value: attachment?.file_link ?? "",
    });
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
  const withPictures = overlaySpreadsheetPictures(
    result.workbook,
    nextContract,
    restoreSpreadsheetPictureFrames(pictures, frames),
    { lockPosition: true }
  );
  const extracted = extractSpreadsheetData(
    readSpreadsheetWorkbook(withPictures),
    nextContract,
    metadata.action === "submit" || metadata.action === "save-correction",
    attachmentData
  );
  if (
    extracted.errors.length &&
    metadata.action !== "save-draft" &&
    metadata.action !== "save-correction-workspace"
  ) {
    throw new SpreadsheetValidationError(extracted.errors);
  }
  if (contract.fields.some((field) => field.attachment)) {
    checkAttachmentJsonBytes(extracted.data);
  }
  metadata.data = extracted.data;
  metadata.spreadsheetErrors = extracted.errors;
  return protectSpreadsheet(withPictures, nextContract, locked);
};
