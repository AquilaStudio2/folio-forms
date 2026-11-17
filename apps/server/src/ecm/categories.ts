import { Prisma, prisma } from "@onlyoffice/db";

import type { SpreadsheetBindings } from "../documents/spreadsheets/contract";
import { fail } from "../http/errors";
import type { EcmClient } from "./client";

export const loadAttachmentCategories = async (ecm: EcmClient) => {
  const categories = await ecm.categoryEntries();
  const templates = await prisma.storageTemplate.findMany({
    orderBy: [{ template_name: "asc" }, { id: "asc" }],
  });
  return { categories, templates };
};

/** Lock current local mappings until the Field write or publication commits. No provider lookup changes a frozen contract. */
export const validateAttachmentStorageMappings = async (
  tx: Prisma.TransactionClient,
  bindings: SpreadsheetBindings,
  previous?: SpreadsheetBindings
): Promise<void> => {
  const previousFields = previous
    ? [...previous.fields, ...(previous.table?.columns ?? [])]
    : [];
  // Draft edits may retain stale choices; publication passes no previous contract.
  const choices = [
    ...bindings.fields,
    ...(bindings.table?.columns ?? []),
  ].flatMap((field) => {
    const choice = field.attachment;
    const saved = previousFields.find(
      (entry) => entry.id === field.id
    )?.attachment;
    if (
      !choice ||
      (saved &&
        choice.mode === saved.mode &&
        choice.category === saved.category &&
        (choice.mode !== "template" ||
          (saved.mode === "template" &&
            choice.document_category_id === saved.document_category_id &&
            choice.storage_template_id === saved.storage_template_id &&
            choice.template_name === saved.template_name)))
    ) {
      return [];
    }
    return [choice];
  });
  for (const choice of choices) {
    if (choice.mode !== "template") {
      fail(
        422,
        "attachment_template_required",
        "กรุณาเลือกแม่แบบจัดเก็บเอกสารสำหรับแบบฟอร์มใหม่"
      );
    }
  }
  const ids = [
    ...new Set(
      choices.flatMap((choice) =>
        choice.mode === "template" && choice.storage_template_id
          ? [choice.storage_template_id]
          : []
      )
    ),
  ].toSorted();
  const mappings = ids.length
    ? await tx.$queryRaw<
        {
          id: string;
          document_category_id: number;
          template_name: string;
        }[]
      >(
        Prisma.sql`SELECT "id", "document_category_id", "template_name" FROM "storage_templates" WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "id" FOR SHARE`
      )
    : [];
  for (const choice of choices) {
    if (choice.mode !== "template") {
      continue;
    }
    if (!choice.storage_template_id && !choice.template_name) {
      continue;
    }
    const mapping = mappings.find(
      (entry) => entry.id === choice.storage_template_id
    );
    if (
      !mapping ||
      mapping.document_category_id !== choice.document_category_id ||
      mapping.template_name !== choice.template_name
    ) {
      fail(
        422,
        "attachment_template_stale",
        "แม่แบบจัดเก็บเอกสารเปลี่ยนแล้ว กรุณาเลือกใหม่ ข้อมูลร่างเดิมยังคงอยู่"
      );
    }
  }
};
