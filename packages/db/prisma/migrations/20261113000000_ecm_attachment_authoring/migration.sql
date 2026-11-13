ALTER TABLE "draft_field_rules" ADD COLUMN "attachment" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "attachment_category" TEXT;
ALTER TABLE "manifest_fields" ADD COLUMN "attachment" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "attachment_category" TEXT;
ALTER TABLE "draft_field_rules" ADD CONSTRAINT "draft_attachment_configuration" CHECK (("attachment" AND "type" = 'text' AND "prefill_pointer" IS NULL AND "prefill_policy" = 'editable' AND "source" IS NULL) OR (NOT "attachment" AND "attachment_category" IS NULL));
ALTER TABLE "manifest_fields" ADD CONSTRAINT "manifest_attachment_configuration" CHECK (("attachment" AND "type" = 'text' AND "prefill_policy" = 'editable' AND "source" IS NULL) OR (NOT "attachment" AND "attachment_category" IS NULL));
CREATE TABLE "ecm_auth_states" (
  "account_key" TEXT PRIMARY KEY,
  "generation" BIGINT NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'idle' CHECK ("status" IN ('idle', 'loading', 'ready', 'error')),
  "owner" UUID,
  "deadline" TIMESTAMPTZ(3),
  "lease_until" TIMESTAMPTZ(3),
  "encrypted_token" TEXT,
  "expires_at" TIMESTAMPTZ(3)
);
CREATE TABLE "ecm_category_catalogs" (
  "scope_key" TEXT PRIMARY KEY,
  "names" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL
);
