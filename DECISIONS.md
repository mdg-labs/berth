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

## Phase 0 choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Copyright holder (source headers) | **Michael David Guggenbichler \| MDG-Labs** | Matches `LICENSE` copyright line; consistent org attribution for Apache-2.0 headers |
| JWT signing algorithm | **RS256** (deferred implementation to Phase 3) | Broader library/ecosystem support vs ES256; either is valid per Distribution token spec |
| Dev registry token cert | Self-signed RSA placeholder in `docker/registry/certs/` | Allows `registry:3` to start with `auth: token` before Phase 3 token issuer ships |
| Registry Docker image | **`registry:3`** (official library image) | Spec references `distribution/registry:3` conceptually; Docker Hub official tag is `registry:3` |

## Open (record when decided)

- Exact wording for sibling-tag delete warning and other UX microcopy (Phase 8)
