CREATE TYPE "public"."anonymous_pull_override" AS ENUM('inherit', 'allow', 'deny');--> statement-breakpoint
CREATE TABLE "repository_settings" (
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"anonymous_pull" "anonymous_pull_override" DEFAULT 'inherit' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_settings_project_id_name_pk" PRIMARY KEY("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "repository_settings" ADD CONSTRAINT "repository_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
