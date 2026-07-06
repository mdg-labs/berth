# Berth — Platform Specification

**Project name:** Berth (finalized — was "Registry" as a working title/placeholder).

**Docs/marketing domain:** getberth.app (finalized — `berth.app`/`berth.dev` weren't available; product name stays **Berth** everywhere in code/README/CLI output, only the docs site uses the `getberth.app` domain, matching the common OSS pattern of product name ≠ exact-match domain, e.g. Tailwind → tailwindcss.com).

**License:** Apache License 2.0 (finalized — see §16).

**One-liner:** A self-hosted OCI artifact registry with Harbor-class identity, projects, and RBAC — delivered as a **`docker compose up`** stack with a modern Next.js + coss UI portal.

**Status:** Authoritative product spec. Implementation phases and execution detail live here until a separate roadmap is warranted. Do not implement against the deleted `registry-ui-roadmap.md` or `docker-registry-ui-modern-plan.md`.

---

## 0. Agent constraints

- **Do not** read or depend on `joxit/docker-registry-ui`, Harbor source, or any local fork as an implementation reference. Use public specs and this document only.
- **Do not** bulk-install `@coss/ui`. Follow [Appendix B — coss UI](#appendix-b--coss-ui-component-contract).
- Record assumptions in `DECISIONS.md` at the repo root as they are made.
- Gaps in this spec: resolve via web fetch against [§15 Canonical sources](#15-canonical-sources), not prior-art repos.

---

## 1. Product vision

### 1.1 What we are building

Harbor proved that teams need **projects, users, RBAC, and token-based registry auth** — not just a catalog browser on a raw Distribution instance. Harbor’s **installation and UI** did not age as well: many services, Nginx routing, Angular portal, heavy operator docs.

**Berth** is the same *category* of product, rethought:

| Harbor pain | Our approach |
|-------------|--------------|
| 6+ containers, Nginx, separate Core/Portal/Jobservice | **One app container** (Next.js: UI + REST API + token issuer) + **registry** + **postgres** |
| Angular portal, dense admin UX | **coss UI** on Next.js — fast, keyboard-friendly, light/dark |
| Auth modes sprawl (DB, LDAP, OIDC, UAA…) | **OIDC-first** + optional local bootstrap admin |
| `helm install` / installer script complexity | **`docker compose up -d`** with sane defaults |
| Feature surface on day one | **Opinionated MVP**, expand in documented phases |

The **registry engine** remains [CNCF Distribution](https://distribution.github.io/distribution/) (`registry:3`). We build the **control plane** around it: users, projects, RBAC, token service, metadata DB, modern portal.

### 1.2 What success looks like (MVP)

An operator runs:

```bash
docker compose up -d
```

…opens `https://localhost`, signs in (OIDC or bootstrap admin), creates a project, adds a member, then from their laptop:

```bash
docker login localhost
docker push localhost/my-project/hello:1.0
```

…and in the portal they browse `my-project/hello`, inspect tags, delete with confirmation — **as the same user**, with permissions enforced by issued registry tokens — not a shared service account.

### 1.3 Explicit non-goals (MVP)

Defer to post-MVP phases (§12); do not slip into MVP:

- Replication to external registries (Harbor adapter matrix)
- Vulnerability scanning (Trivy/Clair integration)
- Helm ChartMuseum / generic OCI artifact types beyond container images
- Notary / cosign content trust
- Robot accounts (API tokens for CI) — high priority in Phase 2, not MVP
- Multi-registry federation (this product **is** the registry)
- Electron / desktop packaging
- Feature parity with every Harbor admin screen

---

## 2. Goals

1. **Registry auth = UI auth** — logged-in portal user ≡ identity used for token issuance; RBAC enforced on every registry operation.
2. **Simple install** — three-service compose stack by default; TLS documented for production.
3. **Modern UX** — coss UI, TanStack Query, URL-synced filters, accessible overlays, responsive down to 375px.
4. **OCI/Distribution compliant** — `docker`/`crane` clients work without custom patches.
5. **Operator-friendly** — env-driven config, healthchecks, structured logs, documented backup (Postgres + blob storage).
6. **Testable** — unit, integration (real registry + Postgres), E2E (Playwright) in CI.

---

## 3. Docker Compose stack (default install)

### 3.1 Services

```yaml
# docker-compose.yml (conceptual — implement in repo)
services:
  app:        # Next.js standalone — UI + API + token issuer
  registry:   # distribution/registry:3 — blob store, token auth only
  postgres:   # metadata: users, projects, RBAC, audit
```

**Optional (post-MVP):**

```yaml
  redis:      # job queue for async GC, webhooks, scan jobs
```

**GC reality check (resolved, was previously underspecified):** CNCF Distribution has **no HTTP API for garbage collection** — it is only a CLI subcommand (`registry garbage-collect config.yml`) run against the storage backend, and it is a stop-the-world mark-and-sweep: the registry must be in `maintenance.readonly` mode or stopped while it runs, or concurrent uploads risk corrupting freshly-pushed images. "Trigger GC from a button, synchronously, over HTTP" is therefore not something the app can do to `registry:3` directly — there is no such endpoint to call.

MVP approach: GC is a **documented manual operator procedure**, not a live UI action:
- `/admin/gc` in the portal shows approximate storage usage (computed by the app reading the size of the shared `registry-data` volume, mounted **read-only** into `app` for this purpose only) and a copy-paste command block for the operator to run, e.g. `docker compose run --rm --entrypoint registry registry garbage-collect --delete-untagged /etc/distribution/config.yml`, with an explicit warning to stop/read-only the registry first.
- The app container is **never** given the Docker socket or exec access into the `registry` container — that would grant a web-facing process host-level privilege, which is an unacceptable blast radius for a self-hosted app that's reachable by every project member.
- Post-MVP (optional, opt-in, documented as an elevated-privilege feature): a small dedicated **GC-runner sidecar** with narrowly-scoped access (only allowed to start/stop the `registry` service and run its `garbage-collect` subcommand — e.g. via a tiny script container with `docker-compose.yml`'s socket mounted **only** into that sidecar, never into `app`) that the admin can trigger from the portal on a schedule or on demand. This keeps the privileged surface area isolated from the internet-facing monolith.

No Redis needed for MVP either way — the above requires no job queue, just documentation + optional sidecar.

### 3.2 Network & routing

- **Public edge:** only `app` exposes HTTP(S) to the host (e.g. `443:3000` or `8080:3000`).
- **registry** is **internal** — reachable as `registry:5000` from `app` and from Docker clients **through** the app’s registry proxy path (see §5.3).
- **postgres** is internal only.

Clients (`docker login`, `docker push`) hit the **same host** as the portal. The app terminates TLS (or sits behind an operator’s reverse proxy) and proxies `/v2/*` to the internal registry after token validation — matching Harbor’s “single entrypoint” ergonomics without Nginx in our default stack.

### 3.3 Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `registry-data` | `/var/lib/registry` | Image layers and manifests |
| `postgres-data` | `/var/lib/postgresql/data` | Platform metadata |
| `app-secrets` (or env) | signing keys for registry JWT | Token issuer keypair |

### 3.4 First-boot experience

1. Compose starts `postgres` → migrations → `app` → `registry`.
2. If `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` are set, create the initial **system admin** local user with that password. If `BOOTSTRAP_ADMIN_PASSWORD` is **not** set, generate a strong random password, print it to the container logs **exactly once** on that first boot behind a clearly marked one-time banner (`=== BOOTSTRAP ADMIN PASSWORD (shown once) ===`), never persist it anywhere else, and force a password change on that account's first login. Do not re-print it on subsequent restarts even if no admin has logged in yet — if it's lost, the recovery path is a documented DB-level password reset, not a log replay.
3. Operator opens portal → completes OIDC setup (optional) → creates first **project**.
4. `docker login <host>` uses Distribution token flow; token requests hit `app`.

### 3.5 Production hardening (documented, not auto-magic)

- TLS via operator reverse proxy **or** app-managed certs (document both; MVP may ship compose with self-signed + docs for Let’s Encrypt).
- **Token signing key rotation (resolved procedure):** `REGISTRY_AUTH_TOKEN_ROOTCERTBUNDLE` accepts a **bundle** — multiple concatenated PEM certificates — not just one. Rotation is: (1) generate a new keypair, (2) append the new cert to the bundle file (old cert stays in) and restart `registry` so it trusts both, (3) switch `app` to sign new tokens with the new key, (4) after `TOKEN_TTL_SECONDS` (§9.1) has fully elapsed for all previously-issued tokens, remove the old cert from the bundle and restart `registry` again. This gives a zero-downtime rollover window with no rejected in-flight tokens.
- **Rate limiting:** `/api/auth/login` and `/api/auth/token` are the two internet-facing credential-checking endpoints and must be rate-limited (per-IP and per-identifier token buckets, e.g. via a small in-process limiter for MVP; document that a fronting reverse proxy's rate limiting is a reasonable defense-in-depth addition for production, not a substitute).
- Backup: Postgres dump + `registry-data` volume.

---

## 4. Architecture

```
                    ┌─────────────────────────────────────────┐
  docker CLI ──────►│  app (Next.js)                          │
  Browser    ──────►│  ├─ Portal (coss UI)                    │
                    │  ├─ REST API (/api/*)                   │
                    │  ├─ Token issuer (/api/auth/token)      │
                    │  └─ Registry proxy (/v2/* → registry)   │
                    │         │                    │            │
                    │         ▼                    ▼            │
                    │    postgres            registry:3         │
                    │    (metadata)          (blobs)            │
                    └─────────────────────────────────────────┘
```

### 4.1 App responsibilities (monolith by design)

| Concern | Owner |
|---------|--------|
| User sessions (portal) | `app` — HTTP-only session cookie, OIDC callback |
| Project & membership CRUD | `app` → Postgres |
| RBAC evaluation | `app` — map user + project + action → allow/deny |
| Registry token issuance | `app` — Distribution token spec JWT |
| Registry HTTP proxy | `app` — stream-forward `/v2/*` to `registry:5000` for **Docker clients only** (the portal never calls `/v2/*` directly, per §4.4 — there is no "browser pre-check" case, that phrasing in earlier drafts was a self-contradiction and is removed here) |
| Portal pages | `app` — React / App Router |
| Migrations | `app` boot or dedicated `pnpm db:migrate` in container entrypoint |

**Why monolith:** Harbor splits Core, Portal, Jobservice, and Nginx. For MVP, one deployable artifact reduces compose complexity, shared types between API and UI, and one place to debug auth. Split later if job volume or team scale demands it.

### 4.1.1 Registry proxy implementation requirements (resolved — must not be a naive pass-through)

`docker push` is a multi-request flow (`POST` to start an upload, one or more `PATCH` chunks, a final `PUT`), and the registry responds to each step with a `Location` header pointing at itself (`registry:5000/...`). A correct proxy must:

- **Rewrite `Location` (and any other self-referential absolute URL) response headers** from the internal `registry:5000` host to the public-facing host/path the client is talking to — otherwise the client's next request in the upload sequence goes to an unreachable internal hostname.
- **Stream request and response bodies** (Web Streams / Node streams), never buffer a full layer in memory — layers are routinely hundreds of MB to several GB.
- **Pass through `Content-Length`/chunked transfer-encoding and `Range`/`Content-Range` headers unmodified** so resumable uploads keep working.
- **Not impose Next.js's default body-size limits** on these routes — configure the relevant route segment to opt out of any default parsing/size caps, since the framework's defaults are sized for form submissions, not image layers.
- **Use long, configurable timeouts** for this route path specifically (slow uplinks pushing large layers can take minutes), independent of whatever timeout is reasonable for ordinary `/api/*` calls.

### 4.2 Registry responsibilities (dumb storage + enforcement)

- Store blobs and manifests.
- Configured with `auth: token` — **never** `htpasswd` in production compose.
- Trust JWTs signed by `app` via the shared `rootcertbundle` (§3.5, §9.2). **Implementation note (resolved gotcha):** some recent Distribution builds have rejected tokens validated purely against `rootcertbundle` when neither an `x5c` header (embedding the signing cert directly in the JWT) nor an explicit `auth.token.jwks` config is present, despite docs implying `rootcertbundle` alone is sufficient. Belt-and-suspenders fix: have the token issuer include the signing cert's `x5c` header on every issued JWT, in addition to configuring `rootcertbundle` — verify this against whatever exact `registry:3` version is pinned in Phase 0, since this is a known area of doc/behavior drift upstream.
- `REGISTRY_STORAGE_DELETE_ENABLED=true` for tag deletion from portal.
- No user database; no project concepts — only token claims.

### 4.3 Token authentication flow

Same protocol as Harbor/Docker Hub ([Distribution token spec](https://distribution.github.io/distribution/spec/auth/token/)):

1. Client `GET /v2/` → registry (or proxy) → `401` + `WWW-Authenticate: Bearer realm="…/api/auth/token",service="…",scope="repository:proj/repo:pull"`.
2. Client `GET /api/auth/token?service=…&scope=…` with Basic (username/password) **or** Bearer (session/OIDC-derived).
3. `app` authenticates identity, evaluates RBAC for requested scopes, returns signed JWT.
4. Client retries registry operation with `Authorization: Bearer <jwt>`.
5. Registry validates signature and claim set.

**Portal browsing:** session cookie authenticates API routes; server-side registry client obtains a token for the logged-in user (never reuse one global service password).

**Token TTL (resolved, was previously unspecified):** issued registry JWTs expire after `TOKEN_TTL_SECONDS` (§9.1, default **300 seconds**). This is short deliberately: Distribution has no token-revocation callback, so a removed project member's already-issued token stays valid until it expires — a short TTL bounds that exposure window. This does not break long pushes: the Docker client automatically re-requests a token on the next `401` if the current one has expired mid-operation, so a multi-GB push just triggers 1–2 extra token round-trips rather than failing.

**Session revocation (resolved, was previously "TBD DB vs cookie" in Appendix C):** portal sessions are **DB-backed** (see `sessions` table, §8), not bare signed cookies. Every project-scoped API call re-checks the caller's current role from Postgres at request time (not from a cached session claim), so a role change or membership removal takes effect on the *next* request, and a `sessions.revoked_at` column supports an explicit "log out everywhere" action (e.g. after a password change or a suspected compromise).

**CSRF (resolved, was previously unaddressed):** session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`. Every state-changing portal route (`POST`/`PATCH`/`DELETE` under `/api/*`, excluding the Distribution token endpoint and the `/v2/*` proxy, which authenticate differently) additionally requires a custom header (e.g. `X-Requested-With: registry-portal`) that a cross-site form submission cannot attach — a standard, low-overhead CSRF defense that doesn't require a separate token-fetch round trip.

### 4.4 Rendering strategy

- **RSC** for shell, project list, static layout.
- **Client components + TanStack Query** for catalog, tags, mutations, optimistic delete.
- **nuqs** for shareable filter/pagination URL state.
- No browser-direct registry calls — portal uses `/api/*`; CLI uses `/v2/*` + token endpoint.

---

## 5. Identity, projects, and RBAC

### 5.1 Users

| Source | MVP | Notes |
|--------|-----|-------|
| Local (email + password) | ✅ | Bootstrap admin; bcrypt in Postgres |
| OIDC — **one** provider configured at a time (MVP) | ✅ | Primary recommended path for teams. "Generic" means any standards-compliant OIDC issuer (Google, GitHub, Okta, Keycloak, Authentik, …) can be pointed at via `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` (§9.1), but MVP config has exactly one such triple — there is no multi-provider picker on the login screen. (Earlier drafts listed "Google, GitHub, generic" in a way that read as simultaneous options; that was a documentation error, not a feature — resolved here.) |
| LDAP / AD | Post-MVP | |
| Robot / CI accounts | Post-MVP | Phase 2 |

User record: `id`, `email`, `name`, `password_hash?`, `oidc_sub?`, `role` (system-level), `created_at`.

**System roles (MVP):**

| Role | Capabilities |
|------|----------------|
| `admin` | All projects, user management, system settings, GC |
| `user` | Access only via project membership |

### 5.2 Projects

Harbor’s central tenancy unit. Repository `my-project/api` means:

- **Project:** `my-project`
- **Repository:** `api` (short name within project)
- Full registry name: `my-project/api` (configurable separator; default `/`).

Project record: `id`, `name` (unique, DNS-like slug), `public` (boolean — anonymous pull if true), `created_at`.

**Push to a non-existent project (resolved, was previously undefined):** rejected, not auto-created. Token issuance for a scope whose project segment doesn't match an existing project returns a clear `403` (`{error: {code: "project_not_found", message: "..."}}`) telling the client to create the project via the portal or API first. Rationale: auto-vivifying a project on first push would silently make the pushing user its de-facto owner with no explicit RBAC decision ever made — that undermines the entire "projects have deliberate members and roles" model this product exists to provide.

### 5.5 Account linking & invitations (resolved, was previously unspecified)

Adding a member "by email" (§6.3) can reference someone who has never logged in yet. Model:

- `project_invites` table: `id`, `project_id`, `email`, `role`, `invited_by`, `created_at`, `accepted_at?`. Adding a member by email creates a row here if no `users` row with that email exists yet; the invite shows up as "pending" in the project's member list.
- On successful **local** signup with a matching email, or a successful **OIDC** login where the ID token's email claim matches **and** carries `email_verified: true`, the invite auto-converts into a real `project_members` row and the invite record is marked accepted. Auto-linking is deliberately conditioned on `email_verified` — linking to an unverified email claim would let anyone claiming that address at the IdP walk into a pre-granted role.
- If an OIDC login's email matches a pending invite but `email_verified` is false or absent, the login still succeeds (creates/matches the user normally) but the invite is **not** auto-accepted; it stays pending for a system admin to resolve manually (link or discard). Document this edge case in the portal's admin UI, don't silently drop it.

### 5.3 Project roles (MVP — simplified vs Harbor)

| Role | pull | push | delete tag | manage members | delete project |
|------|------|------|------------|----------------|----------------|
| `guest` | ✅ | — | — | — | — |
| `developer` | ✅ | ✅ | — | — | — |
| `maintainer` | ✅ | ✅ | ✅ | — | — |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |

Map to token scopes: `repository:<project>/<repo>:pull|push|delete` (delete may map to push+delete manifest permission per Distribution conventions — validate against spec during implementation).

**Public project:** unauthenticated token requests may receive `pull` only on `repository:project/*:pull`.

### 5.4 Authorization rules

- Every `POST/DELETE` portal action checks session user + project role **freshly from Postgres at request time** (see §4.3's revocation note — this is what makes role changes and removals take effect immediately, not just at next token refresh).
- Every token issuance checks same rules; **never** issue broader scopes than requested intersect role.
- Project name in scope must match a project the user can access.
- Admins bypass project checks.
- CSRF and rate-limiting requirements from §4.3/§3.5 apply to every mutating route without exception.
- **Project deletion (resolved, was previously undefined):** blocked while the project has any non-empty repositories — the API returns `409 Conflict` listing the remaining repos. The admin must delete the repositories (which deletes their manifests via the registry API, §7.4) first, or explicitly pass a `force=true` confirmation that performs that cascade server-side. This mirrors Harbor's safer default (no silent mass image deletion from a single project-delete click) while still allowing an explicit one-step force-delete for someone who means it.

---

## 6. Feature specification (MVP)

### 6.1 Portal routes

| Route | Purpose |
|-------|---------|
| `/login` | Local + OIDC sign-in |
| `/` | Redirect → projects or last project |
| `/projects` | List projects user can see; create project (if permitted) |
| `/p/[project]` | Project home — repository catalog |
| `/p/[project]/r/[...repo]` | Tag list — search, sort, bulk select, delete |
| `/p/[project]/r/[...repo]/t/[tag]` | Tag detail — digest, platforms, history, copy pull, delete |
| `/p/[project]/settings` | Members, roles, danger zone (delete project) |
| `/admin` | Users, system settings (admin only) |
| `/admin/gc` | Storage usage stats + copy-paste operator runbook for garbage collection (admin) — see §3.1's resolved GC approach; no live "trigger" button in MVP |

### 6.2 Registry operations (CLI — must work for MVP)

- `docker login <host>`
- `docker push <host>/<project>/<repo>:<tag>`
- `docker pull` (including public projects without login where configured)

### 6.3 Portal operations (MVP)

- Sign in / sign out
- Create project (any authenticated user → becomes project admin)
- Invite/add member by email with role
- Browse catalog (repos in project)
- List tags — pagination, search, numeric sort
- Tag detail — multi-arch, digest, size, created, labels, Dockerfile-style history
- Delete tag — sibling-digest warning (AlertDialog)
- Bulk delete — confirmation for N>5
- **Delete repository** (all tags at once) — resolved gap: previously only tag-level and bulk-tag-level delete existed; a "remove this whole unused repo" action is one of the most common real-world cleanup operations and is now explicit MVP scope. Implemented as a compound operation (§7.4): enumerate all tags, resolve to unique manifest digests, delete each — Distribution itself has no single "delete repository" call, so this is orchestrated app-side, with the same confirmation-phrase pattern as bulk tag delete.
- Copy `docker pull` command
- Project settings — rename (optional MVP), visibility toggle, member management

### 6.4 UX requirements (carry forward)

- Delete UX: explicit sibling-tag warning; GC note as persistent Alert (storage reclaimed after registry GC).
- `Ctrl+K` command palette — jump to projects/repos/tags.
- Light / dark / system theme.
- Loading: Skeleton; empty: Empty; errors: Alert + retry; mutations: toast.

### 6.5 Deferred (documented phases)

See §12.

---

## 7. API surface (MVP)

Base: `/api`. JSON errors: `{ error: { code, message } }`.

### 7.1 Auth

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Local email/password → session |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/oidc/start` | Redirect to IdP |
| GET | `/api/auth/oidc/callback` | OIDC callback → session |
| GET | `/api/auth/me` | Current user + system role |
| GET | `/api/auth/token` | **Distribution token endpoint** — Basic or session; query `service`, `scope` |

### 7.2 Projects

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects` | List visible projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/[id]` | Project detail |
| PATCH | `/api/projects/[id]` | Update name/public flag |
| DELETE | `/api/projects/[id]` | Delete project (admin role on project) |

### 7.3 Members

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/[id]/members` | List members |
| POST | `/api/projects/[id]/members` | Add member |
| PATCH | `/api/projects/[id]/members/[userId]` | Change role |
| DELETE | `/api/projects/[id]/members/[userId]` | Remove member |

### 7.4 Registry data (session-authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/[id]/catalog` | Repos in project |
| GET | `/api/projects/[id]/repos/[...name]/tags` | Tag list |
| GET | `/api/projects/[id]/repos/[...name]/tags/[tag]` | Tag detail |
| GET | `/api/projects/[id]/repos/[...name]/tags/[tag]/siblings` | Same-digest siblings |
| DELETE | `/api/projects/[id]/repos/[...name]/tags/[tag]` | Delete tag |
| POST | `/api/projects/[id]/repos/[...name]/tags/bulk-delete` | Bulk delete |
| DELETE | `/api/projects/[id]/repos/[...name]` | Delete entire repository — orchestrated app-side as delete-all-manifests, since Distribution has no native single-call repo delete (§6.3) |

Server uses **logged-in user’s** token to call internal registry — not a shared credential.

### 7.5 Admin

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/users` | List users |
| POST | `/api/admin/users` | Create local user |
| GET | `/api/admin/gc/status` | Approximate storage usage + operator runbook text (no live trigger — §3.1's resolved GC approach) |
| GET | `/api/health` | Liveness (no DB required for orchestrator) |
| GET | `/api/ready` | Readiness (DB + registry reachable) |

### 7.6 Registry proxy

| Path | Purpose |
|------|---------|
| `/v2/*` | Proxy to internal `registry:5000` — pass-through for docker CLI after token auth |

---

## 8. Data model (MVP)

ORM: **Drizzle** (or Prisma — pick one in Phase 0, record in `DECISIONS.md`). Postgres 16+.

```
users
  id, email, name, password_hash, oidc_issuer, oidc_sub, system_role, created_at

projects
  id, name, is_public, created_by, created_at

project_members
  project_id, user_id, role (guest|developer|maintainer|admin), created_at

sessions (resolved: DB-backed, mandatory — enables instant revocation, see §4.3)
  id, user_id, expires_at, revoked_at

project_invites (resolved addition — see §5.5)
  id, project_id, email, role, invited_by, created_at, accepted_at

audit_log (resolved: minimal but MVP-required, not optional — at minimum log project delete/force-delete, member role changes, member removal, and any GC-related admin action, since these are exactly the destructive/security-relevant actions an operator will want to reconstruct after the fact)
  id, user_id, action, resource, created_at
```

Registry content is **not** duplicated in Postgres — only platform metadata. Image metadata read from registry API at request time.

---

## 9. Configuration

### 9.1 App environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres connection string |
| `REGISTRY_INTERNAL_URL` | `http://registry:5000` | Upstream Distribution |
| `TOKEN_ISSUER` | `registry` | JWT `iss` — must match registry config |
| `TOKEN_SIGNING_KEY` / `TOKEN_CERT_PATH` | — | Key material for JWT + registry trust bundle |
| `SESSION_SECRET` | — | Cookie signing |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | — | Optional OIDC |
| `BOOTSTRAP_ADMIN_EMAIL` | — | First-run admin |
| `BOOTSTRAP_ADMIN_PASSWORD` | — | Or auto-generate to log once |
| `APP_URL` | `http://localhost:8080` | External URL for OIDC redirects |
| `TAGLIST_PAGE_SIZE` | `100` | |
| `THEME_DEFAULT` | `system` | |
| `TOKEN_TTL_SECONDS` | `300` | Registry JWT lifetime (resolved default — §4.3) |
| `SESSION_TTL_SECONDS` | `604800` (7 days) | Portal session lifetime; revocation via `sessions.revoked_at` is instant regardless of this value |
| `RATE_LIMIT_LOGIN_MAX_ATTEMPTS` | `10` | Per-IP+identifier attempts before backoff, on `/api/auth/login` and `/api/auth/token` |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Sliding window for the above |

### 9.2 Registry environment variables (compose)

| Variable | Value |
|----------|-------|
| `REGISTRY_AUTH` | `token` |
| `REGISTRY_AUTH_TOKEN_REALM` | `{APP_URL}/api/auth/token` |
| `REGISTRY_AUTH_TOKEN_SERVICE` | `registry` |
| `REGISTRY_AUTH_TOKEN_ISSUER` | matches `TOKEN_ISSUER` |
| `REGISTRY_AUTH_TOKEN_ROOTCERTBUNDLE` | mounted public cert **bundle** from app — may contain multiple concatenated PEM certs simultaneously to support zero-downtime key rotation (§3.5) |
| `REGISTRY_STORAGE_DELETE_ENABLED` | `true` |

---

## 10. Tech stack

| Layer | Choice |
|-------|--------|
| App framework | Next.js 15, App Router, TypeScript strict |
| UI | coss UI (Base UI + Tailwind v4) — [Appendix B](#appendix-b--coss-ui-component-contract) |
| API | Next.js Route Handlers |
| DB | PostgreSQL 16 |
| ORM / migrations | **Drizzle + drizzle-kit** (resolved — lighter than Prisma, closer to raw SQL, no separate query-engine binary to ship in the container, good fit for a lean self-hosted app) |
| Auth | **Custom DB-backed sessions + `openid-client` for OIDC** + our own Distribution token issuer (resolved — Auth.js's session/adapter abstractions don't map cleanly onto instant-revocation DB sessions or our own JWT issuance logic; a thin custom layer gives full control with little extra code) |
| Client data | TanStack Query v5, nuqs |
| Tables / lists | TanStack Table, TanStack Virtual |
| Validation | zod |
| Registry HTTP | native `fetch` |
| Tests | Vitest + Playwright |
| Package manager | pnpm |
| Containers | node:20-alpine (app), registry:3, postgres:16-alpine |

---

## 11. Project structure (target)

```
berth/
├── app/
│   ├── (auth)/login/
│   ├── (portal)/projects/...
│   ├── admin/
│   └── api/
│       ├── auth/
│       ├── projects/
│       └── admin/
├── components/
│   ├── ui/          # coss primitives
│   ├── layout/
│   ├── projects/
│   ├── catalog/
│   └── tags/
├── lib/
│   ├── db/
│   ├── auth/
│   ├── rbac/
│   ├── registry/    # Distribution client
│   └── tokens/      # JWT issuance + validation
├── docker/
│   ├── Dockerfile
│   └── compose.yml
├── drizzle/         # migrations
├── tests/
├── docs/
│   └── spec.md      # this file
├── LICENSE          # Apache-2.0 (§16)
└── DECISIONS.md
```

---

## 12. Delivery phases (high level)

Spec-first; detailed execution checklist can be split into `ROADMAP.md` later. **Order is strict.**

| Phase | Deliverable |
|-------|-------------|
| **0** | Repo bootstrap, compose skeleton (postgres + registry + app stub), CI lint/typecheck |
| **1** | Postgres schema, migrations, bootstrap admin |
| **2** | Local auth + OIDC + session; `/api/auth/me` |
| **3** | Token issuer (`/api/auth/token`) + registry token config; `docker login` works |
| **4** | RBAC + projects/members API |
| **5** | coss UI shell — login, projects list, layout ([Appendix B](#appendix-b--coss-ui-component-contract)) |
| **6** | `docker push` / `docker pull` end-to-end for project member |
| **7** | Portal catalog + tag list + tag detail (read) |
| **8** | Delete + bulk delete + sibling warnings |
| **9** | Admin users + GC status page/runbook (§3.1) |
| **10** | Polish — a11y, responsive, states, E2E suite |
| **11** | Production compose docs, TLS guide, backup guide |

### Post-MVP

- Robot accounts + CI tokens
- Webhooks
- Async job worker (Redis) — replication, scheduled GC, scan
- Vulnerability scanning (Trivy)
- LDAP
- Audit log UI
- Helm charts / OCI artifacts beyond images

---

## 13. Testing strategy

- **Unit:** RBAC matrix, token scope intersection, JWT claim shape, zod schemas
- **Integration:** token endpoint → registry push/pull against compose stack; API with real Postgres
- **E2E:** login → create project → push (via fixture or registry API) → browse → delete
- **CI:** `docker compose -f docker/compose.ci.yml up` — run full pyramid on every PR

---

## 14. Comparison to Harbor (intentional simplifications)

| Harbor | Berth (this product) |
|--------|---------------------------|
| Nginx + Portal + Core + JobService + Registry | App + Registry + Postgres |
| Many auth backends | OIDC + local (MVP) |
| 4 project roles + system roles + robot accounts | 4 project roles + 2 system roles (MVP) |
| ChartMuseum, Notary, Trivy, replication | Deferred |
| Helm/K8s first install story | **Docker Compose first** |
| Angular UI | **coss UI** |

We are not competing on feature count initially — on **install friction** and **daily UX** for the 80% path: login, project, push, pull, browse, delete, invite teammate.

---

## 15. Canonical sources

- [Distribution API](https://distribution.github.io/distribution/spec/api/)
- [Distribution token auth](https://distribution.github.io/distribution/spec/auth/token/)
- [OCI image spec](https://github.com/opencontainers/image-spec)
- [Harbor architecture (background only)](https://github.com/goharbor/harbor/wiki/Architecture-Overview-of-Harbor)
- [coss UI docs](https://coss.com/ui/docs) · [llms.txt](https://coss.com/ui/llms.txt) · [particles](https://coss.com/ui/particles)
- [Next.js docs](https://nextjs.org/docs)
- Local agent skills: `.agents/skills/coss/`, `.agents/skills/coss-particles/`

---

## 16. License

**Berth is licensed under the Apache License 2.0** (finalized decision, replacing the earlier open question in Appendix C).

Rationale:
- Goal is maximum, frictionless free self-hosting by anyone — including companies whose legal departments reject copyleft licenses outright. A permissive license removes that adoption barrier entirely.
- Apache-2.0 includes an **explicit patent grant**, which matters here specifically because Berth touches authentication, JWT signing, and identity — areas where a patent grant gives adopters real protection that MIT alone doesn't provide.
- Matches the license used by the CNCF ecosystem this product sits in/next to: [Harbor](https://github.com/goharbor/harbor) and [Distribution](https://github.com/distribution/distribution) itself, plus the [OCI Distribution Spec](https://github.com/opencontainers/distribution-spec), are all Apache-2.0. Same-license alignment with the projects Berth builds on/competes with reduces friction for anyone comparing or contributing across both.
- Explicitly **not** AGPLv3: AGPL's "SaaS loophole" closure (forcing anyone running a modified version as a network service to publish their changes) only matters if the goal is to prevent a cloud vendor from reselling Berth as a managed service without contributing back. That's a legitimate goal for some projects, but it directly conflicts with "should be freely self-hostable by everyone, no friction" — AGPL is exactly the license large orgs' legal teams are most likely to blanket-ban. If this calculus ever changes (e.g. Berth grows a commercial hosted offering and open-core protection becomes a real concern), relicensing new versions is possible later, but Apache-2.0 is the right default for the stated goal today.

**Third-party license note (resolved caution, not yet fully verified — track in `DECISIONS.md`):** `coss.com/ui` is distributed as a mixed-license monorepo — the overall repo defaults to AGPLv3, but the actual component source under its `apps/ui/` directory (the part copied in via the `shadcn`-style CLI per Appendix B) is separately licensed MIT. Since Berth's Apache-2.0 license needs every copied-in component to carry a compatible (permissive) license, **verify the license header/notice on each individual coss/ui component file at copy-in time during Phase 5 of the roadmap**, and record the confirmation (or any exception found) in `DECISIONS.md`. Do not assume the whole coss/ui repository's default AGPLv3 applies to the copied files without checking — but also don't assume MIT applies to every single file without checking either, since it's a monorepo with multiple license zones.

Practical mechanics for the agent:
- Add a root `LICENSE` file containing the standard Apache License 2.0 text.
- Add a short copyright header convention for new source files (e.g. `// Copyright (c) <year> <copyright holder>, licensed under Apache-2.0 — see LICENSE`), applied consistently — decide the exact copyright holder line (individual name vs. a project/org name) as a Phase 0 `DECISIONS.md` entry, since that's a low-stakes naming detail, not a legal one.
- `package.json`'s `license` field: `"Apache-2.0"`.
- Mention the license prominently in `README.md`'s header (badge + one-line summary), consistent with how Harbor/Distribution do it.

---

## Appendix A — Registry HTTP API usage

Same as Distribution v2: `/v2/`, `/v2/_catalog`, `/v2/<name>/tags/list`, manifests, blobs, `DELETE` manifest by digest. Project-scoped names use `<project>/<repository>` as the repository name.

---

## Appendix B — coss UI component contract

Frontend approach unchanged: copy-in coss primitives via `npx shadcn@latest add @coss/<name>`, initialize with `npx shadcn@latest init @coss/style`.

**Layout:** Header + `Breadcrumb` (no Sidebar). Routes: projects → catalog → tags → tag detail.

### Install batches (by UI phase)

| Phase | Components |
|-------|------------|
| Shell | `@coss/style`, `button`, `menu`, `separator`, `badge`, `breadcrumb`, `skeleton`, `spinner`, `kbd`, `toast` |
| Catalog | `input-group`, `collapsible`, `empty`, `alert`, `pagination`, `frame`, `scroll-area`, `command` |
| Tags | `table`, `checkbox`, `alert-dialog`, `dialog`, `tooltip`, `toolbar`, `card` + `@tanstack/react-table` |
| Detail | `tabs`, `select`, `textarea`, `label`, `group` |
| Settings | `form`, `field`, `fieldset`, `switch`, `radio-group` |

### Overlay rules

| Action | Component | Particle |
|--------|-----------|----------|
| Delete tag | `AlertDialog` | `p-alert-dialog-1` |
| Bulk delete confirm | `Dialog` + `Field` | `p-dialog-1` |
| Command search | `CommandDialog` | `p-command-1` |
| Copy feedback | `anchoredToastManager` | `p-toast-12` |
| Mutation result | `toastManager` | `p-toast-2` |
| GC / info | `Alert` | `p-alert-4` |
| Errors | `Alert` | `p-alert-7` |
| Empty state | `Empty` | `p-empty-1` |
| Loading | `Skeleton` | `p-skeleton-1` |

### Excluded primitives (v1)

`sidebar`, `accordion`, `drawer`, `sheet`, `combobox`, `autocomplete`, `calendar`, `date-picker`, `avatar`, `context-menu`, `popover`, `otp-field`, `number-field`, `slider`, `toggle`, `toggle-group`, `preview-card`.

### Agent workflow

1. Read `.agents/skills/coss/references/primitives/<name>.md`
2. Fetch `https://coss.com/ui/r/<particle>.json`
3. Use `render={<Button />}` composition — not `asChild`
4. Mount `ToastProvider` + `AnchoredToastProvider` in root layout

### Key particles

| Feature | JSON |
|---------|------|
| Command palette | `https://coss.com/ui/r/p-command-1.json` |
| Tag table | `https://coss.com/ui/r/p-table-8.json` |
| Checkboxes | `https://coss.com/ui/r/p-table-6.json` |
| Theme picker | `https://coss.com/ui/r/p-radio-group-6.json` |
| Settings form | `https://coss.com/ui/r/p-form-2.json` |

---

## Appendix C — `DECISIONS.md` seeds

**Resolved in this spec revision (record as-is in `DECISIONS.md`, no further debate needed):**

- Product name: **Berth** (finalized — no longer a placeholder). Docs/marketing site domain: **getberth.app**.
- License: **Apache License 2.0** (§16), with a Phase-5 task to verify per-file licensing of copied-in coss/ui components before assuming Apache-2.0 compatibility.
- ORM: Drizzle + drizzle-kit (§10).
- Session strategy: DB-backed `sessions` table with `revoked_at`, not bare signed cookies (§4.3, §8).
- OIDC library: `openid-client` (§10); exactly one OIDC provider configurable in MVP (§5.1).
- GC: manual operator runbook + storage-stats page in MVP, no live HTTP trigger; optional privilege-isolated sidecar post-MVP (§3.1).
- Token TTL: 300s default, configurable (§4.3, §9.1).
- Project deletion: blocked while non-empty, explicit `force=true` cascade available (§5.4).
- Push to non-existent project: rejected with `403`, not auto-created (§5.2).
- Key rotation: multi-cert `ROOTCERTBUNDLE`, overlap-then-remove procedure (§3.5).
- `/v2/*` is **always** proxied through `app`, in every environment including dev — no direct-registry-port shortcut, even in a dev compose override, so proxy bugs (§4.1.1) surface early instead of only in production.

**Genuinely open — record the choice made at implementation time, since these are low-stakes/style calls rather than security- or architecture-relevant:**

- Exact copyright holder line for source file headers (individual name vs. project/org name — §16).
- Exact JWT signing algorithm (ES256 vs RS256 — either is fine against Distribution's token spec; pick one and note why, e.g. smaller token size vs broader library support).
- Exact wording/copy for the sibling-tag delete warning and other UX microcopy.
