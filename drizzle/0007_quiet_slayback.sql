CREATE TABLE "machine_account_repositories" (
	"machine_account_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	CONSTRAINT "machine_account_repositories_machine_account_id_repository_id_pk" PRIMARY KEY("machine_account_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "machine_account_repositories" ADD CONSTRAINT "machine_account_repositories_machine_account_id_machine_accounts_id_fk" FOREIGN KEY ("machine_account_id") REFERENCES "public"."machine_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_account_repositories" ADD CONSTRAINT "machine_account_repositories_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_accounts_host_name_idx" ON "machine_accounts" USING btree ("name") WHERE "machine_accounts"."owner_repository_id" is null;