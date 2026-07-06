# Garbage collection runbook

Deleting tags or repositories in the Berth portal removes manifests from the registry API, but **blob storage is not freed immediately**. CNCF Distribution reclaims disk space only when an operator runs the **`garbage-collect`** CLI — there is no HTTP API for GC.

## Portal reference

System admins can open **Admin → Garbage collection** (`/admin/gc`) to see:

- Approximate **registry-data** volume size (app reads the mount at `REGISTRY_DATA_PATH`, default `/var/lib/registry`)
- A copy-paste **GC command** matching this runbook
- Warnings about stopping the registry before GC

The portal does **not** trigger GC — by design the app container has no Docker socket or registry exec access.

## When to run GC

- After deleting tags, bulk deletes, or whole repositories in the portal
- When `/admin/gc` shows elevated storage that no longer matches catalog usage
- On a maintenance window (GC is stop-the-world for writes)

## Prerequisites

**Stop writes to the registry** before GC. Either:

- Stop the registry service, or
- Set Distribution to maintenance read-only mode

Running GC while the registry accepts uploads risks **corrupting newly pushed images**.

## Procedure

### 1. Review storage

In the portal: **Admin → Garbage collection**, or:

```bash
curl -sf http://localhost:8080/api/admin/gc/status \
  -H "Cookie: berth_session=..."   # system admin session required
```

### 2. Stop the registry (recommended)

```bash
docker compose -f docker/compose.yml stop registry
```

The **app** can stay running (portal and API remain up; pushes will fail until registry is back).

### 3. Run garbage collection

From the repository root, run the same command shown in the portal:

```bash
docker compose -f docker/compose.yml run --rm --entrypoint registry \
  registry garbage-collect --delete-untagged /etc/distribution/config.yml
```

Flags:

| Flag | Effect |
|------|--------|
| `--delete-untagged` | Remove blobs no longer referenced by any manifest |
| `/etc/distribution/config.yml` | Registry config inside the image/mount (storage path, delete enabled) |

This uses the `registry-data` volume shared with the running stack.

### 4. Start the registry

```bash
docker compose -f docker/compose.yml start registry
```

Wait for healthy, then verify:

```bash
curl -sf http://localhost:8080/api/health
docker pull localhost:8080/my-project/hello:1.0   # known tag
```

### 5. Confirm space reclaimed

Check **Admin → Garbage collection** again — `storageHuman` should decrease (approximate; filesystem overhead may remain).

## Alternative: maintenance read-only

Instead of stopping the registry, advanced operators can enable Distribution maintenance mode in [`docker/registry/config.yml`](../docker/registry/config.yml) (`maintenance.readonly: true`), run the same `garbage-collect` command, then disable maintenance and restart. Stopping the service is simpler for most deployments.

## Compose project name

If your compose project name differs, adjust the command prefix. The app always suggests:

```text
docker compose -f docker/compose.yml run --rm --entrypoint registry registry garbage-collect --delete-untagged /etc/distribution/config.yml
```

Run from the directory containing `docker/compose.yml`, or pass `--project-directory`.

## Post-MVP

An optional GC-runner sidecar (Docker socket isolated from **app**) may automate this in a future release. MVP is manual only — see spec §3.1.

## Related docs

- [Backup](backup.md) — consider GC before archiving `registry-data` after large deletes
- [Install](install.md)
- [Production checklist](production-checklist.md)
