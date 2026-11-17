CREATE TABLE "ecm_attachment_identities" (
  "id" UUID PRIMARY KEY,
  "account_key" TEXT NOT NULL,
  "file_token" TEXT NOT NULL,
  "file_link" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'active'
);
CREATE UNIQUE INDEX "ecm_attachment_identities_account_key_file_token_key" ON "ecm_attachment_identities"("account_key", "file_token");
CREATE UNIQUE INDEX "ecm_attachment_identities_account_key_file_link_key" ON "ecm_attachment_identities"("account_key", "file_link");
ALTER TABLE "ecm_attachment_versions"
  ALTER COLUMN "fiscal_year" DROP NOT NULL,
  ADD COLUMN "identity_id" UUID,
  ADD COLUMN "storage_mode" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "template_name" TEXT,
  ADD COLUMN "storage_template_id" UUID,
  ADD COLUMN "document_category_id" INTEGER;
-- Preserve legacy attempts and their references. Ambiguous shared links remain held, not adopted.
INSERT INTO "ecm_attachment_identities" ("id", "account_key", "file_token", "file_link", "state")
SELECT DISTINCT ON ("account_key", "file_link") "id", "account_key", "file_token", "file_link",
  CASE WHEN COUNT(*) OVER (PARTITION BY "account_key", "file_link") > 1 THEN 'held'
    WHEN "state" = 'deleted' THEN 'deleted' WHEN "state" = 'deleting' THEN 'deleting' ELSE 'active' END
FROM "ecm_attachment_versions"
WHERE "file_token" IS NOT NULL AND "file_link" IS NOT NULL
ORDER BY "account_key", "file_link", "id";
UPDATE "ecm_attachment_versions" AS v SET "identity_id" = i."id"
FROM "ecm_attachment_identities" AS i
WHERE v."account_key" = i."account_key" AND v."file_token" = i."file_token" AND v."file_link" = i."file_link";
DROP INDEX "ecm_attachment_versions_file_token_key";
CREATE INDEX "ecm_attachment_versions_file_token_idx" ON "ecm_attachment_versions"("file_token");
CREATE INDEX "ecm_attachment_versions_identity_id_idx" ON "ecm_attachment_versions"("identity_id");
CREATE INDEX "ecm_attachment_versions_account_key_filename_idx" ON "ecm_attachment_versions"("account_key", "filename");
ALTER TABLE "ecm_attachment_versions" ADD CONSTRAINT "ecm_attachment_versions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "ecm_attachment_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
