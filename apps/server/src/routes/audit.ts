import type { Prisma } from "@onlyoffice/db";
import { prisma } from "@onlyoffice/db";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Elysia } from "elysia";

import { safeAuditMetadata } from "../audit/events";
import {
  auditFilterValue,
  auditOutcomeValue,
  auditEventPageSize,
} from "../audit/query";
import { requireIdentity, requireAdmin } from "../auth/identity";
import { fail } from "../http/errors";
import { queryString, idPattern } from "../http/input";
import { paginationInfo, paginationPage } from "../http/pagination";
import type { JsonRecord } from "../model-types";
import { adminResultDate } from "../responses/query";
import type { RouteDependencies } from "./dependencies";

export function registerAuditRoutes(
  app: Elysia,
  _dependencies: Pick<RouteDependencies, never>
): void {
  app.get("/api/admin/audit-events", async ({ request, query }) => {
    const identity = await requireIdentity(request);
    requireAdmin(identity);
    const queryRecord = query as unknown as JsonRecord;
    const requestedPage = paginationPage(new URL(request.url).searchParams);
    const actorId = auditFilterValue(
      queryString(queryRecord, "actor"),
      "actor",
      64
    );
    const action = auditFilterValue(
      queryString(queryRecord, "action"),
      "action",
      80
    );
    const targetId = auditFilterValue(
      queryString(queryRecord, "target"),
      "target",
      200
    );
    const targetType = auditFilterValue(
      queryString(queryRecord, "targetType"),
      "targetType",
      80
    );
    const outcome = auditOutcomeValue(queryString(queryRecord, "outcome"));
    const from = adminResultDate(queryString(queryRecord, "from"), "from");
    const to = adminResultDate(queryString(queryRecord, "to"), "to");
    if (from && to && from > to) {
      fail(400, "invalid_request", "from must be before to");
    }
    if (actorId && !idPattern.test(actorId)) {
      fail(400, "invalid_request", "actor is invalid");
    }
    const and: Prisma.AuditEventWhereInput[] = [];
    if (actorId) {
      and.push({ actorId });
    }
    if (action) {
      and.push({ action });
    }
    if (targetId) {
      and.push({ targetId });
    }
    if (targetType) {
      and.push({ targetType });
    }
    if (outcome) {
      and.push({ outcome });
    }
    if (from || to) {
      and.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    }
    return prisma.$transaction(
      async (tx) => {
        const where: Prisma.AuditEventWhereInput =
          and.length > 0 ? { AND: and } : {};
        const total = await tx.auditEvent.count({ where });
        const pagination = paginationInfo({
          page: requestedPage,
          pageSize: auditEventPageSize,
          total,
        });
        const events = await tx.auditEvent.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            action: true,
            actorId: true,
            createdAt: true,
            id: true,
            outcome: true,
            safeMetadata: true,
            targetId: true,
            targetType: true,
          },
          skip: (pagination.page - 1) * pagination.pageSize,
          take: pagination.pageSize,
          where,
        });
        return {
          events: events.map((event) => ({
            action: event.action,
            actorId: event.actorId,
            createdAt: event.createdAt,
            id: event.id,
            outcome: event.outcome,
            safeMetadata: safeAuditMetadata(event.safeMetadata),
            targetId: event.targetId,
            targetType: event.targetType,
          })),
          pagination,
        };
      },
      { isolationLevel: "RepeatableRead" }
    );
  });
}
