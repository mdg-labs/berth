# Berth

Self-hosted OCI artifact registry with projects, RBAC and a Next.js portal,
shipped as a `docker compose` stack. Open source (Apache-2.0); this repository
is public, so everything committed here — including this file and `.claude/` —
is world-readable. Never commit secrets, internal hostnames or infrastructure
details.

- Setup and commands: [README.md](README.md), `package.json` scripts.
- Local stack: `pnpm compose:up` (app on `http://localhost:8080`).

## Agent workflow

<!-- Read by the vendored skills (orchestrate, triage, pr-review, security-audit).
     Keep these headings exactly; a subsection a repo doesn't need can be removed,
     and orchestrate then omits it from dispatches. Machine-read settings live in
     .claude/workflow.json, not here. -->

### Project

Berth is a self-hosted OCI artifact registry with Harbor-class identity,
projects and RBAC, delivered as a three-container `docker compose` stack: a
Next.js 15 / React 19 app (portal, JSON API, `/v2/*` registry proxy and
Distribution token issuer), a CNCF Distribution registry that is reachable
only through the app, and Postgres for metadata. Stack: TypeScript, Drizzle
ORM, custom DB-backed sessions, `openid-client` for OIDC, `jose` for registry
JWTs, coss UI (Base UI + Tailwind 4), TanStack Query/Table, next-intl, Vitest
and Playwright, pnpm. Users are operators running their own registry and their
teams using the portal and the `docker` CLI. The repository is public and open
source: nothing written to commits, issues, PRs or committed files may contain
secrets, internal hostnames or unfixed vulnerability details.

### Design docs

1. `docs/spec.md` — product and architecture source of truth; cite as
   `spec §N` / `spec Appendix B`. §0 lists hard agent constraints.
2. `ROADMAP.md` — MVP phases P0–P11 (all done), post-MVP backlog, risk register.
3. `DECISIONS.md` — resolved implementation choices; record every new
   assumption or choice there as it is made.

Spec wins over ROADMAP, ROADMAP over DECISIONS. Gaps in the spec are resolved
from the public canonical sources in `spec §15` (Distribution, OCI specs), never
from prior-art repos. Operator docs: `docs/install.md`,
`docs/production-setup.md`, `docs/production-checklist.md`, `docs/tls.md`,
`docs/key-rotation.md`, `docs/gc.md`, `docs/backup.md`.

### Area → paths

| Label | Paths |
|-------|-------|
| `area:auth` | `lib/auth/`, `lib/session/`, `lib/oidc/`, `lib/mfa/`, `lib/pat/`, `lib/token/`, `lib/csrf/`, `lib/rate-limit/`, `app/api/auth/`, `app/api/account/`, `app/[locale]/(auth)/`, `components/auth/` |
| `area:registry` | `app/v2/`, `lib/registry/`, `lib/catalog/`, `lib/images/`, `lib/pulls/`, `lib/gc/`, `app/api/repositories/`, `app/api/public/`, `docker/registry/` |
| `area:api` | `app/api/`, `lib/` (everything not listed under auth/registry/db), `middleware.ts`, `instrumentation.ts` |
| `area:web` | `app/[locale]/`, `components/`, `hooks/`, `messages/`, `lib/i18n/`, `app/globals.css` |
| `area:db` | `lib/db/`, `drizzle/`, `drizzle.config.ts` |
| `area:docker` | `docker/`, `.dockerignore` |
| `area:ci` | `.github/`, `scripts/` |
| `area:docs` | `docs/`, `README.md`, `ROADMAP.md`, `DECISIONS.md` |

### Always-shared files

`package.json`, `pnpm-lock.yaml`, `lib/db/schema.ts`, `drizzle/meta/_journal.json`
and snapshots, `messages/en/*.json` (one catalog per namespace — two units
adding keys to the same namespace collide), `middleware.ts`, `lib/rbac/`,
`components/ui/`, `.github/workflows/*`, `docker/compose*.yml`, `DECISIONS.md`,
`CLAUDE.md`.

### Entry points

- **Registry CLI:** `app/v2/[[...path]]/route.ts` proxies `/v2/*` to the
  registry; `app/api/auth/token/` issues Distribution JWTs (`docker login`).
