CREATE TABLE "machine_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_repository_id" uuid,
	"name" varchar(63) NOT NULL,
	"description" varchar(255),
	"token_prefix" varchar(12) NOT NULL,
	"token_hash" text NOT NULL,
	"allow_pull" boolean NOT NULL,
	"allow_push" boolean NOT NULL,
	"expires_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machine_accounts" ADD CONSTRAINT "machine_accounts_owner_repository_id_repositories_id_fk" FOREIGN KEY ("owner_repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_accounts" ADD CONSTRAINT "machine_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_accounts_token_hash_idx" ON "machine_accounts" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_accounts_owner_repository_name_idx" ON "machine_accounts" USING btree ("owner_repository_id","name");