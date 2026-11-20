import { auth } from "@onlyoffice/auth";
import { prisma } from "@onlyoffice/db";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Elysia } from "elysia";

import { identityFor } from "../auth/identity";
import {
  handleEmailSignIn,
  passwordMinimumLength,
  passwordMaximumLength,
} from "../auth/password-session";
import { fail } from "../http/errors";
import {
  legacyJsonBodyMaximumBytes,
  readJsonRecord,
  readRequestBytes,
} from "../http/input";
import type { RouteDependencies } from "./dependencies";

export function registerSessionRoutes(
  app: Elysia,
  dependencies: Pick<RouteDependencies, "requestIp">
): void {
  const { requestIp } = dependencies;
  app
    .post(
      "/api/auth/sign-in/email",
      async ({ request, server }) => {
        const sourceIp =
          requestIp?.(request) ??
          server?.requestIP(request)?.address ??
          "unknown";
        // Keep sign-in's existing non-object rejection instead of changing it to a JSON-record error.
        const body: unknown = request.body
          ? JSON.parse(
              new TextDecoder().decode(
                await readRequestBytes(request, legacyJsonBodyMaximumBytes)
              )
            )
          : undefined;
        return handleEmailSignIn(request, body, sourceIp);
      },
      { parse: "none" }
    )
    .get("/api/session", async ({ request }) => {
      const identity = await identityFor(request);
      if (!identity) {
        fail(401, "unauthorized", "Authentication is required");
      }
      return {
        session: { expiresAt: identity.expiresAt, isSso: identity.isSso },
        user: {
          email: identity.email,
          id: identity.id,
          mustChangePassword: identity.mustChangePassword && !identity.isSso,
          name: identity.name,
          role: identity.role,
        },
      };
    });
}

export function registerPasswordRoutes(app: Elysia): void {
  app.post(
    "/api/account/password",
    async ({ request }) => {
      const identity = await identityFor(request);
      if (!identity) {
        fail(401, "unauthorized", "Authentication is required");
      }
      const input = await readJsonRecord(request, legacyJsonBodyMaximumBytes);
      const { currentPassword, newPassword } = input;
      if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string"
      ) {
        fail(
          400,
          "invalid_request",
          "currentPassword and newPassword are required"
        );
      }
      if (newPassword.length < passwordMinimumLength) {
        fail(
          400,
          "password_too_short",
          `Password must contain at least ${passwordMinimumLength} characters`
        );
      }
      if (newPassword.length > passwordMaximumLength) {
        fail(
          400,
          "password_too_long",
          `Password must contain at most ${passwordMaximumLength} characters`
        );
      }
      if (
        currentPassword.length < passwordMinimumLength ||
        currentPassword.length > passwordMaximumLength
      ) {
        fail(400, "invalid_current_password", "Current password is invalid");
      }
      const authContext = await auth.$context;

      const account = await prisma.account.findFirst({
        where: { providerId: "credential", userId: identity.id },
      });
      const currentHash = account?.password;
      if (
        !account ||
        !currentHash ||
        !(await authContext.password.verify({
          hash: currentHash,
          password: currentPassword,
        }))
      ) {
        fail(400, "invalid_current_password", "Current password is invalid");
      }

      const passwordHash = await authContext.password.hash(newPassword);
      await prisma.$transaction(async (tx) => {
        const update = await tx.account.updateMany({
          data: { password: passwordHash },
          where: { id: account.id, password: currentHash },
        });
        if (update.count !== 1) {
          fail(409, "credential_changed", "Credential changed concurrently");
        }
        await tx.user.update({
          data: { mustChangePassword: false },
          where: { id: identity.id },
        });
        await tx.session.deleteMany({ where: { userId: identity.id } });
      });
      return { ok: true };
    },
    { parse: "none" }
  );
}

export function registerSessionExitRoutes(app: Elysia): void {
  app

    .post("/api/auth/sign-out", async ({ request }) => {
      const identity = await identityFor(request);
      if (identity) {
        await prisma.session.deleteMany({
          where: { id: identity.sessionId },
        });
      }
      return { ok: true };
    })
    .all("/api/auth/*", () =>
      Response.json(
        { error: "not_found", message: "Authentication route was not found" },
        { status: 404 }
      )
    );
}
