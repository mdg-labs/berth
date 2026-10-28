-- Custom SQL migration file, put your code below! --
UPDATE "audit_log" SET "actor_email" = "users"."email", "actor_name" = "users"."name" FROM "users" WHERE "audit_log"."user_id" = "users"."id" AND "audit_log"."actor_email" IS NULL;
