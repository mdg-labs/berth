ALTER TABLE "machine_accounts" ADD COLUMN "expiry_lifetime_seconds" bigint;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD COLUMN "expiry_lifetime_seconds" bigint;