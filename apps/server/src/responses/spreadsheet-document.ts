import { prisma } from "@onlyoffice/db";

import { spreadsheetColumnName } from "../documents/spreadsheets/contract";
import type { SpreadsheetRange } from "../documents/spreadsheets/contract";
import { processSpreadsheet } from "../documents/spreadsheets/engine";
import { resetSpreadsheetPicturePlaceholders } from "../documents/spreadsheets/pictures";
import {
  protectSpreadsheet,
  unprotectSpreadsheet,
} from "../documents/spreadsheets/protection";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
  XLSX_CONTENT_TYPE,
} from "../documents/spreadsheets/workbook";
import {
  spreadsheetContractForTemplate,
  storedSpreadsheetBindings,
} from "../forms/spreadsheet-fields";
import type { ResponseWithSnapshot } from "../model-types";
import {
  drainObjectCleanupIntents,
  objectCleanupIntentGraceMs,
} from "../operations/object-cleanup";
import { readObject, putObject, objectKey } from "../storage";

interface SpreadsheetInitializationDependencies {
  processSpreadsheet?: typeof processSpreadsheet;
  putObject?: typeof putObject;
}

const cleanupInitializationObjects = async (keys: string[]): Promise<void> => {
  try {
    await prisma.objectCleanupIntent.updateMany({
      data: { cleanupAfter: new Date() },
      where: { objectKey: { in: keys } },
    });
    await drainObjectCleanupIntents(keys);
  } catch (error) {
    // A persisted intent lets recovery retry without hiding the initialization outcome.
    console.error("Spreadsheet initialization cleanup will be retried", error);
  }
};

const initializedSpreadsheetDraft = (
  response: ResponseWithSnapshot | null
): response is ResponseWithSnapshot =>
  response !== null &&
  response.status === "draft" &&
  response.draftObjectKey !== null &&
  response.draftDocumentKey !== null &&
  response.spreadsheetInitialized;

export const initializeSpreadsheetResponse = async (
  response: ResponseWithSnapshot,
  dependencies: SpreadsheetInitializationDependencies = {}
): Promise<ResponseWithSnapshot> => {
  if (response.spreadsheetInitialized) {
    return response;
  }
  if (!response.draftObjectKey || !response.draftDocumentKey) {
    throw new Error("Spreadsheet response document is unavailable");
  }
  let sourceBytes: Uint8Array;
  try {
    sourceBytes = await readObject(response.draftObjectKey);
  } catch (error) {
    // A concurrent initializer may already have retired this old source object.
    const current = await prisma.response.findUnique({
      include: { prefillSnapshot: true },
      where: { id: response.id },
    });
    if (initializedSpreadsheetDraft(current)) {
      return current;
    }
    throw error;
  }
  const contract = await spreadsheetContractForTemplate(
    response.publishedTemplateId,
    readSpreadsheetWorkbook(sourceBytes)
  );
  const snapshot = (response.prefillSnapshot?.values ?? {}) as Record<
    string,
    unknown
  >;
  const locks = (response.prefillSnapshot?.lockedFields ?? {}) as Record<
    string,
    unknown
  >;
  const values = contract.fields
    .filter((field) => !field.computed && Object.hasOwn(snapshot, field.key))
    .map((field) => {
      const range = contract.locations[field.anchor] as SpreadsheetRange;
      const value = snapshot[field.key];
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean" &&
        value !== null
      ) {
        throw new Error("Invalid scalar Prefill value");
      }
      return {
        address: `${spreadsheetColumnName(range.firstColumn)}${range.firstRow + 1}`,
        value,
      };
    });
  const result = await (dependencies.processSpreadsheet ?? processSpreadsheet)(
    unprotectSpreadsheet(sourceBytes),
    { bindings: storedSpreadsheetBindings(contract), values }
  );
  const workbook = readSpreadsheetWorkbook(result.workbook);
  const state = resolveSpreadsheetContract(
    storedSpreadsheetBindings(contract),
    workbook
  );
  const locked = new Set(
    Object.keys(locks).filter((key) => locks[key] === true)
  );
  const bytes = protectSpreadsheet(
    resetSpreadsheetPicturePlaceholders(result.workbook, state, {
      lockPosition: true,
    }),
    state,
    locked
  );
  const nextObjectKey = objectKey(
    "responses",
    response.id,
    "draft",
    crypto.randomUUID(),
    "xlsx"
  );
  await prisma.objectCleanupIntent.create({
    data: {
      cleanupAfter: new Date(Date.now() + objectCleanupIntentGraceMs),
      objectKey: nextObjectKey,
    },
  });
  try {
    await (dependencies.putObject ?? putObject)(
      nextObjectKey,
      bytes,
      XLSX_CONTENT_TYPE
    );
    const won = await prisma.$transaction(async (tx) => {
      const updated = await tx.response.updateMany({
        data: {
          draftObjectKey: nextObjectKey,
          spreadsheetInitialized: true,
        },
        where: {
          draftDocumentKey: response.draftDocumentKey,
          draftObjectKey: response.draftObjectKey,
          id: response.id,
          spreadsheetInitialized: false,
          status: "draft",
        },
      });
      if (updated.count !== 1) {
        return false;
      }
      await tx.objectCleanupIntent.delete({
        where: { objectKey: nextObjectKey },
      });
      await tx.objectCleanupIntent.upsert({
        create: { objectKey: response.draftObjectKey as string },
        update: { cleanupAfter: new Date() },
        where: { objectKey: response.draftObjectKey as string },
      });
      return true;
    });
    if (!won) {
      await cleanupInitializationObjects([nextObjectKey]);
      const current = await prisma.response.findUnique({
        include: { prefillSnapshot: true },
        where: { id: response.id },
      });
      if (!initializedSpreadsheetDraft(current)) {
        throw new Error("The response changed while preparing Excel");
      }
      return current;
    }
    await cleanupInitializationObjects([response.draftObjectKey]);
    return {
      ...response,
      draftObjectKey: nextObjectKey,
      spreadsheetInitialized: true,
    };
  } catch (error) {
    await cleanupInitializationObjects([nextObjectKey]);
    throw error;
  }
};
