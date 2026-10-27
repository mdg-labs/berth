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
| Repository deletion | Blocked while non-empty images; `force=true` cascade available | spec §5.4 |
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
| Copyright holder (source headers) | **Michael David Guggenbichler (MDG Labs)** | The holder is Michael David Guggenbichler, sole proprietor, trading as MDG Labs (not a registered company name); matches the `LICENSE` copyright notice. Headers in files created before this change keep the previous pipe-separated holder form until #22 rewrites them |
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
| Token endpoint credential limit | A request with a Basic `Authorization` header first consumes `token:ip:<ip>` and `token:basic:<username>` (trimmed, lower-cased), before any password hash, PAT or machine secret is checked; either bucket exhausted is `429` with no credential check. A Basic header that cannot be decoded consumes `token:ip:<ip>` only. The limit applies whether or not a `scope` is requested. Once the identity is resolved, only the identity bucket (`token:id:*`, `token:machine:*`, or `token:id:unauthenticated`) is consumed, because the per-IP bucket was already consumed: one request uses one per-IP slot. The client IP is `getClientIp` (trusted-proxy hops) | Failed `docker login` attempts count against the same limits as portal login; the `token:basic:` namespace cannot collide with `token:id:*` or `token:machine:*` keys, so a username cannot drain the anonymous pull bucket or an identity's bucket. Machine accounts accept any username, so accounts that share a username also share its `token:basic:` bucket |

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

## Phase 8 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single tag delete | `DELETE` manifest by **tag reference** (not digest) | Sibling tags remain; sibling AlertDialog warns before confirm (spec §6.3) |
| Bulk tag delete | Named tags `DELETE` by **tag reference**; untagged items `DELETE` by digest; the result and `tag.bulk_delete` audit entry list a digest only when it was deleted by digest | Sibling tags sharing a digest stay intact; the reported count matches what was removed |
| Repository delete | Resolve unique digests, `DELETE` by digest | Removes manifest data; dedupes shared digests (spec §7.4) |
| Untagged digest listing | Revisions not referenced by a tag, nor transitively by a tagged index / manifest list; any unreadable or unparsable referenced manifest body lists nothing untagged for the repository | Child manifests of a tagged multi-arch image must never be offered for digest delete; fails closed |
| Tag manifest lookups | Tag and untagged summaries resolve manifests with at most 8 concurrent HEAD requests | Every tag is resolved for sibling detection; bounds load on the registry on each 30 s refetch |
| Bulk delete confirmation | Typed phrase `delete tags` when N > 5 | Spec §6.3 / exit criteria |
| Repository delete confirmation | Typed phrase `delete <repoName>` | Same confirmation pattern as bulk delete |
| Sibling warning UX | `p-alert-dialog-1` pattern + checkbox ack when siblings exist | Spec Appendix B; microcopy in DECISIONS not spec-fixed |
| GC feedback | Persistent `Alert` variant info after successful delete | Spec §6.4 — storage reclaimed after manual GC |
| Delete RBAC | `maintainer` + `admin` (+ system admin bypass) via `requireDeleteAccess` | Spec §5.3 role matrix |
| Registry delete token | Per-user JWT with `repository:<project>/<repo>:pull,delete` | Spec §7.4 session-authenticated registry writes |
| Audit log actions | `tag.delete`, `tag.bulk_delete`, `image.delete` | Spec §8 destructive-action logging |

## Phase 9 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| coss Settings batch | Installed via `npx shadcn@latest add @coss/{form,field,fieldset,switch,radio-group}` per Appendix B | Spec §0 / Appendix B component contract |
| coss/ui license (P9 components) | Same MIT upstream zone as prior phases; no per-file SPDX headers | Spec §16 third-party note |
| Registry data mount | `registry-data` volume mounted read-only at `/var/lib/registry` in `app`; `REGISTRY_DATA_PATH` env | Spec §3.1 storage-stats without Docker socket |
| GC operator UX | `/admin/gc` shows approximate volume size + copy-paste `docker compose … garbage-collect` command; no live trigger | Spec §3.1 MVP approach |
| Admin API guard | `isSessionSystemAdmin` on all `/api/admin/*` routes; portal `/admin` layout blocks non-admins | Spec §5.3 / §7.5 |
| Local user creation | `POST /api/admin/users` with optional password; auto-generate + `must_change_password` when omitted | Spec §7.5 / bootstrap pattern |
| Pending invite UX | Warning `Alert` on project settings when pending invites exist; documents unverified OIDC edge case (§5.5) | Spec §5.5 |
| Invite cancellation | `DELETE /api/projects/[id]/invites/[inviteId]` for pending invites | Settings member management completeness |

