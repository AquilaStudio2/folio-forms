// oxlint-disable func-style complexity -- Authentication finalization keeps its transaction checks together.
import { randomBytes } from "node:crypto";

import { auth } from "@onlyoffice/auth";
import { AuditOutcome, Prisma, prisma } from "@onlyoffice/db";

import {
  accountMutationLockId,
  requireAnotherEnabledAdmin,
} from "../accounts/mutations";
import type { AiAuthoringSessions } from "../ai-authoring";
import { createAccountAudit } from "../audit/events";
import { endAiAuthoringSessions } from "../auth/password-session";
import { fail } from "../http/errors";
import {
  legacySsoSessionIdentifier,
  legacySsoSwitchIdentifier,
} from "./config";
import type { LegacySsoConfig, LegacySsoRoleEvidence } from "./config";

export const legacySsoSessionTransferLifetimeSeconds = 60;

interface SwitchProof {
  id: string;
  value: string;
  initiatingSessionId: string;
  initiatingUserId: string;
  initiatingEmail: string;
  initiatingName: string;
  initiatingRole: "admin" | "viewer" | "user";
  targetEmail: string;
  targetName: string;
  targetRole: "admin" | "viewer" | "user";
}

export async function finalizeLegacySsoLogin(
  config: LegacySsoConfig,
  evidence: LegacySsoRoleEvidence,
  now: Date,
  aiAuthoring: AiAuthoringSessions,
  switchProof?: SwitchProof
): Promise<{ transferId: string; role: "admin" | "viewer" | "user" }> {
  const authContext = await auth.$context;
  // The token stays private until all role and handoff writes have committed.
  const session = await authContext.internalAdapter.createSession(
    evidence.targetUserId,
    false,
    { isSso: true },
    true
  );
  const transferId = randomBytes(32).toString("base64url");
  let finalized;
  try {
    finalized = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${accountMutationLockId})`;
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "user" WHERE "id" = ${evidence.targetUserId} FOR UPDATE`
      );
      const user = await tx.user.findUnique({
        where: { id: evidence.targetUserId },
      });
      const account = await tx.account.findUnique({
        where: {
          providerId_accountId: {
            accountId: evidence.subject,
            providerId: evidence.providerId,
          },
        },
      });
      const preparedSession = await tx.session.findUnique({
        where: { id: session.id },
      });
      const generation = BigInt(evidence.generation);
      if (
        evidence.providerId !== config.providerId ||
        !user?.enabled ||
        account?.userId !== user.id ||
        !preparedSession ||
        preparedSession.userId !== user.id ||
        preparedSession.expiresAt.getTime() <= now.getTime() ||
        (account.lastSsoRoleGeneration !== null &&
          generation <= account.lastSsoRoleGeneration)
      ) {
        fail(409, "legacy_sso_stale", "The SSO login is no longer current");
      }
      const linkRequest = await tx.legacyAccountLinkRequest.findUnique({
        where: {
          providerId_subject: {
            providerId: evidence.providerId,
            subject: evidence.subject,
          },
        },
      });
      if (
        linkRequest?.reviewedGeneration !== null &&
        linkRequest?.reviewedGeneration !== undefined &&
        generation <= linkRequest.reviewedGeneration
      ) {
        fail(
          409,
          "legacy_sso_stale",
          "The SSO login predates the account review"
        );
      }
      const role =
        account.lastMappedRole === evidence.mappedRole
          ? user.role
          : evidence.mappedRole;
      if (switchProof) {
        const initiatingSession = await tx.session.findUnique({
          include: { user: true },
          where: { id: switchProof.initiatingSessionId },
        });
        if (
          !initiatingSession ||
          initiatingSession.userId !== switchProof.initiatingUserId ||
          !initiatingSession.user.enabled ||
          initiatingSession.expiresAt.getTime() <= now.getTime() ||
          initiatingSession.user.email !== switchProof.initiatingEmail ||
          initiatingSession.user.name !== switchProof.initiatingName ||
          initiatingSession.user.role !== switchProof.initiatingRole ||
          user.email !== switchProof.targetEmail ||
          user.name !== switchProof.targetName ||
          role !== switchProof.targetRole
        ) {
          fail(409, "legacy_sso_stale", "The account switch changed");
        }
        const consumed = await tx.verification.deleteMany({
          where: {
            expiresAt: { gt: now },
            id: switchProof.id,
            identifier: legacySsoSwitchIdentifier,
            value: switchProof.value,
          },
        });
        if (consumed.count !== 1) {
          fail(
            409,
            "legacy_sso_stale",
            "The account switch is no longer current"
          );
        }
      }
      const roleChanged = role !== user.role;
      if (roleChanged && user.role === "admin" && role !== "admin") {
        await requireAnotherEnabledAdmin(tx);
      }
      const oldSessions = roleChanged
        ? await tx.session.findMany({
            select: { id: true },
            where: { id: { not: session.id }, userId: user.id },
          })
        : [];
      if (roleChanged) {
        await tx.user.update({ data: { role }, where: { id: user.id } });
        await tx.session.deleteMany({
          where: { id: { not: session.id }, userId: user.id },
        });
      }
      if (roleChanged || account.lastMappedRole !== evidence.mappedRole) {
        await createAccountAudit(tx, {
          action: "sync_legacy_sso_role",
          actorId: null,
          outcome: AuditOutcome.success,
          safeMetadata: {
            mappedRole: evidence.mappedRole,
            previousMappedRole: account.lastMappedRole,
            previousRole: user.role,
            role,
            source: "pdms_sso",
          },
          targetId: user.id,
        });
      }
      await tx.account.update({
        data: {
          lastMappedRole: evidence.mappedRole,
          lastSsoRoleGeneration: generation,
        },
        where: { id: account.id },
      });
      await tx.verification.create({
        data: {
          expiresAt: new Date(
            now.getTime() + legacySsoSessionTransferLifetimeSeconds * 1000
          ),
          id: transferId,
          identifier: legacySsoSessionIdentifier,
          value: session.token,
        },
      });
      return { ownerSessionIds: oldSessions.map(({ id }) => id), role };
    });
  } catch (error) {
    try {
      await authContext.internalAdapter.deleteSession(session.token);
    } catch {
      console.error("Could not remove unpublished SSO session");
    }
    throw error;
  }
  try {
    await endAiAuthoringSessions(aiAuthoring, finalized.ownerSessionIds);
  } catch {
    // Revocation and the new login are committed; failed resource cleanup must not undo them.
    console.error("Could not finish authoring cleanup after SSO role change");
  }
  return { role: finalized.role, transferId };
}
