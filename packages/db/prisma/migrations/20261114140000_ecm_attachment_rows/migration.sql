ALTER TABLE "ecm_attachment_versions" ADD COLUMN "row_index" INTEGER;
ALTER TABLE "ecm_attachment_versions" ADD CONSTRAINT "ecm_attachment_versions_row_index_check" CHECK ("row_index" IS NULL OR "row_index" >= 0);
