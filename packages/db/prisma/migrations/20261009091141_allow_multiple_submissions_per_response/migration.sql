-- Restore the one-Response-per-user-per-form invariant (superseding an
-- earlier, since-reverted experiment that allowed multiple Responses).
DROP INDEX IF EXISTS "responses_form_id_user_id_created_at_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "responses_form_id_user_id_key" ON "responses"("form_id", "user_id");

-- Allow a Response to accumulate more than one Submission over time (e.g.
-- resubmitting a native form keeps the same Response and records a new
-- Submission each time, instead of creating a brand new Response).
DROP INDEX "submissions_response_id_key";

CREATE INDEX "submissions_response_id_created_at_idx" ON "submissions"("response_id", "created_at");
