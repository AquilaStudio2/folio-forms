import { prisma } from "@onlyoffice/db";

import { reconcileSpreadsheetColumns } from "../documents/spreadsheets/columns";
import {
  spreadsheetCellPosition,
  spreadsheetColumnName,
  spreadsheetRangesOverlap,
} from "../documents/spreadsheets/contract";
import type {
  SpreadsheetRange,
  SpreadsheetContract,
} from "../documents/spreadsheets/contract";
import { validatePreservedSpreadsheetEditorSave } from "../documents/spreadsheets/editor-save-proof";
import { processSpreadsheet } from "../documents/spreadsheets/engine";
import { compactSpreadsheetDraftOptions } from "../documents/spreadsheets/helper-storage";
import type { SpreadsheetHyperlink } from "../documents/spreadsheets/hyperlinks";
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
import type { SpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
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
  attachmentSlotKey,
  canonicalAttachment,
  canonicalTableAttachments,
  spreadsheetAttachmentSlots,
  hasSpreadsheetAttachments,
  checkAttachmentJsonBytes,
} from "../responses/attachment-data";
import type { TableAttachment } from "../responses/attachment-data";
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
  savedData: Record<string, unknown>,
  workbook: SpreadsheetWorkbook
) => Promise<Record<string, unknown>>;

