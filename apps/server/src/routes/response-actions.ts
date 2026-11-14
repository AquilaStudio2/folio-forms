import {
  prisma,
  Prisma,
  ResponseStatus,
  OperationStatus,
  FillMethod,
  OperationTargetType,
} from "@onlyoffice/db";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Elysia } from "elysia";

import { requireIdentity } from "../auth/identity";
import { databaseErrorCode } from "../db-errors";
import { validateResponseDocument } from "../documents/native-eligibility";
import { callbackFieldMetadata } from "../documents/office-values";
import {
  readSpreadsheetWorkbook,
  resolveSpreadsheetContract,
} from "../documents/spreadsheets/workbook";
import {
  requireActionEditorAuthorization,
  requireDocumentServerKey,
  requireEditorScope,
  operationEditorCapability,
} from "../editor/authorization";
import type { ActionEditorAuthorization } from "../editor/authorization";
import {
  lockActiveEditorLease,
  requireActiveEditorLease,
} from "../editor/leases";
import {
  findFormByPublicId,
  nativePictureManifestFields,
} from "../forms/query";
import { spreadsheetBindingsForTemplate } from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";
import { jsonRecord, requiredString, validateId } from "../http/input";
import type { Operation } from "../model-types";
import { createOperation } from "../operations/create";
import { launchForceSave } from "../operations/force-save";
import {
  activeOperationForResponse,
  updateOperationFailed,
} from "../operations/lifecycle";
import type { OperationMetadata } from "../operations/model";
import { operationTypeForAction } from "../operations/model";
import { processNativeResponseOperation } from "../operations/response-completion";
import { pdmsOperationContext } from "../pdms/catalog";
import { hasSpreadsheetAttachments } from "../responses/attachment-data";
import {
  attachmentOperationAction,
  replayAttachmentOperation,
  recoverAttachmentAdmission,
  startAttachmentOperation,
} from "../responses/attachment-operation";
import {
  normalizeResponseData,
  jsonValue,
  requireCurrentFillMethod,
} from "../responses/data";
import { nativeResponseDocument } from "../responses/native-document";
import { nativeResponseRequest } from "../responses/native-request";
import { findOwnedResponse } from "../responses/query";
import { DOCX_CONTENT_TYPE, readObject, objectKey } from "../storage";
import type { RouteDependencies } from "./dependencies";

const responseAttachmentBindings = async (
  publishedTemplateId: string,
  formId: string,
  authorization: ActionEditorAuthorization
) => {
  const bindings = await spreadsheetBindingsForTemplate(publishedTemplateId);
  if (!bindings.table?.columns.some((column) => column.attachment)) {
    return bindings;
  }
  const response = await prisma.response.findFirst({
    where: {
      draftDocumentKey: authorization.capability.documentKey,
      formId,
      id: authorization.capability.targetId,
      publishedTemplateId,
      userId: authorization.actor.id,
    },
  });
  if (!response?.draftObjectKey) {
    fail(409, "stale_response", "ไม่พบเอกสารตารางปัจจุบันของคำตอบนี้");
  }
  return resolveSpreadsheetContract(
    bindings,
    readSpreadsheetWorkbook(await readObject(response.draftObjectKey))
  );
};