## Phase 10 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CI compose file | `docker/compose.ci.yml` — dedicated stack with app healthcheck on `/api/health` + `/api/ready` | Spec §13; reproducible integration/E2E environment on every PR |
| E2E registry push | Registry API fixture in `e2e/helpers/registry-push.ts` (minimal OCI manifest) | No Docker CLI dependency in Playwright; faster and portable |
| OIDC E2E | Skipped unless `E2E_OIDC_ENABLED` — no IdP in CI compose | Phase 2 already mocks OIDC in unit tests; Keycloak container deferred post-MVP |
| A11y regression | `@axe-core/playwright` spot-check on `/login` and `/projects` (critical/serious only) | P10 exit criteria; full axe sweep deferred to avoid flaky third-party noise |
| Responsive baseline | 375px — portal header wraps, main padding `px-3`, mobile command-palette trigger | ROADMAP P10 / spec §6.4 |
| Error/empty consistency | Shared `ErrorAlert` + coss `Empty` on projects and admin routes | Aligns catalog/tags pattern across §6.1 routes |

## Phase 11 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Operator doc layout | Split guides under `docs/` + expanded `README.md` quickstart/arch/env | ROADMAP P11 exit criteria: cold-start → push → backup without reading source |
| Production checklist | Standalone `docs/production-checklist.md` linked from README | Keeps README scannable; checklist cross-links TLS, backup, GC, key rotation |
| TLS guidance | Reverse proxy primary; compose edge TLS documented as pattern | App serves HTTP internally; no in-app ACME in MVP (spec §3.5) |
| Dev signing certs | Documented as JWT trust material, distinct from HTTPS TLS | `rootcert.pem` / dev keypair ship in compose; upgrade path in key-rotation + tls docs |
| Production app image | Built from source by default; a pinned release version tag (`X.Y.Z`, no leading `v`; never `latest`) with `build: !reset null` is the documented alternative, started with `pull` and `up -d` | The base compose file defines `app.build`, so the release-image mode must clear it and skip `--build`; a floating tag could change on a later pull |

## MFA choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MFA scope | Password portal login only | OIDC users rely on IdP MFA; avoids double step-up after OIDC callback |
| Enrollment | Optional per-user from Profile | Self-hosted registry; admins can steer users via PAT requirement when MFA enabled |
| Registry password auth | Blocked when MFA enabled; PATs remain valid | `docker login` cannot complete interactive MFA; PAT copy already documented on profile |
| TOTP library | `otplib` + `qrcode` | RFC 6238 compatible; server-side QR as data URL for enrollment |
| Secret storage | AES-256-GCM encrypted in `users.totp_secret_enc`, key derived from `SESSION_SECRET` | Reuses existing app secret; no separate KMS in MVP |
| Backup codes | 10 single-use codes, SHA-256 hashed | Account recovery without weakening disable flow (disable requires TOTP, not backup code) |
| Pending login state | HMAC-signed `berth_mfa_pending` cookie, 5 min TTL, `Path=/` | Short-lived bridge between password verify and MFA challenge without DB challenge table |

## Client IP choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trust model | Forwarded headers are trusted only through `TRUSTED_PROXY_HOPS` (default `1`): the client IP is the `X-Forwarded-For` entry that many positions from the right | A proxy writes the rightmost entry, so client-supplied leading entries cannot change the result, with an overwriting or an appending edge proxy; the first entry was attacker-controlled |
| Short chain | If the header has fewer entries than the hop count, the leftmost entry is used | Never indexes past the chain; a shared `unknown` bucket would let one client exhaust everyone's rate limit |
| No proxy | `TRUSTED_PROXY_HOPS=0` ignores forwarded headers and yields `unknown` | The request object carries no socket address; operators without a proxy must not honour spoofable headers |
| `X-Real-IP` | Read only when `TRUSTED_PROXY_HEADER=x-real-ip`, instead of `X-Forwarded-For` | Previously a silent fallback; opt-in keeps a single trusted source |
| Invalid value | A non-numeric `TRUSTED_PROXY_HOPS` falls back to `1` | Same lenient parsing as the other numeric settings; the default is the documented single edge proxy |

