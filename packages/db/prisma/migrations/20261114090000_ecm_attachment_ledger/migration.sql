CREATE TABLE "ecm_attachment_batches" (
 "operation_id" UUID PRIMARY KEY, "checkpoint" UUID NOT NULL, "response_id" UUID NOT NULL,
 "actor_id" TEXT NOT NULL, "lease_id" UUID NOT NULL, "auth_session_id" TEXT NOT NULL,
 "form_id" UUID NOT NULL, "document_key" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'prepared',
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ecm_attachment_batches_response_id_actor_id_checkpoint_key" ON "ecm_attachment_batches"("response_id", "actor_id", "checkpoint");
CREATE INDEX "ecm_attachment_batches_response_id_state_idx" ON "ecm_attachment_batches"("response_id", "state");
CREATE TABLE "ecm_attachment_versions" (
 "id" UUID PRIMARY KEY, "operation_id" UUID NOT NULL, "response_id" UUID NOT NULL,
 "binding_id" TEXT NOT NULL, "tag" TEXT NOT NULL, "filename" TEXT NOT NULL,
 "account_key" TEXT NOT NULL,
 "original_name" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL CHECK ("size_bytes" BETWEEN 0 AND 10000000),
 "fiscal_year" TEXT NOT NULL, "document_number" TEXT NOT NULL, "category" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'prepared', "file_link" TEXT, "file_token" TEXT,
 "sent_at" TIMESTAMPTZ(3), "received_at" TIMESTAMPTZ(3),
 "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ecm_attachment_versions_file_token_key" ON "ecm_attachment_versions"("file_token");
CREATE INDEX "ecm_attachment_versions_operation_id_state_idx" ON "ecm_attachment_versions"("operation_id", "state");
CREATE INDEX "ecm_attachment_versions_response_id_idx" ON "ecm_attachment_versions"("response_id");
CREATE TABLE "ecm_attachment_references" (
 "version_id" UUID NOT NULL, "snapshot_id" TEXT NOT NULL, "response_id" UUID NOT NULL,
 PRIMARY KEY("version_id", "snapshot_id")
);
CREATE INDEX "ecm_attachment_references_response_id_idx" ON "ecm_attachment_references"("response_id");
