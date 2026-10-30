CREATE TABLE "pdms_project_catalog_sessions" (
  "id" UUID NOT NULL PRIMARY KEY,
  "opening_id" UUID NOT NULL,
  "lease_id" UUID NOT NULL,
  "actor_id" TEXT NOT NULL,
  "auth_session_id" TEXT NOT NULL,
  "form_id" UUID NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" UUID NOT NULL,
  "document_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "names" JSONB,
  "load_token" UUID,
  "load_expires_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "pdms_project_catalog_sessions_opening_id_lease_id_key" ON "pdms_project_catalog_sessions"("opening_id", "lease_id");
CREATE INDEX "pdms_project_catalog_sessions_expires_at_idx" ON "pdms_project_catalog_sessions"("expires_at");
CREATE INDEX "pdms_project_catalog_sessions_target_id_idx" ON "pdms_project_catalog_sessions"("target_id");
