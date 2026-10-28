ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "pull_events" DROP CONSTRAINT "pull_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "repositories" DROP CONSTRAINT "repositories_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "repository_invites" DROP CONSTRAINT "repository_invites_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "system_settings" DROP CONSTRAINT "system_settings_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_invites" DROP CONSTRAINT "user_invites_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "repository_invites" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_invites" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_events" ADD CONSTRAINT "pull_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_invites" ADD CONSTRAINT "repository_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;