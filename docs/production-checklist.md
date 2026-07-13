# Production checklist

Complete [Production setup](production-setup.md) first, then verify this checklist before exposing Berth beyond localhost. Each item links to detailed runbooks.

## Secrets and bootstrap

- [ ] **`SESSION_SECRET`** — long random value; not `dev-session-secret-change-in-production`
- [ ] **`BOOTSTRAP_ADMIN_PASSWORD`** — unset or strong; remove dev default from compose
- [ ] **Token signing key** — production RSA keypair; not `docker/token/dev-signing-key.pem`
- [ ] **Registry cert bundle** — `rootcert.pem` matches active signer; stored in secrets backup
- [ ] **Postgres password** — not default `berth` / `berth`
- [ ] **OIDC client secret** — stored securely if OIDC is enabled

See [Key rotation](key-rotation.md) for signing key delivery and [Install](install.md) for bootstrap behavior.

## TLS and URLs

- [ ] **HTTPS** enabled via reverse proxy or compose edge TLS — [TLS guide](tls.md)
- [ ] **`APP_URL`** set to public `https://` URL (no trailing path)
- [ ] **`REGISTRY_AUTH_TOKEN_REALM`** matches `{APP_URL}/api/auth/token`
- [ ] **`docker/registry/config.yml`** `auth.token.realm` updated if using custom config
- [ ] Docker clients use the same hostname as `APP_URL` (not `localhost`)

## Network exposure

- [ ] Only **app** (or TLS proxy) published to the host — registry and Postgres stay internal
- [ ] Firewall restricts access to admin paths if needed
- [ ] Reverse proxy sets `X-Forwarded-For` / `X-Forwarded-Proto` correctly

## Rate limiting

Berth enforces in-process limits (spec §3.5, §9.1):

| Endpoint | Env | Default (production) |
|----------|-----|----------------------|
| `/api/auth/login` | `RATE_LIMIT_LOGIN_MAX_ATTEMPTS` | 10 per IP + email / 60s |
| `/api/auth/token` | `RATE_LIMIT_TOKEN_MAX_ATTEMPTS` | 10 per IP + identifier / 60s |

Compose dev sets `RATE_LIMIT_TOKEN_MAX_ATTEMPTS=200` for push/pull testing — **lower this in production**.

- [ ] Login and token limits reviewed for your traffic
- [ ] Optional: additional rate limits at reverse proxy (defense in depth, not a substitute)

## Backups

- [ ] Scheduled **Postgres** `pg_dump` — [Backup guide](backup.md)
- [ ] Scheduled **`registry-data`** volume archive
- [ ] Secrets and compose overrides backed up separately
- [ ] Restore drill performed at least once

## Operations

- [ ] **Garbage collection** runbook understood — [GC guide](gc.md); schedule after delete-heavy periods
- [ ] **Key rotation** procedure documented for your team — [Key rotation](key-rotation.md)
- [ ] Upgrade path: `docker compose pull && docker compose up -d --build` with backup first
- [ ] Health monitoring on `/api/health` and `/api/ready`

## Registry and storage

- [ ] `REGISTRY_STORAGE_DELETE_ENABLED=true` (required for portal deletes)
- [ ] `REGISTRY_PROXY_TIMEOUT_MS` adequate for largest expected layers (default 600000 ms)
- [ ] Disk capacity planned for `registry-data` growth

## Identity

- [ ] OIDC provider configured with correct redirect URI `{APP_URL}/api/auth/oidc/callback`
- [ ] Local admin accounts limited; project RBAC reviewed
- [ ] Bootstrap admin password changed after first login if auto-generated

## CI reference

Development quality gates (from repo root):

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Integration/E2E use `docker/compose.ci.yml`. See [README](../README.md).

## Related docs

- [Install](install.md)
- [TLS](tls.md)
- [Backup](backup.md)
- [Key rotation](key-rotation.md)
- [Garbage collection](gc.md)
