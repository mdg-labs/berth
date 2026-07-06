# TLS and HTTPS

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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_request_buffering off;
    }
}
```

Berth reads `X-Forwarded-For` and `X-Real-IP` for rate limiting and audit client IPs.

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
