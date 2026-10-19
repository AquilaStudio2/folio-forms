CREATE TYPE "DocumentKind" AS ENUM ('docx', 'xlsx');
ALTER TABLE "forms" ADD COLUMN "document_kind" "DocumentKind" NOT NULL DEFAULT 'docx';
ALTER TABLE "template_drafts" ADD COLUMN "spreadsheet_bindings" JSONB,
    ADD COLUMN "binding_revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "field_manifests" ADD COLUMN "spreadsheet_contract" JSONB;
ALTER TABLE "responses" ADD COLUMN "spreadsheet_state" JSONB;
ALTER TABLE "submissions" ADD COLUMN "spreadsheet_state" JSONB;
ALTER TABLE "corrections" ADD COLUMN "spreadsheet_state" JSONB;
ALTER TABLE "forms" ADD CONSTRAINT "xlsx_fill_method"
    CHECK ("document_kind" <> 'xlsx' OR "fill_method" = 'onlyoffice');
