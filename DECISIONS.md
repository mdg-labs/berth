# Berth — Decision log

Record implementation choices here as they are made. Seeds from spec Appendix C are listed first.

## Resolved (spec Appendix C — no further debate)

| Decision | Choice | Reference |
|----------|--------|-----------|
| Product name | **Berth** | spec §1 |
| Docs/marketing domain | **getberth.app** | spec §1 |
| License | **Apache License 2.0** | spec §16 |
| ORM | **Drizzle + drizzle-kit** | spec §10 |
| Session strategy | DB-backed `sessions` table with `revoked_at` | spec §4.3, §8 |
| OIDC library | **`openid-client`**; one provider in MVP | spec §10, §5.1 |
| GC approach | Manual operator runbook + storage-stats page; no live HTTP trigger in MVP | spec §3.1 |
| Token TTL default | **300s** (`TOKEN_TTL_SECONDS`) | spec §4.3, §9.1 |
| Project deletion | Blocked while non-empty; `force=true` cascade available | spec §5.4 |
| Push to non-existent project | Rejected with `403`, not auto-created | spec §5.2 |
| Key rotation | Multi-cert `ROOTCERTBUNDLE`, overlap-then-remove procedure | spec §3.5 |
| Registry proxy | `/v2/*` always proxied through `app` — no direct registry port in any environment | spec Appendix C |

### coss/ui license verification

Per-file license headers on copied-in `@coss/ui` components must be verified during **Phase 5** before assuming Apache-2.0 compatibility (spec §16).

**Phase 5 result:** Shell-batch components installed via `npx shadcn@latest init @coss/style` and retained only: `button`, `menu`, `separator`, `badge`, `breadcrumb`, `skeleton`, `spinner`, `kbd`, `toast`. Copied registry JSON from `https://coss.com/ui/r/{name}.json` (coss `apps/ui/` tree) — **MIT** per coss.com/ui docs and spec §16 third-party note. Individual copied files carry **no per-file SPDX header**; upstream source zone is MIT-licensed (Apache-2.0 compatible). Bulk `@coss/ui` install was removed after init; only Shell-batch files kept.

## Phase 5 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Theme persistence | `localStorage` key `berth-theme` + `class="dark"` on `<html>` | Matches spec `THEME_DEFAULT`; no extra dependency |
| Create project UI | Native `<dialog>` + plain inputs | Shell batch excludes `dialog`/`input` until Catalog phase (Appendix B) |
| Protected routes | Middleware cookie gate + server layout session check + client `AuthGuard` | Defense in depth; DB session validated server-side |
| Password change API | `POST /api/auth/change-password` | Clears `must_change_password`; required for bootstrap admin flow |

## Phase 0 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Copyright holder (source headers) | **Michael David Guggenbichler \| MDG-Labs** | Matches `LICENSE` copyright line; consistent org attribution for Apache-2.0 headers |
| JWT signing algorithm | **RS256** (deferred implementation to Phase 3) | Broader library/ecosystem support vs ES256; either is valid per Distribution token spec |
| Dev registry token cert | Self-signed RSA placeholder in `docker/registry/certs/` | Allows `registry:3` to start with `auth: token` before Phase 3 token issuer ships |
| Registry Docker image | **`registry:3`** (official library image) | Spec references `distribution/registry:3` conceptually; Docker Hub official tag is `registry:3` |
| Password hashing library | **`bcryptjs`** (bcrypt algorithm, pure JS) | Avoids native `bcrypt` build scripts blocked by pnpm in CI/sandbox; same hash format for Phase 2 login |
| Bootstrap `must_change_password` | Boolean column on `users` | Spec §3.4 requires forced password change on first login when password is auto-generated |

## Phase 2 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session cookie name | `berth_session` | Namespaced to avoid collisions with other apps on same host |
| Cookie `Secure` flag | Set only when `APP_URL` uses `https://` | Local compose uses `http://localhost:8080`; `Secure` cookies are not sent over plain HTTP |
| OIDC PKCE state storage | HMAC-signed cookie `berth_oidc_state` scoped to `/api/auth/oidc` | Stateless redirect flow without server-side session store for OAuth state |
| Login rate-limit keys | Per-IP and per-email buckets | Matches spec §9.1 per-IP and per-identifier requirement |
| OIDC integration tests | Mock `openid-client` in unit tests | Avoids Keycloak container in default CI; compose OIDC AC verified via mocked grant path |
| Bootstrap password on restart | When `BOOTSTRAP_ADMIN_PASSWORD` is set and admin exists, sync hash on boot | Keeps local compose + integration tests deterministic without wiping Postgres volumes |

