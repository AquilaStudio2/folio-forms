import { prisma, OperationStatus } from "@onlyoffice/db";

import { tokenDigest } from "../digests";
import { templateArchiveText } from "../documents/package";
import { readSpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
import type { SpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
import {
  spreadsheetXmlChildren,
  spreadsheetXmlTree,
} from "../documents/spreadsheets/xml";
import { spreadsheetContractForTemplate } from "../forms/spreadsheet-fields";
import { fail, HttpError } from "../http/errors";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Operation } from "../model-types";
import type { OnlyOfficeClient } from "../onlyoffice";
import { createCallbackUserdata } from "../onlyoffice";
import { readObject } from "../storage";
import { finalizeCallback } from "./callback";
import {
  callbackClaimLifetimeSeconds,
  consumeCallbackClaim,
  updateOperationFailed,
  operationDocumentKey,
} from "./lifecycle";
import { operationMetadata } from "./model";
import { nativeCaptureKey } from "./object-cleanup";
import { SpreadsheetValidationError } from "./spreadsheet-document";

const hasLockedNativeSurface = (workbook: SpreadsheetWorkbook): boolean => {
  const [sheet] = spreadsheetXmlChildren(
    spreadsheetXmlTree(
      templateArchiveText(workbook.archive, workbook.sheetPath)
    ),
    "sheetProtection"
  );
  const [book] = spreadsheetXmlChildren(
    spreadsheetXmlTree(
      templateArchiveText(workbook.archive, "xl/workbook.xml")
    ),
    "workbookProtection"
  );
  const [styles] = spreadsheetXmlChildren(
    spreadsheetXmlTree(templateArchiveText(workbook.archive, "xl/styles.xml")),
    "cellXfs"
  );
  const formats = styles ? spreadsheetXmlChildren(styles, "xf") : [];
  return (
    Boolean(sheet?.attributes.password && book?.attributes.workbookPassword) &&
    book?.attributes.lockStructure === "1" &&
    [
      "sheet",
      "objects",
      "formatCells",
      "formatColumns",
      "formatRows",
      "insertColumns",
      "insertRows",
      "deleteColumns",
      "deleteRows",
    ].every((attribute) => sheet?.attributes[attribute] === "1") &&
    formats.length > 0 &&
    formats.every(
      (format) =>
        format.attributes.applyProtection === "1" &&
        spreadsheetXmlChildren(format, "protection")[0]?.attributes.locked ===
          "1"
    )
  );
};

/** A fully locked picker/computed-only Response has no native values or row edits to lose. */
async function pickerOnlyCanonicalSnapshot(
  operation: Operation
): Promise<Uint8Array | null> {
  const metadata = operationMetadata(operation.metadata);
  if (
    metadata.documentKind !== "xlsx" ||
    !metadata.responseId ||
    !operation.documentKey ||
    !["response", "correction"].includes(operation.targetType)
  ) {
    return null;
  }
  const response = await prisma.response.findFirst({
    select: { draftDocumentKey: true, publishedTemplateId: true },
    where: { formId: operation.formId, id: metadata.responseId },
  });
  if (
    !response ||
    (operation.targetType === "response" &&
      response.draftDocumentKey !== operation.documentKey)
  ) {
    return null;
  }
  if (
    operation.targetType === "correction" &&
    !(await prisma.editorLease.findFirst({
      select: { id: true },
      where: {
        id: metadata.workspaceLeaseId,
        targetId: metadata.responseId,
        targetType: "correction",
        workspaceDocumentKey: operation.documentKey,
      },
    }))
  ) {
    return null;
  }
  const key = await operationDocumentKey(operation.documentKey);
  if (!key) {
    return null;
  }
  const snapshot = await readObject(key);
  const workbook = readSpreadsheetWorkbook(snapshot);
  const contract = await spreadsheetContractForTemplate(
    response.publishedTemplateId,
    workbook
  );
  const fields = [...contract.fields, ...(contract.table?.columns ?? [])];
  return hasLockedNativeSurface(workbook) &&
    fields.some((field) => field.source === "pdms-project-name") &&
    fields.every(
      (field) =>
        field.type !== "picture" &&
        (field.source === "pdms-project-name" || field.computed)
    )
    ? snapshot
    : null;
}

export function launchForceSave(
  operation: Operation,
  onlyOffice: OnlyOfficeClient,
  allowedCallbackOrigins: ReadonlySet<string>
): void {
  void (async () => {
    try {
      if (!operation.documentKey) {
        fail(500, "invalid_operation", "Operation has no document key");
      }
      const expiresAtSeconds =
        Math.floor(Date.now() / 1000) + callbackClaimLifetimeSeconds;
      const userdata = createCallbackUserdata({
        documentKey: operation.documentKey,
        expiresAt: expiresAtSeconds,
        operationId: operation.id,
        operationType: operation.type,
      });
      const claimed = await prisma.$transaction(async (tx) => {
        const activated = await tx.operation.updateMany({
          data: { status: OperationStatus.processing, updatedAt: new Date() },
          where: { id: operation.id, status: OperationStatus.pending },
        });
        if (activated.count !== 1) {
          return false;
        }
        await tx.callbackClaim.create({
          data: {
            expiresAt: new Date(expiresAtSeconds * 1000),
            operationId: operation.id,
            tokenDigest: tokenDigest(userdata),
          },
        });
        return true;
      });
      if (!claimed) {
        return;
      }
      const saveResult = await onlyOffice.forceSave(
        operation.documentKey,
        userdata
      );
      if (saveResult !== true) {
        const consumption = await consumeCallbackClaim(operation.id, userdata);
        if (consumption === "replayed") {
          return;
        }
        if (consumption === "invalid") {
          await updateOperationFailed(operation.id, "callback_claim_invalid");
          return;
        }
        let snapshot: Uint8Array | undefined;
        if (saveResult === false) {
          const catalogSessionId = (
            operation.metadata as { pdmsCatalogSessionId?: unknown } | null
          )?.pdmsCatalogSessionId;
          const previous =
            typeof catalogSessionId === "string"
              ? await prisma.operation.findFirst({
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  where: {
                    OR: [
                      { status: OperationStatus.completed },
                      { errorCode: null },
                      { errorCode: { not: "native_snapshot_read_failed" } },
                    ],
                    createdAt: { lt: operation.createdAt },
                    documentKey: operation.documentKey,
                    formId: operation.formId,
                    status: {
                      in: [OperationStatus.completed, OperationStatus.failed],
                    },
                    targetId: operation.targetId,
                    targetType: operation.targetType,
                  },
                })
              : null;
          const failed =
            previous?.status === OperationStatus.failed ? previous : null;
          const recoveredCaptureKey = failed ? nativeCaptureKey(failed) : null;
          if (failed && !recoveredCaptureKey) {
            snapshot =
              (await pickerOnlyCanonicalSnapshot(operation)) ?? undefined;
          }
          if (failed && !recoveredCaptureKey && !snapshot) {
            await updateOperationFailed(
              operation.id,
              "document_save_failed",
              undefined,
              {
                errorMessage:
                  "ยังยืนยันข้อมูลล่าสุดจากตัวแก้ไขไม่ได้ ข้อมูลในตัวแก้ไขยังอยู่ กรุณาแก้ไขช่องกรอกแล้วบันทึกอีกครั้งก่อนปิดหน้านี้",
              }
            );
            return;
          }
          const currentObjectKey =
            recoveredCaptureKey ??
            (await operationDocumentKey(operation.documentKey));
          if (!currentObjectKey) {
            fail(
              500,
              "document_unavailable",
              "The current document snapshot is unavailable"
            );
          }
          if (!snapshot) {
            try {
              snapshot = await readObject(currentObjectKey);
            } catch {
              // Office explicitly reported unchanged. A storage read failure
              // must not replace the preceding trusted capture with uncertainty.
              await updateOperationFailed(
                operation.id,
                "native_snapshot_read_failed"
              );
              return;
            }
          }
        }
        await finalizeCallback(
          operation.id,
          {
            key: operation.documentKey,
            status: 6,
            ...(saveResult === false ? {} : { url: saveResult.url }),
          },
          snapshot,
          allowedCallbackOrigins
        );
      }
    } catch (error) {
      await updateOperationFailed(
        operation.id,
        error instanceof HttpError && error.code === "invalid_template"
          ? "invalid_template"
          : "force_save_failed",
        undefined,
        error instanceof HttpError && error.code === "invalid_template"
          ? { errorMessage: error.message }
          : error instanceof SpreadsheetValidationError
            ? {
                errorMessage: "ตรวจสอบช่องกรอกที่ระบุก่อนส่งคำตอบ",
                validationErrors: error.errors,
              }
            : undefined
      );
    }
  })();
}
