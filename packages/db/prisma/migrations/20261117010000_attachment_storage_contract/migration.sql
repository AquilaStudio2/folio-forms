ALTER TABLE "draft_field_rules"
  ADD COLUMN "attachment_storage_mode" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "attachment_category_id" INTEGER,
  ADD COLUMN "attachment_template_id" TEXT,
  ADD COLUMN "attachment_template_name" TEXT;
ALTER TABLE "manifest_fields"
  ADD COLUMN "attachment_storage_mode" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "attachment_category_id" INTEGER,
  ADD COLUMN "attachment_template_id" TEXT,
  ADD COLUMN "attachment_template_name" TEXT;
-- Drafts require an explicit catalog choice; immutable published contracts keep their legacy policy.
UPDATE "draft_field_rules" SET "attachment_storage_mode" = 'template', "attachment_category" = NULL WHERE "attachment" = TRUE;
