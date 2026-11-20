import {
  prisma,
  FormStatus,
  AuditOutcome,
  Prisma,
  PrefillPolicy,
  FieldType,
} from "@onlyoffice/db";

import { createFormAudit } from "../audit/events";
import { contentHash } from "../digests";
import type { ParsedTemplateField } from "../documents/fields";
import { parseTemplateFields } from "../documents/fields";
import { reconcileSpreadsheetColumns } from "../documents/spreadsheets/columns";
import { validatePreservedSpreadsheetEditorSave } from "../documents/spreadsheets/editor-save-proof";
import { validateSpreadsheetAttachmentButtons } from "../documents/spreadsheets/upload-poc";
import { readSpreadsheetWorkbook } from "../documents/spreadsheets/workbook";
import { validateAttachmentStorageMappings } from "../ecm/categories";
import { validateFieldRulePointer } from "../forms/field-rules";
import {
  spreadsheetDraftBindings,
  spreadsheetScalarManifestFields,
  spreadsheetManifestFieldData,
  validateSpreadsheetPublication,
} from "../forms/spreadsheet-fields";
import { fail } from "../http/errors";
// oxlint-disable func-style prefer-destructuring no-await-in-loop no-use-before-define no-nested-ternary complexity no-shadow -- Route modules keep declaration order and sequential persistence invariants.
import type { Operation, DraftFieldRule } from "../model-types";
import { advancePdmsCatalogSession } from "../pdms/catalog";
import { jsonValue } from "../responses/data";
import { markOperationCompleted } from "./lifecycle";
import type { OperationMetadata, OperationCompletion } from "./model";
import { objectCleanupIntentGraceMs } from "./object-cleanup";
import { lockXlsxDraftCommit, replaceXlsxDraftBindings } from "./xlsx-draft";

const templateCommitTimeoutMs = 5000;

const retireFinalWorkbookIntent = async (
  tx: Prisma.TransactionClient,
  objectKey: string
): Promise<void> => {
  const retired = await tx.objectCleanupIntent.deleteMany({
    where: {
      cleanupAfter: { gt: new Date(Date.now() + templateCommitTimeoutMs) },
      objectKey,
    },
  });
  if (retired.count !== 1) {
    fail(409, "stale_operation", "The new workbook could not be committed");
  }
};

