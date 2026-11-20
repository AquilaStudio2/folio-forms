import { prisma } from "@onlyoffice/db";
import type { Elysia } from "elysia";

import { loadAttachmentCategories } from "../ecm/categories";
import type { EcmClient } from "../ecm/client";
import { requireFieldRuleContext } from "../forms/field-rules";
import { spreadsheetDraftBindings } from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";

export const registerSpreadsheetAuthoringRoutes = (
  app: Elysia,
  ecm: EcmClient
): void => {
  app
    .get(
      "/api/admin/forms/:publicId/attachment-categories",
      async ({ request, params }) => {
        const context = await requireFieldRuleContext(request, params.publicId);
        if (context.form.documentKind !== "xlsx") {
          fail(409, "invalid_field_config", "แบบฟอร์มนี้ไม่รองรับช่องแนบ Excel");
        }
        return await loadAttachmentCategories(ecm);
      }
    )
    .get(
      "/api/admin/forms/:publicId/spreadsheet-bindings",
      async ({ request, params }) => {
        const { form, templateDraft } = await requireFieldRuleContext(
          request,
          params.publicId
        );
        if (form.documentKind !== "xlsx") {
          fail(409, "invalid_field_config", "แบบฟอร์มนี้ไม่รองรับการตั้งค่าช่อง Excel");
        }
        return await prisma.$transaction(
          async (tx) => {
            const draft = await tx.templateDraft.findUniqueOrThrow({
              where: { id: templateDraft.id },
            });
            return {
              bindings: await spreadsheetDraftBindings(draft.id, tx),
              documentKey: draft.documentKey,
              revision: draft.bindingRevision,
            };
          },
          { isolationLevel: "RepeatableRead" }
        );
      }
    )
    .patch("/api/admin/forms/:publicId/spreadsheet-bindings", () =>
      fail(
        409,
        "xlsx_draft_upgrade_required",
        "กรุณาเปิดตัวแก้ไข Excel รุ่นล่าสุดแล้วลองอีกครั้ง"
      )
    )
    .post("/api/admin/forms/:publicId/spreadsheet-bindings/recover", () =>
      fail(
        409,
        "xlsx_draft_upgrade_required",
        "กรุณาเปิดตัวแก้ไข Excel รุ่นล่าสุดแล้วลองอีกครั้ง"
      )
    );
};
