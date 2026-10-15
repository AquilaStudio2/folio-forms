import { prisma } from "@onlyoffice/db";

import { readSpreadsheetPictureFrames } from "../documents/spreadsheets/pictures";
import type { SpreadsheetPictureFrame } from "../documents/spreadsheets/pictures";
import { readSpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
import { readObject } from "../storage";
import { spreadsheetContractForTemplate } from "./spreadsheet-fields";

/** The response's published version remains authoritative even after newer publication or draft resizing. */
export const spreadsheetPictureFramesForTemplate = async (
  publishedTemplateId: string
): Promise<SpreadsheetPictureFrame[]> => {
  const template = await prisma.publishedTemplate.findUnique({
    select: { objectKey: true },
    where: { id: publishedTemplateId },
  });
  if (!template) {
    throw new Error("Published spreadsheet template is unavailable");
  }
  const bytes = await readObject(template.objectKey);
  const contract = await spreadsheetContractForTemplate(
    publishedTemplateId,
    readSpreadsheetWorkbook(bytes)
  );
  return readSpreadsheetPictureFrames(bytes, contract);
};
