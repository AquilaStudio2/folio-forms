import { contentHash } from "../../digests";
import { templateArchiveText } from "../package";
import {
  reconcileSpreadsheetColumns,
  spreadsheetBindingAnchors,
  spreadsheetTableColumnsAnchor,
} from "./columns";
import { spreadsheetRangesOverlap } from "./contract";
import type { SpreadsheetBindings } from "./contract";
import {
  savedSpreadsheetUploadPocButtons,
  validateSpreadsheetAttachmentButtons,
} from "./upload-poc";
import type { SavedUploadPocButton } from "./upload-poc";
import { mismatchedSpreadsheetDraftValidations } from "./validation";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "./workbook";
import type { SpreadsheetWorkbook } from "./workbook";
import { spreadsheetXmlChildren, spreadsheetXmlTree } from "./xml";

export interface XlsxDraftIssue {
  bindingId: string | null;
  code:
    | "unbound"
    | "missing_or_broken_anchor"
    | "untracked_columns"
    | "ambiguous_columns"
    | "placement_mismatch"
    | "attachment_mismatch"
    | "validation_mismatch"
    | "workbook_unproved";
}
// oxlint-disable-next-line complexity -- Keep each diagnostic tied to positive evidence from the same saved workbook.
export const diagnoseXlsxDraft = (
  bytes: Uint8Array,
  bindings: SpreadsheetBindings,
  expectedHash: string | null
) => {
  const issues: XlsxDraftIssue[] = [];
  const add = (
    bindingId: XlsxDraftIssue["bindingId"],
    code: XlsxDraftIssue["code"]
  ) => {
    if (
      !issues.some(
        (issue) => issue.bindingId === bindingId && issue.code === code
      )
    ) {
      issues.push({ bindingId, code });
    }
  };
  if (expectedHash !== null && contentHash(bytes) !== expectedHash) {
    add(null, "workbook_unproved");
    return { issues, savedButtons: [] };
  }
  const rejected = new Set<string>();
  let workbook: SpreadsheetWorkbook;
  try {
    workbook = readSpreadsheetWorkbook(bytes, rejected);
  } catch {
    add(null, "workbook_unproved");
    return { issues, savedButtons: [] };
  }
  const present = (name: string) =>
    workbook.names.has(name) || rejected.has(name);
  const fields = bindings.fields.filter((field) => {
    if (field.unbound && !present(field.anchor)) {
      add(field.id, "unbound");
      return false;
    }
    if (!workbook.names.has(field.anchor)) {
      add(field.id, "missing_or_broken_anchor");
      return false;
    }
    if (field.unbound) {
      add(field.id, "placement_mismatch");
    }
    return true;
  });
  let { table } = bindings;
  if (table) {
    const names = spreadsheetBindingAnchors({ ...bindings, fields: [] });
    const body = workbook.names.get(table.anchor);
    if (table.unbound && !names.some(present)) {
      add(table.id, "unbound");
      table = null;
    } else if (!body) {
      add(table.id, "missing_or_broken_anchor");
      table = null;
    } else if (names.length > 1 && !names.slice(1).some(present)) {
      add(table.id, "untracked_columns");
      table = null;
    } else {
      if (table.unbound) {
        add(table.id, "placement_mismatch");
      }
      const tableId = table.id;
      try {
        const marker = workbook.names.get(
          spreadsheetTableColumnsAnchor(tableId)
        );
        if (
          table.columns.length &&
          (!marker || JSON.stringify(marker) !== JSON.stringify(body))
        ) {
          throw new Error("Table tracking marker does not match its body");
        }
        ({ table } = reconcileSpreadsheetColumns(
          { ...bindings, table },
          workbook.names
        ));
      } catch {
        add(tableId, "ambiguous_columns");
        table = null;
      }
    }
  }
  const roots = [...fields, ...(table ? [table] : [])];
  for (const [index, root] of roots.entries()) {
    try {
      resolveSpreadsheetContract(
        {
          ...bindings,
          fields: "columns" in root ? [] : [root],
          table: "columns" in root ? root : null,
        },
        workbook
      );
    } catch {
      add(root.id, "placement_mismatch");
    }
    const range = workbook.names.get(root.anchor);
    for (const other of roots.slice(index + 1)) {
      const otherRange = workbook.names.get(other.anchor);
      if (range && otherRange && spreadsheetRangesOverlap(range, otherRange)) {
        add(root.id, "placement_mismatch");
        add(other.id, "placement_mismatch");
      }
    }
  }
  const managed = new Set(spreadsheetBindingAnchors(bindings));
  if ([...rejected].some((name) => !managed.has(name))) {
    add(null, "workbook_unproved");
  }
  try {
    for (const id of mismatchedSpreadsheetDraftValidations(workbook, {
      fields,
      table,
      version: bindings.version,
    })) {
      add(id, "validation_mismatch");
    }
  } catch {
    add(null, "validation_mismatch");
  }

  // Only the normal strict reader can authorize a saved attachment button.
  let savedButtons: SavedUploadPocButton[] = [];
  const names = spreadsheetXmlChildren(
    spreadsheetXmlTree(
      templateArchiveText(workbook.archive, "xl/workbook.xml")
    ),
    "definedNames"
  ).flatMap((node) => spreadsheetXmlChildren(node, "definedName"));
  const markerIds = names.flatMap((node) => {
    const marker = node.attributes.name ?? "";
    return marker.startsWith("_folio_upload_poc_")
      ? [marker.slice("_folio_upload_poc_".length)]
      : [];
  });
  const boundAttachmentIds = [
    ...bindings.fields.filter((field) => !field.unbound),
    ...(bindings.table?.unbound ? [] : (bindings.table?.columns ?? [])),
  ]
    .filter((field) => field.attachment)
    .map((field) => field.id);
  if (
    !markerIds.length &&
    !boundAttachmentIds.length &&
    !Object.keys(workbook.archive).some((name) =>
      name.startsWith("xl/embeddings/")
    )
  ) {
    return { issues, savedButtons };
  }
  try {
    validateSpreadsheetAttachmentButtons(bytes, bindings, true);
    savedButtons = savedSpreadsheetUploadPocButtons(bytes, bindings);
    const tableBody =
      bindings.table && workbook.names.get(bindings.table.anchor);
    if (
      markerIds.some((id) => {
        const expectedCount =
          tableBody &&
          bindings.table?.columns.some((column) => column.id === id)
            ? tableBody.lastRow - tableBody.firstRow + 1
            : 1;
        return (
          savedButtons.filter((button) => button.bindingId === id).length !==
          expectedCount
        );
      })
    ) {
      throw new Error("Attachment marker has no matching button");
    }
  } catch {
    const ids = new Set([...markerIds, ...boundAttachmentIds]);
    const [id] = ids;
    const known =
      bindings.fields.some((field) => field.id === id) ||
      bindings.table?.columns.some((column) => column.id === id);
    add(ids.size === 1 && known && id ? id : null, "attachment_mismatch");
    savedButtons = [];
  }
  return { issues, savedButtons };
};
