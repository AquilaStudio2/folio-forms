import { ResponseStatus, prisma } from "@onlyoffice/db";
import type { DocumentKind, Prisma } from "@onlyoffice/db";

import type { Identity, Actor } from "../auth/identity";
import { manifestFieldsWithDocumentMetadata } from "../forms/query";
import { fail } from "../http/errors";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import { validateId, jsonRecord } from "../http/input";
import { paginationInfo } from "../http/pagination";
import type {
  Response,
  JsonRecord,
  Submission,
  ResponseWithSnapshot,
  Correction,
  SubmissionWithManifest,
  SubmissionWithRevisions,
} from "../model-types";
import { matchesResultAnswers, resultAnswerValues } from "./result-filters";
import type { ResultAnswerValues } from "./result-filters";

export const adminResultPageSize = 25;

const adminResultSelect = {
  createdAt: true,
  draftData: true,
  form: { select: { documentKind: true, publicId: true, title: true } },
  id: true,
  owner: { select: { email: true } },
  publishedTemplate: {
    select: {
      manifest: {
        select: {
          fields: {
            select: { binding: true, tag: true, type: true },
            where: {
              tag: {
                in: ["province", "month", "fiscal_year"],
              },
            },
          },
        },
      },
    },
  },
  status: true,
  submissions: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      corrections: {
        orderBy: { revision: "desc" },
        select: { data: true, revision: true },
        take: 1,
      },
      createdAt: true,
      data: true,
      id: true,
    },
    take: 1,
  },
  updatedAt: true,
} satisfies Prisma.ResponseSelect;

type AdminResultCandidate = Prisma.ResponseGetPayload<{
  select: typeof adminResultSelect;
}>;

const withResultAnswers = (response: AdminResultCandidate) => {
  const submission = response.submissions[0];
  const latestCorrection = submission?.corrections[0];
  return {
    ...response,
    ...resultAnswerValues({
      data:
        response.status === ResponseStatus.submitted
          ? latestCorrection
            ? latestCorrection.data
            : submission?.data
          : response.draftData,
      documentKind: response.form.documentKind,
      fields: response.publishedTemplate.manifest?.fields ?? [],
    }),
  };
};

export function findAdminResults({
  correction,
  fiscal_year,
  month,
  province,
  page,
  where,
}: {
  correction?: number;
  fiscal_year?: string;
  month?: string;
  province?: string;
  page: number;
  where: Prisma.ResponseWhereInput;
}) {
  return prisma.$transaction(
    async (tx) => {
      const orderBy = [
        { updatedAt: "desc" },
        { id: "desc" },
      ] satisfies Prisma.ResponseOrderByWithRelationInput[];
      if (
        correction === undefined &&
        fiscal_year === undefined &&
        month === undefined &&
        province === undefined
      ) {
        const total = await tx.response.count({ where });
        const pagination = paginationInfo({
          page,
          pageSize: adminResultPageSize,
          total,
        });
        const rows = await tx.response.findMany({
          orderBy,
          select: adminResultSelect,
          skip: (pagination.page - 1) * pagination.pageSize,
          take: pagination.pageSize,
          where,
        });
        return { pagination, results: rows.map(withResultAnswers) };
      }
      // Saved-answer and latest-Correction conditions are evaluated together.
      // Scan bounded batches to count all matches without retaining every answer.
      type Result = ReturnType<typeof withResultAnswers>;
      const results: Result[] = [];
      let lastPage: Result[] = [];
      let total = 0;
      let after: Pick<AdminResultCandidate, "id" | "updatedAt"> | undefined;
      const start = (page - 1) * adminResultPageSize;
      while (true) {
        const batch = await tx.response.findMany({
          orderBy,
          select: adminResultSelect,
          take: adminResultPageSize,
          where: {
            AND: [
              where,
              ...(correction !== undefined && correction > 0
                ? [{ corrections: { some: { revision: correction } } }]
                : []),
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
            correction !== undefined &&
            (response.submissions[0]?.corrections[0]?.revision ?? 0) !==
              correction
          ) {
            continue;
          }
          const result = withResultAnswers(response);
          if (
            !matchesResultAnswers({
              filters: { fiscal_year, month, province },
              values: result,
            })
          ) {
            continue;
          }
          if (total % adminResultPageSize === 0) {
            lastPage = [];
          }
          lastPage.push(result);
          if (total >= start && results.length < adminResultPageSize) {
            results.push(result);
          }
          total += 1;
        }
        if (batch.length < adminResultPageSize) {
          break;
        }
        after = batch.at(-1);
      }
      const pagination = paginationInfo({
        page,
        pageSize: adminResultPageSize,
        total,
      });
      return {
        pagination,
        results: page > pagination.page ? lastPage : results,
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}

export function adminResultDate(
  value: string | undefined,
  key: string
): Date | null {
  if (value === undefined) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
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

export function adminResultSummary(
  response: ResultAnswerValues & {
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
  }
): JsonRecord {
  const submitted = response.status === ResponseStatus.submitted;
  const submission = response.submissions[0] ?? null;
  return {
    createdAt: response.createdAt,
    documentKind: response.form.documentKind,
    fiscalYear: response.fiscalYear,
    formPublicId: response.form.publicId,
    formTitle: response.form.title,
    id: response.id,
    latestCorrectionNumber: submission?.corrections[0]?.revision ?? null,
    month: response.month,
    province: response.province,
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
  if (identity.role === "admin" || identity.role === "viewer") {
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
