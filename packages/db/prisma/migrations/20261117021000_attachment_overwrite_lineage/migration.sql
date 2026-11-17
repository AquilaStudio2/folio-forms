ALTER TABLE "ecm_attachment_versions" ADD COLUMN "overwrite_identity_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
