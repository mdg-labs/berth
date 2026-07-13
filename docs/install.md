# Install guide

Berth ships as a three-service Docker Compose stack: **app**, **registry**, and **postgres**. This guide covers a cold start from zero to your first `docker push`.

## Prerequisites

- Docker Engine with Compose v2
- Ports **8080** available on the host (or change the mapping in compose)
- For production: follow the [Production setup guide](production-setup.md) (TLS, secrets, compose override)

## Start the stack

From the repository root:

```bash
docker compose -f docker/compose.yml up -d --build
```

Wait for health checks, then verify:

```bash
curl -sf http://localhost:8080/api/health
curl -sf http://localhost:8080/api/ready
```

Both should return HTTP 200. `/api/ready` confirms Postgres migrations have run.

### What starts

| Service | Image / build | Host access |
|---------|---------------|-------------|
| `postgres` | `postgres:16-alpine` | Internal only |
| `registry` | `registry:3` (pinned digest) | Internal only — clients reach it through **app** |
| `app` | Built from `docker/Dockerfile` | `8080:3000` |

Persistent data lives in Docker volumes `postgres-data` and `registry-data`.

## First boot

On startup the **app** container:

1. Waits for Postgres and the registry to become healthy
2. Runs database migrations
3. Ensures a bootstrap system admin exists (see below)

### Bootstrap admin

| Scenario | Behavior |
|----------|----------|
| `BOOTSTRAP_ADMIN_PASSWORD` **set** | Admin is created (or password synced on restart) with that password; no forced change |
| `BOOTSTRAP_ADMIN_PASSWORD` **not set**, no admin yet | A random password is generated, printed **once** to app logs, and `must_change_password` is set |
| Admin already exists, password not set in env | No password is printed on later restarts |

Default compose dev values (change for anything beyond localhost):

```yaml
BOOTSTRAP_ADMIN_EMAIL: admin@localhost
BOOTSTRAP_ADMIN_PASSWORD: test-admin-password
```

To retrieve a one-time generated password:

```bash
docker compose -f docker/compose.yml logs app | grep -A3 "BOOTSTRAP ADMIN PASSWORD"
```

The banner looks like:

```text
=== BOOTSTRAP ADMIN PASSWORD (shown once) ===
Email: admin@example.com
Password: <random>
=== END BOOTSTRAP ADMIN PASSWORD ===
```

If the password was lost after first boot, use [Password recovery](#password-recovery) — it is **not** printed again.

### Sign in

1. Open **http://localhost:8080/login**
2. Sign in with the bootstrap email and password
3. If prompted, change your password (required when the password was auto-generated)

Optional: configure OIDC via `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` on the **app** service. Set `APP_URL` to your public URL before enabling OIDC.

## Create a project and push an image

1. In the portal, go to **Projects** → **Create project** (e.g. `my-project`)
2. From your workstation:

```bash
docker login localhost:8080
# Username: admin@localhost  (or your bootstrap email)
# Password: your admin password

docker pull hello-world:latest
docker tag hello-world:latest localhost:8080/my-project/hello:1.0
docker push localhost:8080/my-project/hello:1.0
```

3. In the portal, open **my-project** → **hello** — the tag should appear within ~30 seconds.

Push to a project that does not exist returns **403**; create the project in the portal first.

## Password recovery

If the bootstrap password was auto-generated and lost, reset it at the database level.

### Option A — Set `BOOTSTRAP_ADMIN_PASSWORD` and recreate admin row

Only suitable on a **fresh** install with no data you need to keep:

```bash
docker compose -f docker/compose.yml down -v   # destroys volumes
# Set BOOTSTRAP_ADMIN_PASSWORD in docker/compose.yml or .env
docker compose -f docker/compose.yml up -d --build
```

### Option B — Update password hash in Postgres (preserves data)

Generate a bcrypt hash (cost 12, same as the app):

```bash
docker compose -f docker/compose.yml exec app node -e "
  const { hashSync } = require('bcryptjs');
  console.log(hashSync('YOUR-NEW-PASSWORD', 12));
"
```

Update the admin user (replace email and hash):

```bash
docker compose -f docker/compose.yml exec postgres psql -U berth -d berth -c \
  "UPDATE users SET password_hash = 'PASTE-BCRYPT-HASH', must_change_password = false WHERE email = 'admin@localhost';"
```

Sign in with the new password.

### Option C — Create another system admin

A signed-in system admin can create users at **Admin** → **Users**. For a locked-out sole admin, use Option B.

## Stopping and upgrading

```bash
# Stop, keep data
docker compose -f docker/compose.yml down

# Pull/build new images and restart
docker compose -f docker/compose.yml up -d --build
```

Before upgrading production, take a [backup](backup.md).

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `curl` to `/api/health` fails | `docker compose -f docker/compose.yml ps` — wait for `healthy` |
| `docker login` fails | `APP_URL` and `REGISTRY_AUTH_TOKEN_REALM` must match the URL clients use |
| Push returns 403 | Project must exist; user needs push permission on that project |
| Registry token errors | Signing key and `rootcert.pem` bundle must match — see [Key rotation](key-rotation.md) |

## Next steps

- [Production setup](production-setup.md) — deploy with TLS and production secrets
- [TLS](tls.md) — HTTPS for production
- [Backup](backup.md) — Postgres + blob storage
- [Garbage collection](gc.md) — reclaim space after deletes
- [Production checklist](production-checklist.md)
