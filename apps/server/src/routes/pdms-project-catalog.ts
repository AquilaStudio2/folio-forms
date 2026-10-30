import { prisma } from "@onlyoffice/db";
import type { Elysia } from "elysia";
import { z } from "zod";

import type { ActionEditorAuthorization } from "../editor/authorization";
import {
  requireActionEditorAuthorization,
  requireEditorScope,
} from "../editor/authorization";
import { requireActiveEditorLease } from "../editor/leases";
import {
  spreadsheetBindingsForTemplate,
  spreadsheetDraftBindings,
} from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";
import { documentActionBodyMaximumBytes, readJsonRecord } from "../http/input";
import type { PdmsEditorScope } from "../pdms/catalog";
import {
  hasPdmsProjectSource,
  loadPdmsCatalogSession,
  requirePdmsCatalogSession,
} from "../pdms/catalog";
import type { RouteDependencies } from "./dependencies";

const retryRequest = z
  .object({ documentKey: z.string().min(1), sessionId: z.uuid() })
  .strict();

const currentBindings = async (
  authorization: ActionEditorAuthorization,
  scope: PdmsEditorScope
) => {
  const { actor, capability } = authorization;
  if (scope.targetType === "template-draft") {
    const draft =
      actor.role === "admin"
        ? await prisma.templateDraft.findFirst({
            where: {
              documentKey: scope.documentKey,
              form: { documentKind: "xlsx", status: "draft" },
              formId: scope.formId,
              id: scope.targetId,
            },
          })
        : null;
    if (!draft) {
      fail(409, "pdms_session_stale", "ตัวแก้ไขโครงการไม่เป็นปัจจุบัน กรุณาเปิดใหม่");
    }
    return spreadsheetDraftBindings(draft.id);
  }
  const response = await prisma.response.findFirst({
    include: {
      submissions: {
        include: { corrections: { orderBy: { revision: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    where: {
      form: { documentKind: "xlsx" },
      formId: scope.formId,
      id: scope.targetId,
      ...(scope.targetType === "response"
        ? {
            draftDocumentKey: scope.documentKey,
            status: "draft",
            userId: actor.id,
          }
        : { status: "submitted" }),
    },
  });
  if (
    !response ||
    (scope.targetType === "correction" && actor.role !== "admin")
  ) {
    fail(409, "pdms_session_stale", "ตัวแก้ไขโครงการไม่เป็นปัจจุบัน กรุณาเปิดใหม่");
  }
  if (scope.targetType === "correction") {
    const [submission] = response.submissions;
    const latest = submission?.corrections[0];
    const workspace = await prisma.editorLease.findFirst({
      where: {
        id: capability.leaseId,
        workspaceBaseDocumentKey:
          latest?.documentKey ?? submission?.documentKey,
        workspaceBaseRevision: latest?.revision ?? 0,
        workspaceDocumentKey: scope.documentKey,
      },
    });
    if (!submission || !workspace?.workspaceObjectKey) {
      fail(409, "pdms_session_stale", "ตัวแก้ไขโครงการไม่เป็นปัจจุบัน กรุณาเปิดใหม่");
    }
  }
  return spreadsheetBindingsForTemplate(response.publishedTemplateId);
};

export const registerPdmsProjectCatalogRoutes = (
  app: Elysia,
  dependencies: Pick<RouteDependencies, "pdmsProjects">
): void => {
  app.post("/api/editor/pdms-project-catalog/retry", async ({ request }) => {
    const authorization = await requireActionEditorAuthorization(request);
    const input = retryRequest.safeParse(
      await readJsonRecord(request, documentActionBodyMaximumBytes)
    );
    if (!input.success) {
      fail(400, "invalid_request", "คำขอรายการโครงการไม่ถูกต้อง");
    }
    const { capability } = authorization;
    const scope = {
      documentKey: input.data.documentKey,
      formId: capability.formId,
      targetId: capability.targetId,
      targetType: capability.targetType,
    };
    let action = "save-draft" as
      | "save-draft"
      | "submit"
      | "configure-fields"
      | "save-correction";
    if (scope.targetType === "template-draft") {
      action = "configure-fields";
    } else if (scope.targetType === "correction") {
      action = "save-correction";
    } else if (capability.action === "submit") {
      action = "submit";
    }
    requireEditorScope(authorization, { ...scope, action });
    await requireActiveEditorLease(authorization, scope);
    await requirePdmsCatalogSession(authorization, scope, input.data.sessionId);
    if (!hasPdmsProjectSource(await currentBindings(authorization, scope))) {
      fail(409, "pdms_session_stale", "ไม่พบช่องโครงการในตัวแก้ไขปัจจุบัน");
    }
    const pdmsProjectCatalog = await loadPdmsCatalogSession(
      input.data.sessionId,
      dependencies.pdmsProjects
    );
    // The network load can outlive a lease or a concurrent save. Never attach its
    // result to an editor whose canonical document changed while waiting.
    await requireActiveEditorLease(authorization, scope);
    await requirePdmsCatalogSession(authorization, scope, input.data.sessionId);
    if (!hasPdmsProjectSource(await currentBindings(authorization, scope))) {
      fail(409, "pdms_session_stale", "ไม่พบช่องโครงการในตัวแก้ไขปัจจุบัน");
    }
    return { pdmsProjectCatalog };
  });
};