export async function completeTemplateOperation(
  operation: Operation,
  metadata: OperationMetadata,
  bytes: Uint8Array
): Promise<OperationCompletion> {
  const { documentKey } = operation;
  if (!documentKey) {
    fail(500, "invalid_operation", "Template operation has no document key");
  }
  const form = await prisma.form.findUnique({
    include: { publishedTemplate: true, templateDraft: true },
    where: { id: metadata.formId },
  });
  if (!form) {
    fail(404, "not_found", "Form was not found");
  }
  if (form.status === FormStatus.published || form.publishedTemplate) {
    fail(
      409,
      "published_immutable",
      "Published forms cannot be structurally edited"
    );
  }
  const templateDraft = form.templateDraft;
  if (!templateDraft || templateDraft.documentKey !== documentKey) {
    fail(
      409,
      "stale_operation",
      "The template changed while this operation was running"
    );
  }
  const candidate = metadata.xlsxDraft;
  if (form.documentKind === "xlsx" && !candidate) {
    fail(
      409,
      "xlsx_draft_upgrade_required",
      "This Excel save predates the atomic draft protocol"
    );
  }
  const bindings = candidate
    ? reconcileSpreadsheetColumns(
        candidate.bindings,
        readSpreadsheetWorkbook(bytes).names
      )
    : null;
  if (metadata.preserveEditorSession) {
    if (
      form.documentKind !== "xlsx" ||
      metadata.nextDocumentKey !== documentKey
    ) {
      fail(
        422,
        "invalid_template",
        "Preserved saves require the current XLSX document key"
      );
    }
    validatePreservedSpreadsheetEditorSave(
      bytes,
      bindings ?? (await spreadsheetDraftBindings(templateDraft.id)),
      metadata
    );
  }
  const nextDocumentKey = metadata.nextDocumentKey ?? documentKey;
  const result = {
    documentKey: nextDocumentKey,
    publicId: form.publicId,
    ...(candidate
      ? {
          bindingRevision: candidate.revision + 1,
          bindings,
          contentHash: contentHash(bytes),
        }
      : {}),
    ...(metadata.preserveEditorSession ? { editorSessionPreserved: true } : {}),
  };
  const cleanupObjectKeys = [
    metadata.stagedObjectKey,
    ...(candidate ? [] : [templateDraft.objectKey]),
  ];
  await prisma.$transaction(
    async (tx) => {
      if (candidate) {
        await lockXlsxDraftCommit(tx, operation, candidate);
      }
      const updated = await tx.templateDraft.updateMany({
        data: {
          contentHash: contentHash(bytes),
          ...(candidate ? { bindingRevision: { increment: 1 } } : {}),
          documentKey: nextDocumentKey,
          objectKey: metadata.finalObjectKey,
          updatedAt: new Date(),
        },
        where: {
          documentKey,
          id: templateDraft.id,
          ...(candidate
            ? {
                bindingRevision: candidate.revision,
                contentHash: candidate.baseContentHash,
                objectKey: candidate.baseObjectKey,
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        fail(
          409,
          "stale_operation",
          "The template changed while this operation was running"
        );
      }
      await advancePdmsCatalogSession(
        tx,
        metadata.pdmsCatalogSessionId,
        documentKey,
        nextDocumentKey
      );
      if (bindings) {
        await replaceXlsxDraftBindings(tx, templateDraft.id, bindings);
        await tx.objectCleanupIntent.upsert({
          create: {
            cleanupAfter: new Date(Date.now() + objectCleanupIntentGraceMs),
            objectKey: templateDraft.objectKey,
          },
          update: {
            cleanupAfter: new Date(Date.now() + objectCleanupIntentGraceMs),
          },
          where: { objectKey: templateDraft.objectKey },
        });
      }
      const formUpdated = await tx.form.updateMany({
        data: { updatedAt: new Date() },
        where: { id: form.id },
      });
      if (formUpdated.count !== 1) {
        fail(
          409,
          "stale_operation",
          "The form changed while this operation was running"
        );
      }
      if (candidate) {
        await retireFinalWorkbookIntent(tx, metadata.finalObjectKey);
      }
      await markOperationCompleted(
        tx,
        operation.id,
        result,
        metadata,
        cleanupObjectKeys
      );
      await createFormAudit(tx, {
        action: "save_template_draft",
        actorId: operation.actorId,
        outcome: AuditOutcome.success,
        safeMetadata: {},
        targetId: form.publicId,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: templateCommitTimeoutMs,
    }
  );
  return { cleanupObjectKeys };
}

type PublishedFieldRule = Pick<
  DraftFieldRule,
  "tag" | "required" | "prefillPointer" | "prefillPolicy"
>;

function publishedContractFields(
  controls: ParsedTemplateField[],
  draftRules: PublishedFieldRule[]
): {
  manifestFields: {
    label: string;
    options?: Prisma.InputJsonValue;
    pictureMaxBytes: number | null;
    pictureMaxHeight: number | null;
    pictureMaxWidth: number | null;
    placeholder: string | null;
    position: number;
    prefillPolicy: PrefillPolicy;
    required: boolean;
    tag: string;
    type: FieldType;
  }[];
  prefillFields: {
    pointer: string;
    policy: PrefillPolicy;
    tag: string;
  }[];
} {
  const controlsByTag = new Map(controls.map((field) => [field.tag, field]));
  const rulesByTag = new Map<string, PublishedFieldRule>();
  for (const rule of draftRules) {
    if (rulesByTag.has(rule.tag) || !controlsByTag.has(rule.tag)) {
      fail(
        422,
        "invalid_template",
        `Field policy does not match a published content control: ${rule.tag}`
      );
    }
    const control = controlsByTag.get(rule.tag);
    if (control?.type === FieldType.picture && rule.prefillPointer !== null) {
      fail(
        422,
        "invalid_template",
        `Picture fields cannot use prefillPointer: ${rule.tag}`
      );
    }
    validateFieldRulePointer(rule.prefillPointer);
    if (
      rule.prefillPolicy === PrefillPolicy.lock_when_available &&
      rule.prefillPointer === null
    ) {
      fail(
        422,
        "invalid_template",
        `Locked Prefill policy requires a pointer: ${rule.tag}`
      );
    }
    rulesByTag.set(rule.tag, rule);
  }
  return {
    manifestFields: controls.map((field, position) => {
      const rule = rulesByTag.get(field.tag);
      return {
        ...(field.options ? { options: jsonValue(field.options) } : {}),
        label: field.label,
        pictureMaxBytes: field.pictureMaxBytes,
        pictureMaxHeight: field.pictureMaxHeight,
        pictureMaxWidth: field.pictureMaxWidth,
        placeholder: field.placeholder,
        position,
        prefillPolicy: rule?.prefillPolicy ?? PrefillPolicy.editable,
        required: rule?.required ?? false,
        tag: field.tag,
        type: field.type,
      };
    }),
    prefillFields: draftRules
      .filter((rule) => rule.prefillPointer !== null)
      .map((rule) => ({
        pointer: rule.prefillPointer as string,
        policy: rule.prefillPolicy,
        tag: rule.tag,
      })),
  };
}
export async function completePublishOperation(
  operation: Operation,
  metadata: OperationMetadata,
  bytes: Uint8Array
): Promise<OperationCompletion> {
  const { documentKey } = operation;
  if (!documentKey) {
    fail(500, "invalid_operation", "Publish operation has no document key");
  }
  const form = await prisma.form.findUnique({
    include: { publishedTemplate: true, templateDraft: true },
    where: { id: metadata.formId },
  });
  if (!form) {
    fail(404, "not_found", "Form was not found");
  }
  if (form.status === FormStatus.published || form.publishedTemplate) {
    fail(
      409,
      "published_immutable",
      "A Published Template already exists for this Form"
    );
  }
  if (!form.templateDraft || form.templateDraft.documentKey !== documentKey) {
    fail(409, "stale_operation", "The template changed while publishing");
  }
  const candidate = metadata.xlsxDraft;
  if (form.documentKind === "xlsx" && !candidate) {
    fail(
      409,
      "xlsx_draft_upgrade_required",
      "This Excel publish predates the atomic draft protocol"
    );
  }
  const { publishedVersion, publishedKey } = metadata;
  if (
    typeof publishedVersion !== "number" ||
    typeof publishedKey !== "string"
  ) {
    fail(500, "invalid_operation", "Publish metadata is incomplete");
  }
  const docxControls =
    form.documentKind === "docx" ? parseTemplateFields(bytes) : [];
  const hash = contentHash(bytes);
  const result = {
    documentKey: publishedKey,
    publicId: form.publicId,
    version: publishedVersion,
  };
  const cleanupObjectKeys = [metadata.stagedObjectKey];
  await prisma.$transaction(
    async (tx) => {
      const [lockedForm] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT "id"
          FROM "forms"
          WHERE "id" = ${form.id}::uuid
          FOR UPDATE
        `
      );
      if (!lockedForm) {
        fail(404, "not_found", "Form was not found");
      }
      if (candidate) {
        await lockXlsxDraftCommit(tx, operation, candidate, false);
      }
      const currentForm = await tx.form.findUnique({
        include: { publishedTemplate: true, templateDraft: true },
        where: { id: form.id },
      });
      if (!currentForm) {
        fail(404, "not_found", "Form was not found");
      }
      if (
        currentForm.status === FormStatus.published ||
        currentForm.publishedTemplate
      ) {
        fail(
          409,
          "published_immutable",
          "A Published Template already exists for this Form"
        );
      }
      if (
        currentForm.version !== form.version ||
        !currentForm.templateDraft ||
        currentForm.templateDraft.documentKey !== documentKey ||
        (candidate &&
          (currentForm.templateDraft.bindingRevision !== candidate.revision ||
            currentForm.templateDraft.objectKey !== candidate.baseObjectKey ||
            currentForm.templateDraft.contentHash !==
              candidate.baseContentHash))
      ) {
        fail(409, "stale_operation", "The form changed while publishing");
      }
      const bindings = candidate
        ? reconcileSpreadsheetColumns(
            candidate.bindings,
            readSpreadsheetWorkbook(bytes).names
          )
        : null;
      const controls = bindings
        ? spreadsheetScalarManifestFields(bindings)
        : docxControls;
      let draftRules: PublishedFieldRule[] = [];
      if (form.documentKind === "docx") {
        draftRules = await tx.draftFieldRule.findMany({
          orderBy: { tag: "asc" },
          where: { templateDraftId: currentForm.templateDraft.id },
        });
      }
      if (bindings) {
        validateSpreadsheetPublication(bindings);
        await validateAttachmentStorageMappings(tx, bindings);
        validateSpreadsheetAttachmentButtons(bytes, bindings);
        draftRules = bindings.fields.map((field) => ({
          prefillPointer: field.prefillPointer,
          prefillPolicy: field.prefillPolicy,
          required: field.required,
          tag: field.key,
        }));
      }
      const contractFields = publishedContractFields(controls, draftRules);
      const manifestFields = bindings
        ? spreadsheetManifestFieldData(bindings)
        : contractFields.manifestFields;
      const { prefillFields } = contractFields;
      const publishedTemplate = await tx.publishedTemplate.create({
        data: {
          contentHash: hash,
          documentKey: publishedKey,
          form: { connect: { id: currentForm.id } },
          id: crypto.randomUUID(),
          manifest: {
            create: {
              configurationHash: hash,
              fields: { create: manifestFields },
            },
          },
          objectKey: metadata.finalObjectKey,
          version: publishedVersion,
        },
      });
      const prefillConfiguration = await tx.prefillConfiguration.create({
        data: {
          configurationHash: hash,
          formId: currentForm.id,
        },
      });
      if (prefillFields.length > 0) {
        await tx.prefillField.createMany({
          data: prefillFields.map((field) => ({
            ...field,
            configurationId: prefillConfiguration.id,
          })),
        });
      }
      await tx.prefillConfiguration.update({
        data: { publishedTemplateId: publishedTemplate.id },
        where: { id: prefillConfiguration.id },
      });
      const updated = await tx.form.updateMany({
        data: {
          status: FormStatus.published,
          updatedAt: new Date(),
          version: publishedVersion,
        },
        where: {
          id: currentForm.id,
          status: FormStatus.draft,
          version: currentForm.version,
        },
      });
      if (updated.count !== 1) {
        fail(409, "stale_operation", "The form changed while publishing");
      }
      if (candidate) {
        await retireFinalWorkbookIntent(tx, metadata.finalObjectKey);
      }
      await markOperationCompleted(
        tx,
        operation.id,
        result,
        metadata,
        cleanupObjectKeys
      );
      await createFormAudit(tx, {
        action: "publish_form",
        actorId: operation.actorId,
        outcome: AuditOutcome.success,
        safeMetadata: {},
        targetId: currentForm.publicId,
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: templateCommitTimeoutMs,
    }
  );
  return { cleanupObjectKeys };
}