- **JSON API:** route handlers under `app/api/**/route.ts`.
- **Portal:** pages under `app/[locale]/(portal)/` and `app/[locale]/(auth)/`;
  navigation in `lib/navigation/` and `components/layout/`; command palette in
  `components/command-palette/`.
- **Request gate:** `middleware.ts` (locale, session cookie gate).
- **Startup:** `instrumentation.ts` runs migrations and the bootstrap admin.
- **Stack:** `docker/compose.yml` (dev), `docker/compose.ci.yml` (CI/E2E),
  `docker/compose.prod.example.yml`.
- **CI:** `.github/workflows/ci.yml` (lint, typecheck, unit tests, compose +
  Playwright E2E), called from `dev.yml` / `main.yml`.

### Hazards

- Never push to, deploy or call the hosted dev/prod instances or their
  deployment webhooks. A push to `dev` builds and deploys the dev instance; a
  push to `main` drafts a release; publishing a release builds release images.
  Never publish a release or trigger a deploy workflow by hand.
- Run the stack only through the compose files in `docker/`; tear down only the
  project you started (`docker compose -f <file> down -v`). Never touch other
  containers, volumes or networks on the host.
- `docker/token/dev-signing-key.pem` is a public dev-only key; never commit any
  other key, certificate or `.env` file.

### Implementation rules

- `spec §0`: never read or copy from `joxit/docker-registry-ui`, Harbor or any
  fork; never bulk-install `@coss/ui` — add coss primitives one at a time per
  `spec Appendix B` and `.agents/skills/coss/` (use `render={…}` composition,
  not `asChild`).
- Database changes follow `.claude/rules/berth-db-migrations.md`: edit
  `lib/db/schema.ts`, generate with `pnpm db:generate`, never hand-write SQL,
  journal or snapshot files.
- All user-facing strings go through next-intl with keys in `messages/en/`;
  `pnpm check:i18n` must pass. API errors use the shared error codes in
  `lib/api/errors.ts` / `lib/i18n/api-error.ts`.
- Authorization is checked server-side on every request (`lib/rbac/`), with a
  fresh DB lookup — never trust client state or cache role decisions.
- `/v2/*` always goes through the app proxy; the registry is never exposed
  directly. The proxy streams bodies and rewrites `Location` headers.
- Every new source file starts with the repo's copyright header:
  `// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE`
  (`#` comment form for shell).
- Record new implementation choices in `DECISIONS.md`.
- Commit scopes: `repo`, `ci`, `api`, `web`, `db`, `docker`, `docs`, `deps`,
  `auth`, `registry`.

### Risk review

For items labelled `security-critical` or touching `riskPaths`:

- **Authentication:** sessions stay DB-backed and revocable; logout, password
  change, MFA reset and user deactivation revoke immediately. No new path
  authenticates without the session, PAT or OIDC checks in `lib/auth/`.
- **Authorization:** every new route or `/v2` scope enforces the project role
  matrix in `spec §5.3–5.4` via `lib/rbac/`; tests cover the denied case.
- **Registry tokens:** issued scopes never exceed the caller's role; TTL stays
  short (`TOKEN_TTL_SECONDS`); `x5c` / signing keys unchanged unless the change
  is a key-rotation feature with `docs/key-rotation.md` updated.
- **CSRF and rate limits:** state-changing session routes keep the CSRF check
  and the auth rate limits.
- **Deletion and GC:** deletes respect the non-empty-repository rule and
  `force` semantics (`DECISIONS.md`); nothing deletes blobs outside the
  documented GC runbook.
- **Migrations:** generated by drizzle-kit, forward-only, safe on a populated
  database (no data loss without an explicit migration step).
- **Disclosure:** no secrets, tokens or password hashes in logs, audit entries,
  API responses or error messages.

### Security units

No threat model yet — `threatModel` in `.claude/workflow.json` is `null`, so
`/security-audit` refuses to run. Write `docs/threat-model.md` in the format of
`.claude/skills/security-audit/threat-model-format.md`, set `threatModel`, then
fill in this table.
