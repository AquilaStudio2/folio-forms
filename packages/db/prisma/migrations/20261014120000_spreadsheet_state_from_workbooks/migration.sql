ALTER TABLE "responses" ADD COLUMN "spreadsheet_initialized" BOOLEAN NOT NULL DEFAULT false;

-- Preserve preparation status without copying immutable mappings or workbook positions.
UPDATE "responses"
SET "spreadsheet_initialized" = "spreadsheet_state" IS NOT NULL
    OR ("status" = 'submitted' AND EXISTS (
        SELECT 1 FROM "forms"
        WHERE "forms"."id" = "responses"."form_id"
            AND "forms"."document_kind" = 'xlsx'
    ));

ALTER TABLE "responses" DROP COLUMN "spreadsheet_state";
ALTER TABLE "submissions" DROP COLUMN "spreadsheet_state";
ALTER TABLE "corrections" DROP COLUMN "spreadsheet_state";

-- XLSX authoring owns its rules in spreadsheet_bindings; DOCX rules remain intact.
DELETE FROM "draft_field_rules"
USING "template_drafts", "forms"
WHERE "draft_field_rules"."template_draft_id" = "template_drafts"."id"
    AND "template_drafts"."form_id" = "forms"."id"
    AND "forms"."document_kind" = 'xlsx';
