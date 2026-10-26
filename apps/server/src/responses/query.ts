import { ResponseStatus, prisma } from "@onlyoffice/db";
import type { DocumentKind, Prisma } from "@onlyoffice/db";

import type { Identity, Actor } from "../auth/identity";
import { manifestFieldsWithDocumentMetadata } from "../forms/query";
import { fail } from "../http/errors";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import { idPattern, validateId, jsonRecord } from "../http/input";
import type {
  Response,
  JsonRecord,
  Submission,
  ResponseWithSnapshot,
  Correction,
  SubmissionWithManifest,
  SubmissionWithRevisions,
} from "../model-types";

export const adminResultPageSize = 25;

export async function responseIdsWithLatestCorrection(
  revision: number,
  where: Prisma.ResponseWhereInput
): Promise<string[]> {
  const limit = adminResultPageSize + 1;
  const ids: string[] = [];
  let after: AdminResultCursor | undefined;
  // Prisma relation filters cannot express "the latest related row". Scan small
  // ordered batches and fill the page with matches, rather than filtering one
  // page (which could hide later matches) or loading every response into memory.
  while (ids.length < limit) {
    const batch = await prisma.response.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        submissions: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            corrections: {
              orderBy: { revision: "desc" },
              select: { revision: true },
              take: 1,
            },
          },
          take: 1,
        },
        updatedAt: true,
      },
      take: limit,
      where: {
        AND: [
          where,
          // A positive revision must exist somewhere on this response, but it
          // still needs to belong to the latest submission below.
          ...(revision > 0 ? [{ corrections: { some: { revision } } }] : []),
          ...(after
            ? [
                {
                  OR: [
                    { updatedAt: { lt: after.updatedAt } },
                    { id: { lt: after.id }, updatedAt: after.updatedAt },
                  ],
                },
              ]
            : []),
        ],
      },
    });
    for (const response of batch) {
      if (
        (response.submissions[0]?.corrections[0]?.revision ?? 0) === revision
      ) {
        ids.push(response.id);
        if (ids.length === limit) {
          return ids;
        }
      }
    }
    if (batch.length < limit) {
      break;
    }
    after = batch.at(-1);
  }
  return ids;
}

interface AdminResultCursor {
  id: string;
  updatedAt: Date;
}

export function adminResultCursor(
  value: string | undefined
): AdminResultCursor | null {
  if (value === undefined) {
    return null;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf-8")
    ) as { id?: unknown; updatedAt?: unknown };
    if (
      typeof decoded.id !== "string" ||
      !idPattern.test(decoded.id) ||
      typeof decoded.updatedAt !== "string"
    ) {
      fail(400, "invalid_request", "cursor is invalid");
    }
    const updatedAt = new Date(decoded.updatedAt);
    if (!Number.isFinite(updatedAt.getTime())) {
      fail(400, "invalid_request", "cursor is invalid");
    }
    return { id: decoded.id, updatedAt };
  } catch {
    fail(400, "invalid_request", "cursor is invalid");
  }
}

export function adminResultCursorValue(result: {
  id: string;
  updatedAt: Date;
}): string {
  return Buffer.from(
    JSON.stringify({ id: result.id, updatedAt: result.updatedAt.toISOString() })
  ).toString("base64url");
}

const isoDatePattern =
  /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z)?$/;

export function adminResultDate(
  value: string | undefined,
  key: string
): Date | null {
  if (value === undefined) {
    return null;
  }
  const match = isoDatePattern.exec(value);
  const date = match ? new Date(value) : null;
  // Date rolls impossible days over; a round trip on the date part detects it.
  if (
    !match ||
    !date ||
    !Number.isFinite(date.getTime()) ||
    new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]
  ) {
    fail(400, "invalid_request", `${key} is invalid`);
  }
  return date;
}

export function responseSummary(
  response: Response,
  extra: {
    documentKind?: DocumentKind;
    formPublicId?: string;
    formTitle?: string;
    latestCorrectionNumber?: number | null;
    submissionId?: string | null;
    submittedAt?: Date | null;
  } = {}
): JsonRecord {
  return {
    createdAt: response.createdAt,
    documentKind: extra.documentKind,
    formPublicId: extra.formPublicId,
    formTitle: extra.formTitle,
    hasDraft: Boolean(response.draftObjectKey && response.draftData),
    id: response.id,
    latestCorrectionNumber: extra.latestCorrectionNumber,
    publishedVersion: response.publishedVersion,
    status: response.status,
    submissionId: extra.submissionId,
    submittedAt: extra.submittedAt,
    updatedAt: response.updatedAt,
  };
}

export function submissionSummary(
  submission: Submission,
  extra: {
    documentKind?: DocumentKind;
    formPublicId?: string;
    formTitle?: string;
    userEmail?: string;
  } = {}
): JsonRecord {
  return {
    createdAt: submission.createdAt,
    documentKind: extra.documentKind,
    formPublicId: extra.formPublicId,
    formTitle: extra.formTitle,
    id: submission.id,
    responseId: submission.responseId,
    status: "submitted",
    submittedAt: submission.createdAt,
    userEmail: extra.userEmail,
    userId: submission.userId,
  };
}

