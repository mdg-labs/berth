# TLS and HTTPS

For a full production walkthrough (secrets, compose override, first push), see [Production setup](production-setup.md). This document covers TLS options in depth.

Berth’s **app** serves plain HTTP on port **3000** inside the container. Compose maps it to **8080** on the host for local development. Production deployments should terminate TLS at the edge and set `APP_URL` to your `https://` URL.

The self-signed material in `docker/registry/certs/rootcert.pem` and `docker/token/dev-signing-key.pem` is for **registry JWT signing trust**, not HTTPS. Do not confuse token-signing certs with TLS certificates.

## Why TLS matters

Several behaviors depend on `APP_URL`:

| Feature | Requires correct `APP_URL` |
|---------|---------------------------|
| OIDC redirect URIs | Yes |
| Session cookie `Secure` flag | Set when `APP_URL` uses `https://` |
| Registry token realm (`REGISTRY_AUTH_TOKEN_REALM`) | Must match what Docker clients resolve |
| Registry proxy `Location` headers | Rewritten to public host |

After enabling HTTPS, update **both**:

- `APP_URL` on the **app** service (e.g. `https://registry.example.com`)
- `REGISTRY_AUTH_TOKEN_REALM` on the **registry** service (e.g. `https://registry.example.com/api/auth/token`)

Also update `auth.token.realm` in [`docker/registry/config.yml`](../docker/registry/config.yml) if you mount a custom config.

## Option 1 — Reverse proxy (recommended)

Place Caddy, nginx, or Traefik in front of Berth. The proxy terminates TLS and forwards to the app container.

```text
Internet ──TLS──► reverse proxy ──HTTP──► app:3000
                                              │
                                              └──► registry:5000 (internal, via app proxy)
```

### Example: Caddy on the same host

```caddyfile
registry.example.com {
    reverse_proxy localhost:8080
}
```

In `docker/compose.yml` (or an override file), set:

```yaml
app:
  environment:
    APP_URL: https://registry.example.com

registry:
  environment:
    REGISTRY_AUTH_TOKEN_REALM: https://registry.example.com/api/auth/token
```

Restart the stack after changing env vars:

```bash
docker compose -f docker/compose.yml up -d
```

### Example: nginx

```nginx
server {
    listen 443 ssl http2;
    server_name registry.example.com;

    ssl_certificate     /etc/ssl/certs/registry.crt;
    ssl_certificate_key /etc/ssl/private/registry.key;

    client_max_body_size 0;   # large layer uploads

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_request_buffering off;
    }
}
```

Berth derives the client IP for rate limiting and audit entries from `X-Forwarded-For`, counting `TRUSTED_PROXY_HOPS` entries from the right (default `1`, one edge proxy in front of the app). The rightmost entry is the one your edge proxy wrote, so a leading entry supplied by the client never changes the result, whether the proxy overwrites the header (nginx `$remote_addr`, Caddy's `reverse_proxy` default) or appends to it (`$proxy_add_x_forwarded_for`).

- Set `TRUSTED_PROXY_HOPS` to the number of proxies you run in front of the app. If the header has fewer entries than that, the leftmost entry is used.
- With more than one proxy in a chain (for example a CDN in front of nginx and hops set to `2`), only the outermost proxy may overwrite `X-Forwarded-For`. Every proxy behind it must append (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`), so the header the app receives is `<client>, <outer proxy>` and the entry two from the right is the client. The nginx example above overwrites and is therefore only correct as the outermost proxy; behind a CDN, replace its `X-Forwarded-For` line with the appending form and keep `TRUSTED_PROXY_HOPS` at `2`.
- Set it to `0` when the app is reached without a proxy: forwarded headers are then ignored and every client shares the address `unknown`, so per-IP rate limits become a single global bucket.
- Set `TRUSTED_PROXY_HEADER=x-real-ip` to read a single-address `X-Real-IP` header instead of `X-Forwarded-For`. `X-Real-IP` is ignored otherwise. Use it only when the proxy that clients connect to directly overwrites `X-Real-IP` with the connecting address and no client can reach the app directly. That holds for the nginx example above (`proxy_set_header X-Real-IP $remote_addr;`) when it is the single edge proxy. It does not hold for the Caddy example, which leaves `X-Real-IP` untouched, so a client-sent value would reach the app and could be rotated to bypass per-IP rate limits, unless you add `header_up X-Real-IP {remote_host}` to its `reverse_proxy` block. It also does not hold for nginx behind a CDN, where `$remote_addr` is the CDN address and every client behind that node shares one rate-limit bucket; use `X-Forwarded-For` with `TRUSTED_PROXY_HOPS` there.

### Docker clients

```bash
docker login registry.example.com
docker push registry.example.com/my-project/app:1.0
```

Use the same hostname in `APP_URL` and token realm — not `localhost`.

## Option 2 — TLS in Compose (edge container)

Add a fourth service (e.g. Caddy or Traefik) to your compose file that listens on `443` and proxies to `app:3000`. This keeps TLS configuration in Compose without modifying the Berth app image.

Pattern:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on:
      - app

  app:
    # no host port publish — only reachable via caddy
    expose:
      - "3000"
```

Use Caddy’s automatic Let’s Encrypt (`tls { email you@example.com }`) or mount your own certs. Set `APP_URL` to the public HTTPS URL as in Option 1.

## Option 3 — Dev HTTP (default compose)

The stock [`docker/compose.yml`](../docker/compose.yml) publishes `8080:3000` without TLS. This is intentional for local development only.

| Item | Dev default |
|------|-------------|
| Portal URL | `http://localhost:8080` |
| `APP_URL` | `http://localhost:8080` |
| Token signing | Self-signed RSA cert in `docker/registry/certs/rootcert.pem` |

**Upgrade path to production:**

1. Generate production signing keys — see [Key rotation](key-rotation.md) (do not reuse dev keys)
2. Set `SESSION_SECRET` to a strong random value
3. Remove or change `BOOTSTRAP_ADMIN_PASSWORD`
4. Enable HTTPS (Option 1 or 2) and set `APP_URL` / token realm to `https://…`
5. Complete the [Production checklist](production-checklist.md)

## Certificate renewal

- **Reverse proxy / Caddy:** renew TLS certs at the proxy; Berth app containers do not need restarts for TLS cert renewal unless you change `APP_URL`.
- **Token signing certs:** separate from TLS — rotate on a schedule via [Key rotation](key-rotation.md).

## Related docs

- [Install](install.md)
- [Key rotation](key-rotation.md)
- [Production checklist](production-checklist.md)
