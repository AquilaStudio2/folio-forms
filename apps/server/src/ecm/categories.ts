import { Prisma, prisma } from "@onlyoffice/db";

import type { SpreadsheetBindings } from "../documents/spreadsheets/contract";
import type { FieldRuleContext } from "../forms/field-rules";
import { fail } from "../http/errors";
import type { EcmClient } from "./client";

const catalogScope = (ecm: EcmClient, context: FieldRuleContext): string =>
  ecm.categoryScope(
    JSON.stringify([
      context.form.id,
      context.authorization.actor.id,
      context.authorization.capability.leaseId,
      context.templateDraft.documentKey,
    ])
  );

export const loadAttachmentCategories = async (
  ecm: EcmClient,
  context: FieldRuleContext
): Promise<string[]> => {
  const scope = catalogScope(ecm, context);
  const categories = await ecm.categories();
  await prisma.$executeRaw(
    Prisma.sql`INSERT INTO "ecm_category_catalogs" ("scope_key", "names", "expires_at") VALUES (${scope}, ${JSON.stringify(categories)}::jsonb, ${new Date(Date.now() + 15 * 60_000)}) ON CONFLICT ("scope_key") DO UPDATE SET "names" = EXCLUDED."names", "expires_at" = EXCLUDED."expires_at"`
  );
  return categories;
};

export const validateAttachmentCategoryChanges = async (
  tx: Prisma.TransactionClient,
  ecm: EcmClient,
  context: FieldRuleContext,
  before: SpreadsheetBindings,
  after: SpreadsheetBindings
): Promise<void> => {
  const previous = new Map(
    [...before.fields, ...(before.table?.columns ?? [])].map((field) => [
      field.id,
      field,
    ])
  );
  const changed = [...after.fields, ...(after.table?.columns ?? [])].filter(
    (field) =>
      field.attachment?.category &&
      previous.get(field.id)?.attachment?.category !== field.attachment.category
  );
  if (!changed.length) {
    return;
  }
  const scope = catalogScope(ecm, context);
  const [catalog] = await tx.$queryRaw<{ names: unknown }[]>(
    Prisma.sql`SELECT "names" FROM "ecm_category_catalogs" WHERE "scope_key" = ${scope} AND "expires_at" > ${new Date()}`
  );
  if (
    !catalog ||
    !Array.isArray(catalog.names) ||
    changed.some(
      (field) =>
        !(catalog.names as unknown[]).includes(field.attachment?.category)
    )
  ) {
    fail(
      422,
      "attachment_category_unavailable",
      "โหลดรายการ Document Category ให้สำเร็จ แล้วเลือกหมวดจากรายการจริงก่อนบันทึก"
    );
  }
};
