ALTER TABLE "account"
  ADD COLUMN "last_mapped_role" "UserRole",
  ADD COLUMN "last_sso_role_generation" BIGINT;