const validateAttachmentProjection = (
  workbook: SpreadsheetWorkbook,
  contract: SpreadsheetContract,
  expectedLinks: ReadonlyMap<string, string>
): void => {
  const singleLinks = new Map<string, SpreadsheetHyperlink>();
  const rangeLinks: SpreadsheetHyperlink[] = [];
  for (const link of workbook.hyperlinks) {
    const { range } = link;
    const address = rangeAddress(range);
    if (
      range.firstRow !== range.lastRow ||
      range.firstColumn !== range.lastColumn ||
      singleLinks.has(address)
    ) {
      rangeLinks.push(link);
    } else {
      singleLinks.set(address, link);
    }
  }
  for (const slot of spreadsheetAttachmentSlots(contract)) {
    const cell = workbook.cells.get(slot.address);
    const { row, column } = spreadsheetCellPosition(slot.address);
    const range =
      "anchor" in slot.field
        ? contract.locations[slot.field.anchor]
        : undefined;
    const cellRange = {
      firstColumn: column,
      firstRow: row,
      lastColumn: column,
      lastRow: row,
      sheet: workbook.sheet,
    };
    const expectedLink = expectedLinks.get(slot.key) ?? "";
    const link = singleLinks.get(rangeAddress(cellRange));
    if (
      (cell?.value ?? "") !== expectedLink ||
      cell?.formula ||
      (link?.target ?? "") !== expectedLink ||
      rangeLinks.some((item) =>
        spreadsheetRangesOverlap(item.range, range ?? cellRange)
      ) ||
      (range &&
        rangeAddress(range) !== rangeAddress(cellRange) &&
        workbook.hyperlinks.some(
          (item) => item !== link && spreadsheetRangesOverlap(item.range, range)
        ))
    ) {
      fail(
        409,
        "attachment_projection_unproven",
        `ยืนยันไฟล์แนบในเอกสารที่สร้างเสร็จไม่ได้ (${slot.address})`
      );
    }
  }
};

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
  const tableBody = contract.table
    ? contract.locations[contract.table.anchor]
    : undefined;
  if (
    rowChange?.action === "delete" &&
    tableBody &&
    tableBody.lastRow - tableBody.firstRow + 1 <= 1
  ) {
    fail(
      409,
      "spreadsheet_minimum_rows",
      "ต้องมีอย่างน้อย 1 แถว ไม่สามารถลบแถวสุดท้ายได้"
    );
  }
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
  if (correction && hasSpreadsheetAttachments(contract)) {
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
  if (hasSpreadsheetAttachments(contract)) {
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
    attachmentData = await prepareAttachments(contract, savedData, current);
  }
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
  const attachedRows =
    contract.table && tableBody
      ? canonicalTableAttachments(
          attachmentData,
          contract.table.key,
          contract.table.columns
            .filter((column) => column.attachment)
            .map((column) => column.key),
          tableBody.lastRow - tableBody.firstRow + 1
        )
      : new Map<number, Record<string, TableAttachment>>();
  const attachmentWrites = [...spreadsheetAttachmentSlots(contract)].map(
    (slot) => ({
      link:
        (slot.rowIndex === null
          ? canonicalAttachment(attachmentData[slot.field.key])
          : attachedRows.get(slot.rowIndex)?.[slot.field.key]
        )?.file_link ?? "",
      slot,
    })
  );
  for (const { slot, link } of attachmentWrites) {
    values.push({
      address: slot.address,
      value: link,
      ...(link ? { hyperlink: { target: link, tooltip: undefined } } : {}),
    });
  }
  const result = await processSpreadsheet(unprotectSpreadsheet(baseBytes), {
    bindings: storedSpreadsheetBindings(contract),
    clearRanges: [
      ...inputs.map(rangeAddress),
      ...attachmentWrites.map(({ slot }) => slot.address),
    ],
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
  const nextBody = nextContract.table
    ? nextContract.locations[nextContract.table.anchor]
    : undefined;
  const oldRowCount = tableBody
    ? tableBody.lastRow - tableBody.firstRow + 1
    : 0;
  const newRowCount = nextBody ? nextBody.lastRow - nextBody.firstRow + 1 : 0;
  if (
    rowChange &&
    (!tableBody ||
      !nextBody ||
      rowChange.index > oldRowCount ||
      (rowChange.action === "delete" && rowChange.index >= oldRowCount) ||
      newRowCount !== oldRowCount + (rowChange.action === "insert" ? 1 : -1))
  ) {
    fail(
      409,
      "attachment_row_mapping_unproven",
      "ยืนยันตำแหน่งแถวหลังเปลี่ยนตารางไม่ได้ ข้อมูลและไฟล์เดิมยังอยู่"
    );
  }
  if (!rowChange && newRowCount !== oldRowCount) {
    fail(
      409,
      "attachment_row_mapping_unproven",
      "จำนวนแถวเปลี่ยนโดยไม่มีคำสั่งที่รองรับ"
    );
  }
  const expectedLinks = new Map<string, string>();
  if (hasSpreadsheetAttachments(contract)) {
    validateSpreadsheetAttachmentButtons(
      result.workbook,
      storedSpreadsheetBindings(nextContract)
    );
    const rowMapping = Array.from({ length: oldRowCount }, (_, index) => {
      if (!rowChange) {
        return index;
      }
      if (rowChange.action === "insert") {
        return index >= rowChange.index ? index + 1 : index;
      }
      if (index === rowChange.index) {
        return null;
      }
      return index > rowChange.index ? index - 1 : index;
    });
    for (const { slot, link } of attachmentWrites) {
      if (slot.rowIndex === null) {
        expectedLinks.set(slot.key, link);
      } else {
        const nextIndex = rowMapping[slot.rowIndex];
        if (nextIndex !== null && nextIndex !== undefined) {
          expectedLinks.set(attachmentSlotKey(slot.field.id, nextIndex), link);
        }
      }
    }
    const changedRow =
      tableBody && rowChange
        ? tableBody.firstRow + rowChange.index
        : Number.POSITIVE_INFINITY;
    const shift = rowChange?.action === "delete" ? -1 : 1;
    for (const field of contract.fields) {
      if (!field.attachment) {
        continue;
      }
      const before = contract.locations[field.anchor];
      const after = nextContract.locations[field.anchor];
      if (
        !before ||
        !after ||
        before.sheet !== after.sheet ||
        before.firstColumn !== after.firstColumn ||
        before.lastColumn !== after.lastColumn ||
        before.firstRow + (before.firstRow >= changedRow ? shift : 0) !==
          after.firstRow ||
        before.lastRow + (before.lastRow >= changedRow ? shift : 0) !==
          after.lastRow
      ) {
        fail(
          409,
          "attachment_projection_unproven",
          "ตำแหน่งช่องแนบเปลี่ยนในเอกสารที่สร้างเสร็จ"
        );
      }
    }
    if (tableBody && nextBody && contract.table && nextContract.table) {
      const expected = new Map(
        values.map((value) => [value.address, value.value])
      );
      for (const column of contract.table.columns.filter(
        (candidate) => !candidate.computed
      )) {
        const nextColumn = nextContract.table.columns.find(
          (candidate) => candidate.id === column.id
        );
        if (
          !nextColumn ||
          nextColumn.offset !== column.offset ||
          tableBody.firstColumn !== nextBody.firstColumn ||
          tableBody.firstRow !== nextBody.firstRow
        ) {
          fail(
            409,
            "attachment_row_mapping_unproven",
            "ตำแหน่งคอลัมน์เปลี่ยนระหว่างเปลี่ยนแถว"
          );
        }
        for (let oldIndex = 0; oldIndex < oldRowCount; oldIndex += 1) {
          const newIndex = rowMapping[oldIndex];
          if (newIndex === null || newIndex === undefined) {
            continue;
          }
          const before = `${spreadsheetColumnName(tableBody.firstColumn + column.offset)}${tableBody.firstRow + oldIndex + 1}`;
          const after = `${spreadsheetColumnName(nextBody.firstColumn + nextColumn.offset)}${nextBody.firstRow + newIndex + 1}`;
          const expectedValue = expected.get(before) ?? null;
          const actualValue = workbook.cells.get(after)?.value ?? null;
          if (
            (expectedValue === "" ? null : expectedValue) !==
            (actualValue === "" ? null : actualValue)
          ) {
            fail(
              409,
              "attachment_row_mapping_unproven",
              `ยืนยันข้อมูลแถว ${oldIndex + 1} หลังเปลี่ยนตารางไม่ได้`
            );
          }
        }
      }
      if (rowChange) {
        attachmentData = {
          ...attachmentData,
          [contract.table.key]: [...attachedRows].flatMap(([oldIndex, row]) => {
            const newIndex = rowMapping[oldIndex];
            return newIndex === null || newIndex === undefined
              ? []
              : [
                  Object.fromEntries(
                    Object.entries(row).map(([key, value]) => [
                      key,
                      { ...value, row_index: newIndex },
                    ])
                  ),
                ];
          }),
        };
      }
    }
    metadata.attachmentTransition = {
      fromDocumentKey: currentDocumentKey,
      newRowCount,
      oldRowCount,
      rowMapping,
      tableBindingId: contract.table?.id ?? null,
      toDocumentKey: metadata.nextDocumentKey ?? currentDocumentKey,
    };
  }
  const withPictures = overlaySpreadsheetPictures(
    result.workbook,
    nextContract,
    restoreSpreadsheetPictureFrames(pictures, frames),
    { lockPosition: true }
  );
  const finalBytes = protectSpreadsheet(withPictures, nextContract, locked);
  const finalWorkbook = readSpreadsheetWorkbook(finalBytes);
  if (hasSpreadsheetAttachments(contract)) {
    validateAttachmentProjection(finalWorkbook, nextContract, expectedLinks);
  }
  const extracted = extractSpreadsheetData(
    finalWorkbook,
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
  if (hasSpreadsheetAttachments(contract)) {
    checkAttachmentJsonBytes(extracted.data);
  }
  metadata.data = extracted.data;
  metadata.spreadsheetErrors = extracted.errors;
  return finalBytes;
};
