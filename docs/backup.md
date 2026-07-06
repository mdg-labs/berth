# Backup and restore

Berth stores state in two places:

| Data | Location | Contents |
|------|----------|----------|
| **Platform metadata** | `postgres-data` volume | Users, projects, RBAC, sessions, audit log |
| **Image blobs** | `registry-data` volume | OCI layers and manifests (Distribution filesystem storage) |

Registry content is **not** duplicated in Postgres. You must back up **both** volumes (or their equivalents) for a full restore.

## Backup procedure

### 1. Postgres logical dump

While the stack is running:

```bash
docker compose -f docker/compose.yml exec -T postgres \
  pg_dump -U berth -d berth --format=custom \
  > berth-$(date +%Y%m%d)-postgres.dump
```

For a plain SQL file:

```bash
docker compose -f docker/compose.yml exec -T postgres \
  pg_dump -U berth -d berth \
  > berth-$(date +%Y%m%d)-postgres.sql
```

**Tip:** For a consistent snapshot under write load, stop the app first (registry pushes still work through a running app; for quiesced metadata, stop **app** only):

```bash
docker compose -f docker/compose.yml stop app
# run pg_dump
docker compose -f docker/compose.yml start app
```

### 2. Registry blob volume

The volume name is prefixed by the compose project (default project directory name). List volumes:

```bash
docker volume ls | grep registry-data
```

Archive the volume (replace `berth_registry-data` with your volume name):

```bash
docker run --rm \
  -v berth_registry-data:/data:ro \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/berth-$(date +%Y%m%d)-registry-data.tar.gz -C /data .
```

### 3. Secrets and configuration

Back up separately (do **not** commit to git):

- `SESSION_SECRET`
- `TOKEN_SIGNING_KEY` / private key file
- `TOKEN_CERT` / cert file and registry `rootcert.pem` bundle
- OIDC client secret
- Compose overrides and TLS certificates

Document the `APP_URL` and registry token realm used at backup time.

## Restore procedure

### Prerequisites

- Same Berth version (or newer with compatible migrations)
- Signing keys and cert bundle from backup (or a planned rotation — see [Key rotation](key-rotation.md))

### 1. Restore Postgres

With a fresh stack (empty `postgres-data` volume):

```bash
docker compose -f docker/compose.yml up -d postgres
# wait for healthy

docker compose -f docker/compose.yml exec -T postgres \
  pg_restore -U berth -d berth --clean --if-exists \
  < berth-YYYYMMDD-postgres.dump
```

For plain SQL:

```bash
docker compose -f docker/compose.yml exec -T postgres \
  psql -U berth -d berth < berth-YYYYMMDD-postgres.sql
```

### 2. Restore registry data

Stop services that use the volume:

```bash
docker compose -f docker/compose.yml down
```

Restore into the volume (create empty volume first if needed):

```bash
docker volume create berth_registry-data

docker run --rm \
  -v berth_registry-data:/data \
  -v "$(pwd)":/backup \
  alpine sh -c "cd /data && tar xzf /backup/berth-YYYYMMDD-registry-data.tar.gz"
```

### 3. Start the stack

```bash
docker compose -f docker/compose.yml up -d
curl -sf http://localhost:8080/api/ready
```

Verify portal login, project list, and `docker pull` for a known tag.

## Backup schedule (production)

| Frequency | What |
|-----------|------|
| Daily | `pg_dump` |
| Daily or weekly | `registry-data` archive (size-dependent) |
| On change | Secrets, TLS certs, compose env |

Test restores periodically — an untested backup is not a backup.

## Related docs

- [Install](install.md)
- [Garbage collection](gc.md) — run GC before backup if you want smaller blob archives after deletes
- [Production checklist](production-checklist.md)