## Phase 3 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| JWT signing algorithm | **RS256** | Confirmed for implementation; broader ecosystem support vs ES256 (see Phase 0 deferral) |
| JWT `x5c` header | Signing cert embedded on every issued token | Distribution `registry:3` may reject bundle-only validation; belt-and-suspenders per spec §4.2 |
| Dev signing key storage | `docker/token/dev-signing-key.pem` (committed for compose dev) | Matches compose mount path; production uses env-inlined PEM or secret volume |
| Registry image pin | `registry:3@sha256:1be55279f18a2fe1a74edf2664cac61c1bea305b7b4642dab412e7affdcb3e33` | Reproducible token-validation behavior across environments |
| Token scope project gate (pre-RBAC) | `403 project_not_found` when repository scope references missing project | P3 exit criteria; full role intersection deferred to Phase 4 |
| `/v2/*` proxy | App Router catch-all `app/v2/[[...path]]/route.ts` streaming to `REGISTRY_INTERNAL_URL` | Single public entrypoint per spec §0; registry stays internal-only |
| Token rate-limit keys | Per-IP and per-identifier (`token:ip:*`, `token:id:*`) | Reuses login limiter buckets per spec §3.5 / §9.1 |

## Phase 4 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Project name validation | DNS-like slug: `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, 2–63 chars | Aligns with spec §5.2 "DNS-like slug"; lowercase on create |
| Member list shape | Discriminated union `{ type: "user" \| "invite", ... }` | Single endpoint shows members and pending invites per spec §5.5 |
| Token anonymous subject | `"anonymous"` for unauthenticated public pull tokens | Distinguishes from authenticated subjects in JWT `sub` |
| Force project delete | Best-effort manifest cascade via internal registry API | Spec §5.4 `force=true`; full portal delete flows in Phase 8 |

## Phase 6 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Proxy module layout | `lib/registry/proxy/{config,public-url,rewrite,forward}.ts` | Keeps route handler thin; unit-testable Location rewrite |
| Bearer validation | Verify JWT signature/issuer/audience when `Authorization: Bearer` present; unauthenticated `/v2/` challenges still forwarded | Spec §4.3 step 1 returns 401 without a token; invalid tokens rejected at app |
| Hop-by-hop headers | Strip `connection`/`upgrade` only; pass through `Transfer-Encoding`, `Content-Length`, `Content-Range` | Spec §4.1.1 resumable/chunked uploads |
| Upload timeouts | `REGISTRY_PROXY_TIMEOUT_MS` (default 600000) on upstream fetch | Spec §4.1.1 slow uplinks; independent of `/api/*` |
| Body size caps | `experimental.middlewareClientMaxBodySize: 500mb` + streaming `request.body` | Opt out of form-sized defaults for layer uploads |
| Route segment | `runtime=nodejs`, `maxDuration=600`, `dynamic=force-dynamic` on `/v2/*` | Long-running uploads on Node runtime |
| Dev token rate limit | `RATE_LIMIT_TOKEN_MAX_ATTEMPTS=200` in compose (login stays 10) | Docker push/pull integration makes many token round-trips per IP |

## Phase 7 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| coss Catalog + Tags + Detail batches | Installed via `npx shadcn@latest add @coss/<name>` per Appendix B; no bulk `@coss/ui` | Spec §0 / Appendix B component contract |
| coss/ui license (P7 components) | Same MIT upstream zone as Phase 5 Shell batch; no per-file SPDX headers in copied files | Spec §16 third-party note; Apache-2.0 compatible |
| Registry catalog auth | Issue per-user JWT with `registry:catalog:*` + `repository:<project>/*:pull`; filter `_catalog` by project prefix | Spec §7.4 session-authenticated registry reads |
| Tag list state | `nuqs` for `search`, `sort`, `page`, `pageSize` on `/p/[project]/r/[...repo]` | Spec §6.2 shareable filter/pagination URL state |
| Tag table rendering | TanStack Table columns + TanStack Virtual body rows | Roadmap P7 / Appendix B Tags batch |
| Catalog refresh | TanStack Query `refetchInterval: 30_000` on catalog/tags/detail | Exit criteria: portal shows push within 30s |
| Command palette | `p-command-1` pattern with Ctrl/Cmd+K; navigates projects + repos in current project | Roadmap P7 / Appendix B overlay rules |
| Copy pull command | `anchoredToastManager` anchored to copy button (`p-toast-12`) | Appendix B overlay rules |
| Repo/tag portal routes | Single optional catch-all `r/[[...rest]]` parses list vs `/t/<tag>` detail | Next.js requires catch-all be terminal; preserves spec URLs |

## Open (record when decided)

- Exact wording for sibling-tag delete warning and other UX microcopy (Phase 8)
