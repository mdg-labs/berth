CREATE TYPE "public"."anonymous_pull_override" AS ENUM('inherit', 'allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."pull_counter_scope" AS ENUM('tag', 'image', 'repository');--> statement-breakpoint
CREATE TYPE "public"."repository_member_role" AS ENUM('guest', 'developer', 'maintainer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."system_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(255) NOT NULL,
	"resource" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_settings" (
	"repository_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"anonymous_pull" "anonymous_pull_override" DEFAULT 'inherit' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_settings_repository_id_name_pk" PRIMARY KEY("repository_id","name")
);
--> statement-breakpoint
CREATE TABLE "pull_counters" (
	"repository_id" uuid NOT NULL,
	"scope" "pull_counter_scope" NOT NULL,
	"image_name" varchar(255) DEFAULT '' NOT NULL,
	"tag_reference" varchar(255) DEFAULT '' NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "pull_counters_repository_id_scope_image_name_tag_reference_pk" PRIMARY KEY("repository_id","scope","image_name","tag_reference")
);
--> statement-breakpoint
CREATE TABLE "pull_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"image_name" varchar(255) NOT NULL,
	"tag_reference" varchar(255),
	"digest" varchar(255) NOT NULL,
	"user_id" uuid,
	"anonymous" boolean DEFAULT false NOT NULL,
	"pulled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "repository_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "repository_member_role" NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repository_members" (
	"repository_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "repository_member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_members_repository_id_user_id_pk" PRIMARY KEY("repository_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password_hash" text,
	"oidc_issuer" varchar(512),
	"oidc_sub" varchar(255),
	"system_role" "system_role" DEFAULT 'user' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_settings" ADD CONSTRAINT "image_settings_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_counters" ADD CONSTRAINT "pull_counters_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_events" ADD CONSTRAINT "pull_events_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_events" ADD CONSTRAINT "pull_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_invites" ADD CONSTRAINT "repository_invites_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_invites" ADD CONSTRAINT "repository_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_members" ADD CONSTRAINT "repository_members_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_members" ADD CONSTRAINT "repository_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pull_events_repository_image_tag_idx" ON "pull_events" USING btree ("repository_id","image_name","tag_reference");--> statement-breakpoint
CREATE INDEX "pull_events_repository_image_digest_pulled_at_idx" ON "pull_events" USING btree ("repository_id","image_name","digest","pulled_at");--> statement-breakpoint
CREATE INDEX "pull_events_repository_digest_pulled_at_idx" ON "pull_events" USING btree ("repository_id","digest","pulled_at");