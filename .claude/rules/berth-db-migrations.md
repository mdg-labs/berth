---
description: Drizzle migrations — schema-first only; never hand-write SQL, journal or snapshot files
paths:
  - "lib/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Database migrations (Drizzle)

Berth uses Drizzle Kit with a tracked migration journal
(`drizzle/meta/_journal.json`) and snapshots. Hand-written migrations break the
chain and are **silently skipped** at apply time.

## Workflow

1. Edit the schema only: `lib/db/schema.ts` (tables, columns, enums, indexes, FKs).
2. Generate: `pnpm db:generate`.
3. Review the generated file under `drizzle/`; don't rewrite it.
4. Apply locally against the compose database with `pnpm db:migrate` when one
   is running (migrations also run at app start from `instrumentation.ts`).

Stage `lib/db/schema.ts` together with the generated `drizzle/*.sql`,
`drizzle/meta/_journal.json` and `drizzle/meta/*_snapshot.json`. Never commit a
schema change without its generated migration.

## Forbidden

- Creating or editing `drizzle/*.sql` by hand.
- Editing `drizzle/meta/_journal.json` or `drizzle/meta/*_snapshot.json` by hand.
- Renaming migration tags without regenerating through Drizzle Kit.
- Skipping `pnpm db:generate` because the SQL "looks obvious".

## If generation looks wrong

Don't hand-fix the SQL. Check that the `drizzle/meta/` snapshots match the
applied migrations, and ask the maintainer before resetting or rebasing the
migration chain.
