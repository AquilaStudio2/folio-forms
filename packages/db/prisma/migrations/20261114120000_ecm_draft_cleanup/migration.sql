CREATE TABLE "ecm_attachment_cleanups" (
 "operation_id" UUID NOT NULL, "version_id" UUID NOT NULL, "response_id" UUID NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'pending', "attempted_at" TIMESTAMPTZ(3),
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("operation_id", "version_id")
);
CREATE INDEX "ecm_attachment_cleanups_response_id_state_idx" ON "ecm_attachment_cleanups"("response_id", "state");
CREATE INDEX "ecm_attachment_cleanups_version_id_state_idx" ON "ecm_attachment_cleanups"("version_id", "state");
