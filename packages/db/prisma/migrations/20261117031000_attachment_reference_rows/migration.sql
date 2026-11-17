ALTER TABLE "ecm_attachment_references" ADD COLUMN "row_index" INTEGER;
ALTER TABLE "ecm_attachment_references" ADD CONSTRAINT "ecm_attachment_references_row_index_nonnegative" CHECK ("row_index" IS NULL OR "row_index" >= 0);
