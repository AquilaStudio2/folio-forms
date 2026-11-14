ALTER TABLE "ecm_attachment_batches" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ecm_attachment_versions"
  ADD COLUMN "request_settled_at" TIMESTAMPTZ(3),
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ecm_attachment_cleanups"
  ADD COLUMN "form_id" UUID,
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmed_by" TEXT,
  ADD COLUMN "confirmed_at" TIMESTAMPTZ(3),
  ADD COLUMN "evidence" JSONB;
-- Existing receipts remain evidence of their original completed upload request, never an unknown upload outcome.
UPDATE "ecm_attachment_versions" SET "request_settled_at" = "received_at"
WHERE "received_at" IS NOT NULL AND "file_token" IS NOT NULL AND "file_link" IS NOT NULL;
UPDATE "ecm_attachment_cleanups" AS cleanup SET "form_id" = batch."form_id"
FROM "ecm_attachment_batches" AS batch
WHERE cleanup."operation_id" = batch."operation_id";
UPDATE "ecm_attachment_cleanups" AS cleanup SET "form_id" = response."form_id"
FROM "responses" AS response
WHERE cleanup."form_id" IS NULL AND cleanup."response_id" = response."id";
UPDATE "ecm_attachment_cleanups" AS cleanup SET "form_id" = batch."form_id"
FROM "ecm_attachment_versions" AS version
JOIN "ecm_attachment_batches" AS batch ON batch."operation_id" = version."operation_id"
WHERE cleanup."form_id" IS NULL AND cleanup."version_id" = version."id";
