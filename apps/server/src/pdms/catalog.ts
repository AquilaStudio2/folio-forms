// oxlint-disable sort-keys -- Keep persisted scopes beside their capability counterparts.
import type { Prisma } from "@onlyoffice/db";
import { prisma } from "@onlyoffice/db";
import { z } from "zod";

import type { Identity } from "../auth/identity";
import type { SpreadsheetBindings } from "../documents/spreadsheets/contract";
import type {
  ActionEditorAuthorization,
  EditorCapabilityScope,
} from "../editor/authorization";
import type { EditorLeaseGrant } from "../editor/leases";
import { fail } from "../http/errors";
import { loadPdmsProjectNames, pdmsProjectSourceEnabled } from "./projects";
import type { PdmsProjectsConfiguration } from "./projects";

export interface PdmsProjectCatalog {
  sessionId: string;
  status: "ready" | "loading" | "error";
  names: string[];
}
export interface PdmsSelection {
  sessionId: string;
  bindingId: string;
  name: string;
  documentKey: string;
  leaseId: string;
  actorId: string;
}
export type PdmsEditorScope = Omit<
  EditorCapabilityScope,
  "action" | "operationId"
>;
export const hasPdmsProjectSource = (bindings: SpreadsheetBindings): boolean =>
  [...bindings.fields, ...(bindings.table?.columns ?? [])].some(
    (field) => field.source === "pdms-project-name"
  );
const uuid = z.uuid();
const catalogNames = z.array(z.string());
const visibleCatalog = (session: {
  id: string;
  status: string;
  names: unknown;
}): PdmsProjectCatalog => ({
  names: session.status === "ready" ? catalogNames.parse(session.names) : [],
  sessionId: session.id,
  status: ["ready", "error"].includes(session.status)
    ? (session.status as "ready" | "error")
    : "loading",
});

export const loadPdmsCatalogSession = async (
  sessionId: string,
  configuration: PdmsProjectsConfiguration | null
): Promise<PdmsProjectCatalog> => {
  const loadToken = crypto.randomUUID();
  const now = new Date();
  const claimed = await prisma.pdmsProjectCatalogSession.updateMany({
    data: {
      loadExpiresAt: new Date(now.getTime() + 30_000),
      loadToken,
      status: "loading",
    },
    where: {
      OR: [{ status: { not: "loading" } }, { loadExpiresAt: { lt: now } }],
      expiresAt: { gt: now },
      id: sessionId,
      status: { not: "ready" },
    },
  });
  if (claimed.count) {
    try {
      const names = await loadPdmsProjectNames(configuration);
      await prisma.pdmsProjectCatalogSession.updateMany({
        data: {
          loadExpiresAt: null,
          loadToken: null,
          names,
          status: "ready",
        },
        where: { id: sessionId, loadToken, status: "loading" },
      });
    } catch {
      // Upstream errors, names and credentials must never enter application logs.
      await prisma.pdmsProjectCatalogSession.updateMany({
        data: { loadExpiresAt: null, loadToken: null, status: "error" },
        where: { id: sessionId, loadToken, status: "loading" },
      });
    }
  }
  let current = await prisma.pdmsProjectCatalogSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
  // Concurrent config/renewal requests share the persisted loading claim. Wait
  // for its bounded result so an abandoned first HTTP response cannot strand
  // the surviving editor with a permanently loading picker.
  const deadline = Date.now() + 31_000;
  while (current.status === "loading" && Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Observe one shared external load without making another provider request.
    await Bun.sleep(50);
    // oxlint-disable-next-line no-await-in-loop -- Each read depends on the prior load state.
    current = await prisma.pdmsProjectCatalogSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
  }
  if (
    current.status === "loading" &&
    current.loadExpiresAt &&
    current.loadExpiresAt <= new Date()
  ) {
    await prisma.pdmsProjectCatalogSession.updateMany({
      where: {
        id: sessionId,
        status: "loading",
        loadExpiresAt: { lte: new Date() },
      },
      data: { status: "error", loadToken: null, loadExpiresAt: null },
    });
    current = await prisma.pdmsProjectCatalogSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
  }
  return visibleCatalog(current);
};

export const openPdmsProjectCatalog = async (input: {
  bindings: SpreadsheetBindings;
  identity: Identity;
  scope: PdmsEditorScope;
  lease: EditorLeaseGrant;
  openingId?: string;
  configuration: PdmsProjectsConfiguration | null;
}): Promise<PdmsProjectCatalog | null> => {
  if (!pdmsProjectSourceEnabled() || !hasPdmsProjectSource(input.bindings)) {
    return null;
  }
  const openingId = input.openingId ?? crypto.randomUUID();
  if (!uuid.safeParse(openingId).success) {
    fail(400, "invalid_request", "Editor opening is invalid");
  }
  const { identity, scope, lease } = input;
  const session = await prisma.pdmsProjectCatalogSession.upsert({
    create: {
      actorId: identity.id,
      authSessionId: identity.sessionId,
      documentKey: scope.documentKey,
      expiresAt: identity.expiresAt,
      formId: scope.formId,
      leaseId: lease.id,
      openingId,
      targetId: scope.targetId,
      targetType: scope.targetType,
    },
    update: {},
    where: { openingId_leaseId: { leaseId: lease.id, openingId } },
  });
  if (
    session.actorId !== identity.id ||
    session.authSessionId !== identity.sessionId ||
    session.targetId !== scope.targetId ||
    session.targetType !== scope.targetType ||
    session.formId !== scope.formId ||
    session.documentKey !== scope.documentKey ||
    session.expiresAt <= new Date()
  ) {
    fail(409, "pdms_session_stale", "กรุณาเปิดตัวแก้ไขใหม่เพื่อยืนยันรายการโครงการ");
  }
  if (session.status === "ready" || session.status === "error") {
    return visibleCatalog(session);
  }
  return loadPdmsCatalogSession(session.id, input.configuration);
};

