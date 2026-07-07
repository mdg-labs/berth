# Berth workspace notes

Cross-session context for orchestrator runs. Update at the end of each orchestrator session.

## Current focus

- Greenfield MVP — orchestrate from `ROADMAP.md` (Phases P0–P11)
- Progress tracked here (not GitLab issues) until MVP ships
- Authoritative spec: `docs/spec.md`

## Roadmap progress

**Current phase:** MVP complete (P0–P11)

### Done

- P0 — Repo bootstrap & compose skeleton (`1db0864`)
- P1 — Postgres schema & bootstrap admin (`4867c5e`)
- P2 — Local auth, OIDC, sessions (`8539fea`)
- P3 — Token issuer & registry trust (`54b9b25`)
- P4 — RBAC, projects, members API (`8d559ea`)
- P5 — coss UI shell (`f55f8da`)
- P6 — Registry proxy & push/pull (`04679e7`)
- P7 — Portal catalog, tags, tag detail (`d76d7e0`)
- P8 — Delete flows (`5d5cb99`)
- P9 — Admin, project settings, GC status (`b5127a0`)
- P10 — Polish, accessibility, E2E (`08a3021`)
- P11 — Production docs & hardening guides (`fb5e157`)

### Next

- Post-MVP backlog (see ROADMAP.md) — issue mode or ad-hoc
- i18n: add second locale (`de`) + locale picker before public release

### Blocked

_(none)_

## Session log

| Date | Target | Outcome | Commits |
|------|--------|---------|---------|
| 2026-07-06 | P0 | PASS — verifier + commit audit | `1db0864` |
| 2026-07-06 | P1 | PASS — verifier + commit audit (branch fix: detached HEAD → main) | `4867c5e` |
| 2026-07-06 | P2 | PASS — verifier + commit audit | `8539fea` |
| 2026-07-06 | P3 | PASS — verifier + commit audit | `54b9b25` |
| 2026-07-06 | P4 | PASS — verifier + commit audit | `8d559ea` |
| 2026-07-06 | P5 | PASS — verifier + commit audit | `f55f8da` |
| 2026-07-06 | P6 | PASS — verifier + commit audit | `04679e7` |
| 2026-07-06 | P7 | PASS — verifier + commit audit | `d76d7e0` |
| 2026-07-06 | P8 | PASS — verifier + commit audit | `5d5cb99` |
| 2026-07-06 | P9 | PASS — verifier + commit audit | `b5127a0` |
| 2026-07-06 | P10 | PASS — verifier + commit audit | `08a3021` |
| 2026-07-06 | P11 | PASS — verifier + commit audit — **MVP complete** | `fb5e157` |
| 2026-07-07 | i18n rollout | PASS — 8 batches, next-intl scaffold + full EN catalog | `d3ea455`…`472a87e` |