export function adminResultSummary(response: {
  createdAt: Date;
  form: { documentKind: DocumentKind; publicId: string; title: string };
  id: string;
  owner: { email: string };
  status: ResponseStatus;
  submissions: {
    createdAt: Date;
    id: string;
    corrections: { revision: number }[];
  }[];
  updatedAt: Date;
}): JsonRecord {
  const submitted = response.status === ResponseStatus.submitted;
  const submission = response.submissions[0] ?? null;
  return {
    createdAt: response.createdAt,
    documentKind: response.form.documentKind,
    formPublicId: response.form.publicId,
    formTitle: response.form.title,
    id: response.id,
    latestCorrectionNumber: submission?.corrections[0]?.revision ?? null,
    state: submitted ? "submitted" : "draft",
    submissionId: submission?.id ?? null,
    submittedAt: submission?.createdAt ?? null,
    updatedAt: response.updatedAt,
    userEmail: response.owner.email,
  };
}

export async function findOwnedResponse(
  responseId: string,
  formId: string,
  userId: string
): Promise<ResponseWithSnapshot> {
  validateId(responseId, "Response");
  const response = await prisma.response.findFirst({
    include: { prefillSnapshot: true },
    where: { formId, id: responseId, userId },
  });
  if (!response) {
    fail(404, "not_found", "Response was not found");
  }
  return response;
}

export function canReadSubmission(
  identity: Identity,
  submission: Submission
): void {
  if (identity.role === "admin") {
    return;
  }
  if (submission.userId !== identity.id) {
    fail(403, "forbidden", "You may only access your own submission");
  }
}

export interface CorrectionRevisionSummary {
  actorEmail: string | null;
  actorName: string | null;
  createdAt: Date;
  data: JsonRecord;
  documentAvailable: boolean;
  documentKey: string;
  id: string | null;
  reason: string | null;
  revision: number;
  pictures: Record<string, boolean> | null;
}
type RevisionSelector = number | "latest";

export function revisionSelector(value: unknown): RevisionSelector {
  if (value === undefined || value === "latest") {
    return "latest";
  }
  if (value === "original") {
    return 0;
  }
  if (typeof value === "string" && /^(?:0|[1-9]\d*)$/u.test(value)) {
    const revision = Number(value);
    if (Number.isSafeInteger(revision)) {
      return revision;
    }
  }
  fail(
    400,
    "invalid_request",
    "revision must be latest, original, or a revision number"
  );
}

export function selectedSubmissionRevision(
  submission: Submission & { corrections: Correction[] },
  selector: RevisionSelector
): {
  correction: Correction | null;
  data: JsonRecord;
  documentKey: string;
  objectKey: string;
  revision: number;
} {
  const corrections = submission.corrections.filter(
    (correction) => correction.submissionId === submission.id
  );
  const revision =
    selector === "latest" ? (corrections[0]?.revision ?? 0) : selector;
  if (revision > 0 && !corrections.some((item) => item.revision === revision)) {
    fail(404, "not_found", "Submission revision was not found");
  }
  const correction =
    revision === 0
      ? null
      : (corrections.find((item) => item.revision === revision) ?? null);
  return {
    correction,
    data: jsonRecord(correction?.data ?? submission.data),
    documentKey: correction?.documentKey ?? submission.documentKey,
    objectKey: correction?.objectKey ?? submission.objectKey,
    revision,
  };
}

export function correctionRevisionSummary(
  correction: Correction,
  actor: Pick<Actor, "email" | "name"> | undefined,
  documentAvailable: boolean,
  pictures: Record<string, boolean> | null
): CorrectionRevisionSummary {
  return {
    actorEmail: actor?.email ?? null,
    actorName: actor?.name ?? null,
    createdAt: correction.createdAt,
    data: jsonRecord(correction.data),
    documentAvailable,
    documentKey: correction.documentKey,
    id: correction.id,
    pictures,
    reason: correction.reason,
    revision: correction.revision,
  };
}

export function findSubmissionWithRevisions(
  id: string,
  includeFieldManifest: true
): Promise<SubmissionWithManifest | null>;
export function findSubmissionWithRevisions(
  id: string,
  includeFieldManifest?: false
): Promise<SubmissionWithRevisions | null>;
export function findSubmissionWithRevisions(
  id: string,
  includeFieldManifest = false
): Promise<SubmissionWithManifest | SubmissionWithRevisions | null> {
  return prisma.submission.findUnique({
    include: {
      corrections: { orderBy: { revision: "desc" } },
      form: true,
      owner: true,
      ...(includeFieldManifest
        ? {
            response: {
              include: {
                publishedTemplate: {
                  include: {
                    manifest: {
                      include: {
                        fields: { orderBy: { position: "asc" } },
                      },
                    },
                  },
                },
              },
            },
          }
        : {}),
    },
    where: { id },
  });
}
export async function receiptManifestFields(
  submission: SubmissionWithManifest
) {
  const publishedTemplate = submission.response?.publishedTemplate;
  const manifest = publishedTemplate?.manifest;
  if (!manifest || !publishedTemplate) {
    return [];
  }
  if (submission.form.documentKind === "xlsx") {
    return manifest.fields.filter(
      (field) =>
        field.type !== "table" &&
        field.binding !== null &&
        typeof field.binding === "object" &&
        "anchor" in field.binding
    );
  }
  return await manifestFieldsWithDocumentMetadata(
    publishedTemplate.objectKey,
    manifest.displayMetadataVersion,
    manifest.fields
  );
}