export const requirePdmsCatalogSession = async (
  authorization: ActionEditorAuthorization,
  scope: PdmsEditorScope,
  sessionId: unknown,
  requireReady = false
) => {
  if (!pdmsProjectSourceEnabled() || !uuid.safeParse(sessionId).success) {
    fail(409, "pdms_session_stale", "กรุณาเปิดตัวแก้ไขเพื่อยืนยันรายการโครงการ");
  }
  const session = await prisma.pdmsProjectCatalogSession.findUnique({
    where: { id: sessionId as string },
  });
  if (
    !session ||
    authorization.capability.pdmsCatalogSessionId !== session.id ||
    session.actorId !== authorization.actor.id ||
    session.leaseId !== authorization.capability.leaseId ||
    session.formId !== scope.formId ||
    session.targetId !== scope.targetId ||
    session.targetType !== scope.targetType ||
    session.documentKey !== scope.documentKey ||
    session.expiresAt <= new Date()
  ) {
    fail(
      409,
      "pdms_session_stale",
      "รายการโครงการไม่ตรงกับตัวแก้ไขปัจจุบัน กรุณาเปิดใหม่"
    );
  }
  if (requireReady && session.status !== "ready") {
    fail(422, "pdms_catalog_required", "โหลดรายการโครงการให้สำเร็จก่อนส่งคำตอบ");
  }
  return session;
};

const selectionRequest = z
  .object({
    bindingId: z.string(),
    name: z.string().min(1).max(100_000),
    sessionId: z.uuid(),
  })
  .strict();
// oxlint-disable-next-line complexity -- Validate source, immutable catalog and scalar target together before creating trusted operation metadata.
export const pdmsOperationContext = async (input: {
  authorization: ActionEditorAuthorization;
  scope: PdmsEditorScope;
  bindings: SpreadsheetBindings;
  sessionId?: unknown;
  selection?: unknown;
  requireReady?: boolean;
}): Promise<{
  pdmsCatalogSessionId?: string;
  pdmsSelection?: PdmsSelection;
}> => {
  if (!hasPdmsProjectSource(input.bindings)) {
    if (input.selection !== undefined || input.sessionId !== undefined) {
      fail(400, "invalid_pdms_selection", "ไม่พบช่องโครงการในฟอร์มนี้");
    }
    return {};
  }
  if (
    input.selection === undefined &&
    input.sessionId === undefined &&
    !input.requireReady
  ) {
    return {};
  }
  const parsed =
    input.selection === undefined
      ? null
      : selectionRequest.safeParse(input.selection);
  if (parsed && !parsed.success) {
    fail(400, "invalid_pdms_selection", "การเลือกโครงการไม่ถูกต้อง");
  }
  const request = parsed?.success ? parsed.data : null;
  if (
    request &&
    input.sessionId !== undefined &&
    request.sessionId !== input.sessionId
  ) {
    fail(400, "invalid_pdms_selection", "รายการโครงการไม่ตรงกับการเลือก");
  }
  const session = await requirePdmsCatalogSession(
    input.authorization,
    input.scope,
    request?.sessionId ?? input.sessionId,
    input.requireReady || Boolean(request)
  );
  if (!request) {
    return { pdmsCatalogSessionId: session.id };
  }
  const field = input.bindings.fields.find(
    (candidate) => candidate.id === request.bindingId
  );
  if (
    !field ||
    field.source !== "pdms-project-name" ||
    !catalogNames.parse(session.names).includes(request.name)
  ) {
    fail(422, "invalid_pdms_selection", "เลือกชื่อโครงการจากรายการปัจจุบัน");
  }
  return {
    pdmsCatalogSessionId: session.id,
    pdmsSelection: {
      ...request,
      actorId: session.actorId,
      documentKey: input.scope.documentKey,
      leaseId: session.leaseId,
    },
  };
};

export const advancePdmsCatalogSession = async (
  tx: Prisma.TransactionClient,
  sessionId: string | undefined,
  documentKey: string,
  nextDocumentKey: string
): Promise<void> => {
  if (!sessionId) {
    return;
  }
  const updated = await tx.pdmsProjectCatalogSession.updateMany({
    data: { documentKey: nextDocumentKey },
    where: { documentKey, id: sessionId },
  });
  if (updated.count !== 1) {
    fail(409, "pdms_session_stale", "รายการโครงการเปลี่ยนระหว่างบันทึก");
  }
};
