-- Custom SQL migration file, put your code below! --
UPDATE "personal_access_tokens" SET "all_repositories" = false WHERE EXISTS (SELECT 1 FROM "personal_access_token_repositories" WHERE "personal_access_token_repositories"."token_id" = "personal_access_tokens"."id");
