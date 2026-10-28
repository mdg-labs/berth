-- Custom SQL migration file, put your code below! --
UPDATE "personal_access_tokens" SET "expiry_lifetime_seconds" = GREATEST(FLOOR(EXTRACT(EPOCH FROM ("expires_at" - "created_at"))), 0) WHERE "expires_at" IS NOT NULL AND "expiry_lifetime_seconds" IS NULL;--> statement-breakpoint
UPDATE "machine_accounts" SET "expiry_lifetime_seconds" = GREATEST(FLOOR(EXTRACT(EPOCH FROM ("expires_at" - "created_at"))), 0) WHERE "expires_at" IS NOT NULL AND "expiry_lifetime_seconds" IS NULL;
