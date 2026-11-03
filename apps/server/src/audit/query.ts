import { AuditOutcome } from "@onlyoffice/db";

import { fail } from "../http/errors";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.

export const auditEventPageSize = 50;
export function auditFilterValue(
  value: string | undefined,
  key: string,
  maximumLength: number
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumLength) {
    fail(400, "invalid_request", `${key} is invalid`);
  }
  return trimmed;
}

export function auditOutcomeValue(
  value: string | undefined
): AuditOutcome | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== AuditOutcome.failure && value !== AuditOutcome.success) {
    fail(400, "invalid_request", "outcome is invalid");
  }
  return value;
}