export function registerResponseActionRoutes(
  app: Elysia,
  dependencies: Pick<
    RouteDependencies,
    "onlyOffice" | "storeObject" | "allowedCallbackOrigins" | "ecm"
  >
): void {
  const { onlyOffice, storeObject, allowedCallbackOrigins } = dependencies;
  app
    .get(
      "/api/responses/:id/attachment-operations/:checkpoint",
      async ({ request, params }) => {
        const identity = await requireIdentity(request);
        const responseId = validateId(params.id, "Response");
        const checkpoint = validateId(params.checkpoint, "Checkpoint");
        const batch = await prisma.ecmAttachmentBatch.findUnique({
          where: {
            responseId_actorId_checkpoint: {
              actorId: identity.id,
              checkpoint,
              responseId,
            },
          },
        });
        if (!batch) {
          fail(
            404,
            "not_found",
            "ยังไม่พบผลรอบบันทึกเดิม กรุณาเก็บหน้านี้ไว้และตรวจผลเดิมอีกครั้ง ห้ามส่งไฟล์ซ้ำ"
          );
        }
        const operation = await prisma.operation.findUniqueOrThrow({
          where: { id: batch.operationId },
        });
        return {
          action: attachmentOperationAction(operation),
          batchState: batch.state,
          operationCapability: operationEditorCapability(
            identity,
            {
              documentKey: batch.documentKey,
              formId: batch.formId,
              targetId: responseId,
              targetType:
                operation.targetType === "correction"
                  ? "correction"
                  : "response",
            },
            operation.id
          ),
          operationId: operation.id,
          responseId,
          status: operation.status,
        };
      }
    )
    .post(
      "/api/responses/:id/attachment-operations/:checkpoint/recover",
      async ({ request, params }) => {
        const authorization = await requireActionEditorAuthorization(request);
        return recoverAttachmentAdmission(
          authorization,
          validateId(params.id, "Response"),
          validateId(params.checkpoint, "Checkpoint"),
          jsonRecord(await request.json())
        );
      }
    )
    .post(
      "/api/forms/:publicId/draft",
      async ({ request, params, set }) => {
        const authorization = await requireActionEditorAuthorization(request);
        const { actor: identity } = authorization;
        const form = await findFormByPublicId(params.publicId);
        const pictureFields =
          form.fillMethod === FillMethod.native && form.publishedTemplate
            ? await nativePictureManifestFields(form.publishedTemplate.id)
            : [];
        const attachmentBindings =
          form.documentKind === "xlsx" && form.publishedTemplate
            ? await responseAttachmentBindings(
                form.publishedTemplate.id,
                form.id,
                authorization
              )
            : undefined;
        const nativeRequest = await nativeResponseRequest(
          request,
          pictureFields,
          attachmentBindings
        );
        const input = nativeRequest.input;
        requireCurrentFillMethod(form, input);
        const responseId = requiredString(input, "responseId");
        const documentKey = requiredString(input, "documentKey");
        const response = await findOwnedResponse(
          responseId,
          form.id,
          identity.id
        );
        if (hasSpreadsheetAttachments(attachmentBindings)) {
          const replay = await replayAttachmentOperation(
            authorization,
            input,
            form.id,
            response.id,
            "save-draft"
          );
          if (replay) {
            set.status = 202;
            return replay;
          }
        }
        if (
          response.status !== ResponseStatus.draft ||
          response.draftDocumentKey !== documentKey ||
          response.publishedVersion !== form.version
        ) {
          fail(409, "stale_response", "The response is no longer editable");
        }
        const capabilityScope = {
          documentKey,
          formId: form.id,
          targetId: response.id,
          targetType: "response",
        } as const;
        requireEditorScope(authorization, {
          ...capabilityScope,
          action: "save-draft",
        });
        await requireActiveEditorLease(authorization, capabilityScope);
        const pdmsContext =
          form.documentKind === "xlsx"
            ? await pdmsOperationContext({
                authorization,
                bindings: await spreadsheetBindingsForTemplate(
                  response.publishedTemplateId
                ),
                requireReady: false,
                rowChange: input.rowChange,
                scope: capabilityScope,
                selection: input.pdmsSelection,
                sessionId: input.pdmsCatalogSessionId,
              })
            : {};
        if (
          hasSpreadsheetAttachments(attachmentBindings) &&
          input.rowChange === undefined &&
          input.pdmsSelection === undefined
        ) {
          const accepted = await startAttachmentOperation({
            action: "save-draft",
            authorization,
            bindings: attachmentBindings,
            ecm: dependencies.ecm,
            files: nativeRequest.attachments,
            form,
            input,
            onlyOffice,
            pdmsContext,
            responseId,
          });
          set.status = 202;
          return accepted;
        }
        const data =
          form.documentKind === "xlsx"
            ? {}
            : await normalizeResponseData(
                form,
                response,
                input.data,
                false,
                form.fillMethod === FillMethod.onlyoffice,
                form.fillMethod === FillMethod.onlyoffice
                  ? input.canonicalDateFields
                  : undefined
              );
        if (await activeOperationForResponse(response.id)) {
          fail(
            409,
            "operation_in_progress",
            "Another response operation is already in progress"
          );
        }
        const nativeDocumentBytes =
          pictureFields.length === 0
            ? null
            : response.draftObjectKey
              ? await nativeResponseDocument(
                  response.publishedTemplateId,
                  data,
                  await readObject(response.draftObjectKey),
                  nativeRequest.pictures
                )
              : fail(
                  409,
                  "document_unavailable",
                  "Response document is unavailable"
                );
        if (nativeDocumentBytes) {
          await validateResponseDocument(
            response.publishedTemplateId,
            nativeDocumentBytes,
            false
          );
        }
        const operationId = crypto.randomUUID();
        const stagedObjectKey = objectKey(
          "operations",
          operationId,
          "draft",
          crypto.randomUUID(),
          form.documentKind
        );
        const metadata: OperationMetadata = {
          ...pdmsContext,
          action: "save-draft",
          documentKind: form.documentKind,
          ...(form.documentKind === "xlsx" && input.rowChange !== undefined
            ? { spreadsheetRowChange: input.rowChange }
            : {}),
          data,
          finalObjectKey: objectKey(
            "responses",
            response.id,
            "draft",
            crypto.randomUUID(),
            form.documentKind
          ),
          formId: form.id,
          nextDocumentKey: `response-${response.id}-${crypto.randomUUID()}`,
          publicId: form.publicId,
          responseId: response.id,
          ...(form.documentKind !== "xlsx" &&
          form.fillMethod === FillMethod.onlyoffice
            ? callbackFieldMetadata(data, input.data, response.prefillSnapshot)
            : {}),
          ...(nativeDocumentBytes ? { nativeDocumentStaged: true } : {}),
          stagedObjectKey,
        };

        const operation = await createOperation({
          actorId: identity.id,
          authorization,
          capabilityScope,
          documentKey,
          expectedFillMethod: form.fillMethod,
          formId: form.id,
          metadata,
          ownerUserId: identity.id,
          responseId: response.id,
          stagingObjectKey: stagedObjectKey,
          targetId: response.id,
          targetType: OperationTargetType.response,
          type: operationTypeForAction["save-draft"],
        });
        if (nativeDocumentBytes) {
          try {
            await storeObject(
              stagedObjectKey,
              nativeDocumentBytes,
              DOCX_CONTENT_TYPE
            );
          } catch (error) {
            await updateOperationFailed(operation.id, "document_save_failed");
            throw error;
          }
        }
        set.status = 202;
        if (form.fillMethod === FillMethod.native) {
          void processNativeResponseOperation(operation, storeObject);
        } else {
          launchForceSave(operation, onlyOffice, allowedCallbackOrigins);
        }
        return {
          operationCapability: operationEditorCapability(
            identity,
            capabilityScope,
            operation.id
          ),
          operationId: operation.id,
          responseId: response.id,
          status: operation.status,
        };
      },
      { parse: "none" }
    )
    .post(
      "/api/forms/:publicId/submit",
      async ({ request, params, set }) => {
        const authorization = await requireActionEditorAuthorization(request);
        const { actor: identity } = authorization;
        const form = await findFormByPublicId(params.publicId);
        const pictureFields =
          form.fillMethod === FillMethod.native && form.publishedTemplate
            ? await nativePictureManifestFields(form.publishedTemplate.id)
            : [];
        const attachmentBindings =
          form.documentKind === "xlsx" && form.publishedTemplate
            ? await responseAttachmentBindings(
                form.publishedTemplate.id,
                form.id,
                authorization
              )
            : undefined;
        const nativeRequest = await nativeResponseRequest(
          request,
          pictureFields,
          attachmentBindings
        );
        const input = nativeRequest.input;
        requireCurrentFillMethod(form, input);
        const responseId = requiredString(input, "responseId");
        const documentKey = requiredString(input, "documentKey");
        const response = await findOwnedResponse(
          responseId,
          form.id,
          identity.id
        );
        if (hasSpreadsheetAttachments(attachmentBindings)) {
          const replay = await replayAttachmentOperation(
            authorization,
            input,
            form.id,
            response.id,
            "submit"
          );
          if (replay) {
            set.status = 202;
            return replay;
          }
        }
        if (
          response.status !== ResponseStatus.draft ||
          response.draftDocumentKey !== documentKey ||
          response.publishedVersion !== form.version
        ) {
          fail(409, "stale_response", "The response is no longer editable");
        }
        const capabilityScope = {
          documentKey,
          formId: form.id,
          targetId: response.id,
          targetType: "response",
        } as const;
        requireEditorScope(authorization, {
          ...capabilityScope,
          action: "submit",
        });
        await requireActiveEditorLease(authorization, capabilityScope);
        const pdmsContext =
          form.documentKind === "xlsx"
            ? await pdmsOperationContext({
                authorization,
                bindings: await spreadsheetBindingsForTemplate(
                  response.publishedTemplateId
                ),
                requireReady: true,
                scope: capabilityScope,
                selection: input.pdmsSelection,
                sessionId: input.pdmsCatalogSessionId,
              })
            : {};
        if (hasSpreadsheetAttachments(attachmentBindings)) {
          const accepted = await startAttachmentOperation({
            action: "submit",
            authorization,
            bindings: attachmentBindings,
            ecm: dependencies.ecm,
            files: nativeRequest.attachments,
            form,
            input,
            onlyOffice,
            pdmsContext,
            responseId,
          });
          set.status = 202;
          return accepted;
        }
        const data =
          form.documentKind === "xlsx"
            ? {}
            : await normalizeResponseData(
                form,
                response,
                input.data,
                true,
                form.fillMethod === FillMethod.onlyoffice,
                form.fillMethod === FillMethod.onlyoffice
                  ? input.canonicalDateFields
                  : undefined
              );
        if (await activeOperationForResponse(response.id)) {
          fail(
            409,
            "operation_in_progress",
            "Another response operation is already in progress"
          );
        }
        const nativeDocumentBytes =
          pictureFields.length === 0
            ? null
            : response.draftObjectKey
              ? await nativeResponseDocument(
                  response.publishedTemplateId,
                  data,
                  await readObject(response.draftObjectKey),
                  nativeRequest.pictures
                )
              : fail(
                  409,
                  "document_unavailable",
                  "Response document is unavailable"
                );
        if (nativeDocumentBytes) {
          await validateResponseDocument(
            response.publishedTemplateId,
            nativeDocumentBytes,
            true
          );
        }
        const operationId = crypto.randomUUID();
        const submissionId = crypto.randomUUID();
        const submissionDocumentKey = `submission-${submissionId}-${crypto.randomUUID()}`;
        const stagedObjectKey = objectKey(
          "operations",
          operationId,
          "submission",
          crypto.randomUUID(),
          form.documentKind
        );
        const metadata: OperationMetadata = {
          ...pdmsContext,
          action: "submit",
          data,
          documentKind: form.documentKind,
          ...(form.documentKind === "xlsx"
            ? { documentServerKey: requireDocumentServerKey(authorization) }
            : {}),
          finalObjectKey: objectKey(
            "submissions",
            submissionId,
            "filled",
            crypto.randomUUID(),
            form.documentKind
          ),
          formId: form.id,
          publicId: form.publicId,
          responseId: response.id,
          ...(form.documentKind !== "xlsx" &&
          form.fillMethod === FillMethod.onlyoffice
            ? callbackFieldMetadata(data, input.data, response.prefillSnapshot)
            : {}),
          stagedObjectKey,
          submissionDocumentKey,
          submissionId,
          ...(nativeDocumentBytes ? { nativeDocumentStaged: true } : {}),
        };
        let operation: Operation;
        try {
          operation = await prisma.$transaction(
            async (tx) => {
              const [lockedForm] = await tx.$queryRaw<
                { fillMethod: FillMethod }[]
              >(
                Prisma.sql`
                  SELECT "fill_method" AS "fillMethod"
                  FROM "forms"
                  WHERE "id" = ${form.id}::uuid
                  FOR UPDATE
                `
              );
              if (!lockedForm || lockedForm.fillMethod !== form.fillMethod) {
                fail(
                  409,
                  "fill_method_changed",
                  "The form Fill Method changed"
                );
              }
              await lockActiveEditorLease(tx, authorization, capabilityScope);
              const activeOperation = await tx.operation.findFirst({
                where: {
                  responseId: response.id,
                  status: {
                    in: [OperationStatus.pending, OperationStatus.processing],
                  },
                  targetId: response.id,
                  targetType: OperationTargetType.response,
                },
              });
              if (activeOperation) {
                fail(
                  409,
                  "operation_in_progress",
                  "Another response operation is already in progress"
                );
              }
              const claimed = await tx.response.updateMany({
                data: {
                  status: ResponseStatus.submitting,
                  updatedAt: new Date(),
                },
                where: { id: response.id, status: ResponseStatus.draft },
              });
              if (claimed.count !== 1) {
                fail(
                  409,
                  "operation_in_progress",
                  "Another response operation is already in progress"
                );
              }
              return tx.operation.create({
                data: {
                  actorId: identity.id,
                  documentKey,
                  errorCode: null,
                  formId: form.id,
                  metadata: jsonValue(metadata),
                  ownerUserId: identity.id,
                  responseId: response.id,
                  stagingObjectKey: stagedObjectKey,
                  status: OperationStatus.pending,
                  submissionId: null,
                  targetId: response.id,
                  targetType: OperationTargetType.response,
                  type: operationTypeForAction.submit,
                },
              });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
          );
        } catch (error) {
          if (databaseErrorCode(error) === "P2034") {
            fail(
              409,
              "operation_in_progress",
              "Another response operation is already in progress"
            );
          }
          throw error;
        }
        if (nativeDocumentBytes) {
          try {
            await storeObject(
              stagedObjectKey,
              nativeDocumentBytes,
              DOCX_CONTENT_TYPE
            );
          } catch (error) {
            await updateOperationFailed(operation.id, "document_save_failed");
            throw error;
          }
        }
        set.status = 202;
        if (form.fillMethod === FillMethod.native) {
          void processNativeResponseOperation(operation, storeObject);
        } else {
          launchForceSave(operation, onlyOffice, allowedCallbackOrigins);
        }
        return {
          operationCapability: operationEditorCapability(
            identity,
            capabilityScope,
            operation.id
          ),
          operationId: operation.id,
          responseId: response.id,
          status: operation.status,
          submissionId,
        };
      },
      { parse: "none" }
    );
}