## CI release detection choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Release-existence check | `.github/scripts/release-exists.sh <tag>` runs `gh release view` and reads its stderr: exit 0 = no release, exit 10 = a release exists, exit 1 = the lookup failed | `gh release view` has no dedicated exit code for "not found"; only the `release not found` message separates it from a network, API or rate-limit error |
| Not-found match | Only the `release not found` message counts as absent; `HTTP 404` is not matched | A 404 can also mean a wrong repository or a token without access, which must stop the job rather than draft a release |
| Failure handling | The "Detect version bump" step fails on exit 1 and writes no `skip` output | A failed lookup never falls through to drafting a release |
| Test | `.github/scripts/release-exists.test.sh` drives the script with a fake `gh` first on `PATH` and runs as a step of `maybe-draft-release` before detection | Covers exists, not found and other-error cases without the GitHub API |

## Machine account choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Kinds | Two kinds share the `machine_accounts` table: repository accounts (owned by one repository) and host accounts (multi-repository, added later) | One secret and lookup path for both; the owner column tells them apart |
| Owner column | `owner_repository_id` is nullable, with `ON DELETE CASCADE`; null is reserved for host accounts and every repository account sets it | Deleting a repository deletes its accounts; host accounts survive any single repository |
| Secret | `bm_` + 32 random bytes (base64url); only the SHA-256 hex hash is stored, in a unique index, plus the first 12 characters as `token_prefix` | Same shape as personal access tokens (`bt_`); a distinct prefix lets the token endpoint tell the two apart |
| Secret disclosure | Returned only in the create response (`Cache-Control: no-store`); list responses and audit metadata never carry it | A lost secret is replaced by creating a new account |
| Name | The repository-name slug (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, 2-63 characters, lowercased on input); unique per owner repository | Reuses the Phase 4 rule; the slug cannot contain `+`, so the display username is unambiguous |
| Display username | `<repository name>+<account name>`, computed from the current repository name on every read | Follows a repository rename; informational only, the secret alone identifies the account |
| Permissions | `allow_pull` and `allow_push` booleans, at least one true | Same model as personal access tokens |
| Management | Repository `admin` (`manage_members` in the role matrix) and system admins, through `/api/repositories/[id]/machine-accounts`; role checked from the database on every request | Accounts grant registry access to the repository, the same trust level as membership changes |
| Creator | `created_by` references the user with `ON DELETE SET NULL` | Hard-deleting the creator must not delete or disable a CI account |
| Atomicity | Create and delete write the account row and its audit row in one transaction | A failed audit write leaves no account whose secret was never returned |
| Audit | `machine_account.create` and `machine_account.delete`, resource `machine_account:<id>`, `repositoryId` set, metadata name and permissions | Spec §8 security-relevant actions |
| Registry login | A Basic password starting with `bm_` is resolved by secret only: SHA-256 hash lookup, any username accepted; unknown, `disabled_at` set or `expires_at` past gets 401, with or without a scope, and is never retried as a user password or PAT. A `bt_` token or user password never resolves a machine account | Same strictness as the PAT check; a stale CI secret must not silently fall back to anonymous or to another identity. A user password that starts with `bm_` can no longer be used for `docker login` (as with `bt_`) |
| Scope evaluation | Works on the account's repository id list (`[owner]` for repository accounts): `pull` there if `allow_pull`; `push` only if `allow_push` and the repository is the owner repository; `delete` never; non-`repository` scopes dropped. A missing repository is 403 `repository_not_found` first | Host accounts never push even if the flag is set; an empty list grants nothing beyond anonymous pull, never all repositories |
| Out-of-list scopes | Treated as anonymous: `pull` only, only where `computeEffectiveAnonymousPull` allows it for that image (repository visibility plus image override); otherwise the entry is dropped, not the request | Keeps cross-repository blob mounts working without ever granting more than an unauthenticated client gets |
| Intersection or 403 | The grant is requested ∩ allowed; a non-empty request that ends up empty is 403 `forbidden`. A scope on a repository in the list never gains `pull` from the anonymous rule when `allow_pull` is false | Same outcome as personal access tokens; a push-only account is not widened |
| Token identity | Subject `machine:<id>` plus the private claim `berth_machine_account: <id>`, set only for machine tokens; `verifyRegistryBearerToken` returns `machineAccountId` from the claim alone. TTL, RS256 signing and `x5c` are unchanged | A user email can be the literal string `machine:<id>`, so the subject cannot attribute; attribution reads the claim |
| Token rate limits | Machine requests consume `token:machine:<id>` (plus the shared per-IP bucket); users and PATs keep `token:id:<identifier>`. A rejected `bm_` secret consumes the shared unauthenticated bucket | No user identifier, including an email of `machine:<id>`, can share or exhaust an account's bucket |
| Attribution columns | `audit_log` and `pull_events` get a nullable `machine_account_id` (FK `machine_accounts`, `ON DELETE SET NULL`), added without a backfill; no index, since the column is only read through the audit list join and the FK check on the rare account delete | Existing rows stay untouched; a deleted account must not delete or rewrite its history |
| Push and pull attribution | The proxy passes `machineAccountId` from the verified claim to push and pull recording. With it set, `user_id` stays null and the subject is never mapped to a user (`anonymous` false for pulls); without it a `machine:<id>` subject is an ordinary user email. A push entry carries `metadata.machineAccount = { id, name, kind }` (`kind` repository or host); if the account is already deleted when recorded, `machine_account_id` is null and the snapshot is `{ id }` | The snapshot keeps the entry readable after deletion; attribution never falls back to `sub` |
| Usage audit | Token issuance for a machine account updates `last_used_at` and writes `machine_account.used` (resource `machine_account:<id>`, `repositoryId` the owner repository or null for host accounts, metadata snapshot plus granted repository names) in one transaction, at most once per `PAT_LAST_USED_THROTTLE_MS` (5 minutes); the update is conditional on the stored value so concurrent issuances write one entry. Unlike `auth.pat_used`, it is throttled. A failure is logged and never fails issuance | One entry per active window instead of one per `docker` request; a failed audit insert rolls back `last_used_at`, so the next issuance retries |
| Audit view actor | The shared audit table shows "Machine account <name>" (deleted accounts: the name from `metadata.machineAccount`, marked deleted); the actor filter, free-text search and actor sort cover live and snapshot names. Pulls are not audit entries, so no per-actor pull view exists | One component serves the repository and admin views |
| Host account management | Host accounts are created, listed, edited and deleted only by system admins, through `/api/admin/machine-accounts` and `/api/admin/machine-accounts/[accountId]` (`isSessionSystemAdmin` on every method, 401 without a session, 403 otherwise). Repository admins cannot create, edit or delete them; the repository routes only ever match accounts owned by that repository, so a host account id there is 404 | A host credential crosses repository ownership; with several admin sets, who may edit, rotate or delete it would be ambiguous. Repository admins get read-only visibility instead |
| Host permissions | Pull-only: `allow_pull` true, `allow_push` false. `allowPush: true` or `allowPull: false` on create is 400. Push is never granted to a host account even if the column were set (scope evaluation grants push only on the owner repository, which a host account does not have) | The deploy-host case needs pull for several repositories and nothing else |
| Host repository list | Stored by repository id in `machine_account_repositories` (account FK and repository FK, both `ON DELETE CASCADE`, primary key on both). Create and `PATCH` take one or more existing repository ids (at most 100, duplicates collapsed); an unknown id or a non-uuid is 400. `PATCH` replaces the list in one transaction under a row lock on the account, and validates every id before the first write; the secret is unchanged | Names are not stored, so a repository rename keeps the list; the same shape as `personal_access_token_repositories` |
| Empty list | A host account whose listed repositories were all deleted stays and is granted nothing beyond anonymous pull, never all repositories. A list cannot be set to empty through the API | Deleting a repository must not widen or delete a credential |
| Host name | The repository-name slug, unique among host accounts by the partial unique index `machine_accounts_host_name_idx` (`owner_repository_id is null`); duplicate is 409. A host name may equal a repository account name | The existing per-owner index does not constrain null owners |
| Host display username | `host+<name>`, informational only (lookup is by secret). A repository literally named `host` can produce a look-alike repository account username; the portal and audit tell them apart by account kind and id | Same stance as the repository form |
| No name reservation | A repository must exist before any push, so an empty repository can be listed as soon as it is created and new images inside a listed repository need no change; names that do not exist yet cannot be listed | Any signed-in user can create a repository, so a pre-listed name would let whoever creates it first serve images to the host |
| Host accounts in the repository view | `GET /api/repositories/[id]/machine-accounts` also returns the host accounts that list that repository, with `kind: "host"` and `repositories` reduced to the viewed repository; the settings section shows them with a "Managed by system admins" badge and no delete action | A repository admin must not learn the names of other, possibly private, repositories on the same host account |
| Host audit | `machine_account.create`, `machine_account.update`, `machine_account.delete` with the admin as actor and `repositoryId` null; metadata carries `kind: "host"` and the repository ids (`repositoryIds` on create and delete, `repositoryIds: { before, after }` on update when the list changed, `descriptionChanged` when the description did). The admin delete route writes `repositoryId` of the owner repository for repository accounts | Id lists survive repository deletion and renames |
| Rotation | `POST /api/repositories/[id]/machine-accounts/[accountId]/rotate` (repository accounts, repository admin or system admin) and `POST /api/admin/machine-accounts/[accountId]/rotate` (either kind, system admin) replace `token_hash` and `token_prefix` in place under a row lock, clear `last_used_at`, and write the audit entry in the same transaction; the response carries the new secret once (`Cache-Control: no-store`). The old secret fails at the next lookup. The repository route filters on the owner repository, so a host account id or another repository's account is 404 | Same account id, name, permissions and history; nothing is half-rotated if the audit write fails |
| Rotation expiry | The body is a JSON object (anything else, including an array or `null`, is 400). `resetExpiry` as for personal access tokens (`computeRotatedPatExpiry`: keep, or restart the original lifetime; an expired account cannot be rotated without a reset or a new expiry); `expiresAt` (ISO timestamp or `null`) sets one and is validated by `validatePatExpiry`; both together are 400 | One expiry policy implementation for all non-password credentials |
| Expiry policy | Machine accounts share the personal access token policy (`system_settings.pat_max_validity_days`, `pat_allow_never_expire`) through `getPatPolicy` and `validatePatExpiry`; no separate settings. On create `expiresAt` omitted means none and is checked like an explicit `null`. The policy is applied on create and rotate only; existing accounts are not touched when it changes. The admin settings copy names both credentials | One token policy keeps admin settings simple; split later if the two need different limits |
| Disable and enable | `PATCH` accepts `disabled` (boolean) and `description` on the repository route, and `disabled` besides the existing fields on the admin route (host accounts only). `disabled_at` is set to now when disabling and cleared when enabling; a request that does not change the state keeps the timestamp and writes no audit entry. The token endpoint already answers 401 for a disabled account (see Registry login) | Disabling is reversible and leaves the secret unchanged; the audit trail records changes only |
| Lifecycle audit | `machine_account.rotate` (metadata `name`, `kind`, `resetExpiry`, `expiresAt`), `machine_account.disable` and `machine_account.enable` (`name`, `kind`), and `machine_account.update` for a description change on repository accounts (`name`, `kind`, `descriptionChanged`). Actor is the session user; `repositoryId` is the owner repository, null for host accounts. A request that changes both state and description writes one entry for each. `machine_account.create` metadata also carries `expiresAt` | No secret or hash in any entry |
| Revocation bound | Rotate, disable and expiry stop new logins at once; registry tokens already issued stay valid until `TOKEN_TTL_SECONDS` (spec §4.3, no revocation callback in Distribution) | Same bound as deleting an account or revoking a personal access token |
| Summary fields | Account summaries carry `expiresAt`, `disabledAt` and `lastUsedAt` (ISO strings or null); `GET /api/repositories/[id]/machine-accounts` also returns the token `policy` so the portal expiry picker follows the instance limits | The list shows status without a second request |

## Open (record when decided)

- Exact wording for sibling-tag delete warning and other UX microcopy (Phase 8) — **resolved in P8**: sibling dialog explains tag-only removal; checkbox ack when siblings exist
