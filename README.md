# Berth

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A self-hosted OCI artifact registry with Harbor-class identity, projects, and RBAC — delivered as a `docker compose up` stack with a modern Next.js portal.

## Quick start (Phase 0)

```bash
docker compose -f docker/compose.yml up -d --build
curl http://localhost:8080/api/health
```

## Documentation

- [Product specification](docs/spec.md)
- [Implementation roadmap](ROADMAP.md)
- [Decision log](DECISIONS.md)

## License

Apache License 2.0 — see [LICENSE](LICENSE).
