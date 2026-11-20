-- Preserve only ownership and attachment lifecycle evidence after Response rows disappear.
ALTER TABLE "deletion_tombstones"
  ADD COLUMN "owner_user_id" TEXT,
  ADD COLUMN "attachment_context" JSONB;
ALTER TABLE "ecm_attachment_cleanups" ADD COLUMN "deletion_case_id" UUID;
CREATE INDEX "deletion_tombstones_owner_user_id_idx" ON "deletion_tombstones"("owner_user_id");
CREATE INDEX "ecm_attachment_cleanups_deletion_case_id_state_idx" ON "ecm_attachment_cleanups"("deletion_case_id", "state");
