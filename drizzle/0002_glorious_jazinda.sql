ALTER TABLE "audit_log" ADD COLUMN "repository_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "client_ip" varchar(45);--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_repository_created_at_idx" ON "audit_log" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");