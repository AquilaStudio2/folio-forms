import { AuditOutcome, FieldType, prisma } from "@onlyoffice/db";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Elysia } from "elysia";

import { createResponseAudit } from "../audit/events";
import { requireIdentity } from "../auth/identity";
import { responsePicturePresence } from "../documents/pictures";
import { XLSX_CONTENT_TYPE } from "../documents/spreadsheets/workbook";
import { receiptField } from "../forms/query";
import {
  spreadsheetPicturePresence,
  spreadsheetBindingsForTemplate,
} from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";
import { jsonRecord, validateId } from "../http/input";
import {
  submissionSummary,
  revisionSelector,
  selectedSubmissionRevision,
  findSubmissionWithRevisions,
  canReadSubmission,
  receiptManifestFields,
  correctionRevisionSummary,
} from "../responses/query";
import type { CorrectionRevisionSummary } from "../responses/query";
import {
  DOCX_CONTENT_TYPE,
  objectExists,
  readObject,
  streamObject,
} from "../storage";
import type { RouteDependencies } from "./dependencies";

export function registerSubmissionRoutes(
  app: Elysia,
  dependencies: Pick<RouteDependencies, "onlyOffice" | "prefillReturnUrl">
): void {
  const { onlyOffice, prefillReturnUrl } = dependencies;
  app
    .get("/api/submissions/:id/data", async ({ request, params, query }) => {
      const identity = await requireIdentity(request);
      validateId(params.id, "Submission");
      const submission = await findSubmissionWithRevisions(params.id, true);
      if (!submission) {
        fail(404, "not_found", "Submission was not found");
      }
      canReadSubmission(identity, submission);
      const selected = selectedSubmissionRevision(
        submission,
        revisionSelector(query.revision)
      );
      await createResponseAudit({
        action: selected.correction ? "view_correction" : "view_response",
        actorId: identity.id,
        outcome: AuditOutcome.success,
        safeMetadata: {
          revision: selected.revision,
          state: "submitted",
        },
        targetId: selected.correction?.id ?? submission.responseId,
        targetType: selected.correction ? "correction" : "submission",
      });
      const manifestFields = await receiptManifestFields(submission);
      return {
        correction: selected.correction
          ? {
              createdAt: selected.correction.createdAt,
              reason: selected.correction.reason,
              revision: selected.correction.revision,
            }
          : null,
        data: selected.data,
        documentKind: submission.form.documentKind,
        fields: manifestFields.map(receiptField),
        returnUrl: prefillReturnUrl,
        revision: selected.revision,
        spreadsheetContract:
          submission.form.documentKind === "xlsx"
            ? {
                ...(await spreadsheetBindingsForTemplate(
                  submission.response.publishedTemplateId
                )),
                locations: {},
              }
            : null,
        submission: submissionSummary(submission, {
          formPublicId: submission.form.publicId,
          formTitle: submission.form.title,
          userEmail:
            identity.role === "admin" || identity.role === "viewer"
              ? submission.owner.email
              : undefined,
        }),
      };
    })
    .get("/api/submissions/:id/corrections", async ({ request, params }) => {
      const identity = await requireIdentity(request);
      validateId(params.id, "Submission");
      const submission = await findSubmissionWithRevisions(params.id, true);
      if (!submission) {
        fail(404, "not_found", "Submission was not found");
      }
      canReadSubmission(identity, submission);
      const corrections = submission.corrections.toSorted(
        (a, b) => b.revision - a.revision
      );
      const actorIds = corrections.map((correction) => correction.actorId);
      const actors = await prisma.user.findMany({
        select: { email: true, id: true, name: true },
        where: { id: { in: [...new Set(actorIds)] } },
      });
      const actorById = new Map(
        actors.map((actor) => [actor.id, actor] as const)
      );
      const originalAvailable = await objectExists(submission.objectKey);
      const pictureFields =
        submission.response?.publishedTemplate?.manifest?.fields.filter(
          (field) => field.type === FieldType.picture
        ) ?? [];
      const picturePresence =
        submission.form.documentKind === "xlsx"
          ? spreadsheetPicturePresence
          : responsePicturePresence;
      const originalPictures =
        originalAvailable && pictureFields.length > 0
          ? picturePresence(
              await readObject(submission.objectKey),
              pictureFields
            )
          : null;
      const correctionSummaries: CorrectionRevisionSummary[] = [];
      for (const correction of corrections.toReversed()) {
        const documentAvailable = await objectExists(correction.objectKey);
        const pictures =
          documentAvailable && pictureFields.length > 0
            ? picturePresence(
                await readObject(correction.objectKey),
                pictureFields
              )
            : null;
        correctionSummaries.push(
          correctionRevisionSummary(
            correction,
            actorById.get(correction.actorId),
            documentAvailable,
            pictures
          )
        );
      }
      await createResponseAudit({
        action: "view_response",
        actorId: identity.id,
        outcome: AuditOutcome.success,
        safeMetadata: { revision: 0, state: "submitted" },
        targetId: submission.id,
        targetType: "submission",
      });
      for (const correction of corrections) {
        await createResponseAudit({
          action: "view_correction",
          actorId: identity.id,
          outcome: AuditOutcome.success,
          safeMetadata: {
            revision: correction.revision,
            state: "submitted",
          },
          targetId: correction.id,
          targetType: "correction",
        });
      }
      return {
        latestRevision: corrections[0]?.revision ?? 0,
        revisions: [
          {
            actorEmail: null,
            actorName: null,
            createdAt: submission.createdAt,
            data: jsonRecord(submission.data),
            document: {
              available: originalAvailable,
              state: "submission",
            },
            id: null,
            pictures: originalPictures,
            reason: null,
            revision: 0,
          },
          ...correctionSummaries.map((correction) => ({
            actorEmail: correction.actorEmail,
            actorName: correction.actorName,
            createdAt: correction.createdAt,
            data: correction.data,
            document: {
              available: correction.documentAvailable,
              state: "correction",
            },
            id: correction.id,
            pictures: correction.pictures,
            reason: correction.reason,
            revision: correction.revision,
          })),
        ],
      };
    })
    .get("/api/submissions/:id/json", async ({ request, params, query }) => {
      const identity = await requireIdentity(request);
      validateId(params.id, "Submission");
      const submission = await findSubmissionWithRevisions(params.id);
      if (!submission) {
        fail(404, "not_found", "Submission was not found");
      }
      canReadSubmission(identity, submission);
      const selected = selectedSubmissionRevision(
        submission,
        revisionSelector(query.revision)
      );
      await createResponseAudit({
        action: selected.correction ? "export_correction" : "export_response",
        actorId: identity.id,
        outcome: AuditOutcome.success,
        safeMetadata: {
          format: "json",
          revision: selected.revision,
          state: "submitted",
        },
        targetId: selected.correction?.id ?? submission.id,
        targetType: selected.correction ? "correction" : "submission",
      });
      const suffix =
        selected.revision === 0 ? "" : `-revision-${selected.revision}`;
      return Response.json(selected.data, {
        headers: {
          "Content-Disposition": `attachment; filename="submission-${submission.id}${suffix}.json"`,
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    })
    .get("/api/submissions/:id/:format", async ({ request, params, query }) => {
      if (params.format !== "docx" && params.format !== "xlsx") {
        fail(404, "not_found", "Submission export was not found");
      }
      const identity = await requireIdentity(request);
      validateId(params.id, "Submission");
      const submission = await findSubmissionWithRevisions(params.id);
      if (!submission) {
        fail(404, "not_found", "Submission was not found");
      }
      canReadSubmission(identity, submission);
      const selected = selectedSubmissionRevision(
        submission,
        revisionSelector(query.revision)
      );
      if (params.format !== submission.form.documentKind) {
        fail(404, "not_found", "This document format is unavailable");
      }
      if (!(await objectExists(selected.objectKey))) {
        fail(404, "not_found", "Submission document was not found");
      }
      await createResponseAudit({
        action: selected.correction ? "export_correction" : "export_response",
        actorId: identity.id,
        outcome: AuditOutcome.success,
        safeMetadata: {
          format: submission.form.documentKind,
          revision: selected.revision,
          state: "submitted",
        },
        targetId: selected.correction?.id ?? submission.id,
        targetType: selected.correction ? "correction" : "submission",
      });
      const suffix =
        selected.revision === 0 ? "" : `-revision-${selected.revision}`;
      return new Response(streamObject(selected.objectKey), {
        headers: {
          "Content-Disposition": `attachment; filename="submission-${submission.id}${suffix}.${submission.form.documentKind}"`,
          "Content-Type":
            submission.form.documentKind === "xlsx"
              ? XLSX_CONTENT_TYPE
              : DOCX_CONTENT_TYPE,
        },
      });
    })
    .get(
      "/api/submissions/:id/pdf",
      async ({ request, params, query, set }) => {
        const identity = await requireIdentity(request);
        validateId(params.id, "Submission");
        const submission = await findSubmissionWithRevisions(params.id);
        if (!submission) {
          fail(404, "not_found", "Submission was not found");
        }
        canReadSubmission(identity, submission);
        const selected = selectedSubmissionRevision(
          submission,
          revisionSelector(query.revision)
        );
        let pdf: Uint8Array;
        try {
          pdf = await onlyOffice.convertDocxToPdf(
            selected.documentKey,
            true,
            submission.form.documentKind
          );
        } catch (error) {
          await createResponseAudit({
            action: selected.correction
              ? "export_correction"
              : "export_response",
            actorId: identity.id,
            outcome: AuditOutcome.failure,
            safeMetadata: {
              errorCode: "pdf_conversion_failed",
              format: "pdf",
              revision: selected.revision,
              state: "submitted",
            },
            targetId: selected.correction?.id ?? submission.id,
            targetType: selected.correction ? "correction" : "submission",
          });
          throw error;
        }
        await createResponseAudit({
          action: selected.correction ? "export_correction" : "export_response",
          actorId: identity.id,
          outcome: AuditOutcome.success,
          safeMetadata: {
            format: "pdf",
            revision: selected.revision,
            state: "submitted",
          },
          targetId: selected.correction?.id ?? submission.id,
          targetType: selected.correction ? "correction" : "submission",
        });
        const suffix =
          selected.revision === 0 ? "" : `-revision-${selected.revision}`;
        set.headers["Content-Type"] = "application/pdf";
        set.headers["Content-Disposition"] =
          `attachment; filename="submission-${submission.id}${suffix}.pdf"`;
        return pdf;
      }
    );
}
