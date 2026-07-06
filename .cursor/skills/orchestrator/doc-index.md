# Berth — Spec doc index

Quick reference for orchestrator traceability and sub-agent **DOC REFERENCE** blocks.
Sub-agents read these files themselves — never paste full doc bodies into prompts.

## Precedence (when docs conflict)

1. `docs/spec.md` — **product & architecture source of truth**
2. `ROADMAP.md` — **execution order, tasks, exit criteria**
3. `DECISIONS.md` — **resolved implementation choices**

## Doc shorthand

| Shorthand | File | Covers |
|-----------|------|--------|
| `spec` | `docs/spec.md` | Full product spec |
| `spec §N` | `docs/spec.md` section N | Targeted reference |
| `roadmap` | `ROADMAP.md` | Phases P0–P11, tasks, exit criteria, parallel rules |
| `decisions` | `DECISIONS.md` | ORM, auth, JWT algo, copyright, coss licenses |
| `coss` | `.agents/skills/coss/SKILL.md` | coss UI primitives, composition rules |
| `coss-particles` | `.agents/skills/coss-particles/SKILL.md` | Particle JSON URLs |
| `orchestrator` | `docs/ORCHESTRATOR-GUIDE.md` | Invocation, gates, verifier checklist |

Reference sections as `spec §4.3`, `roadmap P6`, `spec Appendix B`.

**Cursor rules:** `.cursor/rules/` — orchestrator dispatch (`01-orchestrator.mdc`), git/commits (`02-git-workflow.mdc`).

## Spec sections → phases

| Section | Topic | Primary phases |
|---------|-------|----------------|
| `spec §0` | Agent constraints | All |
| `spec §3` | Docker Compose stack | P0, P11 |
| `spec §4` | Architecture, proxy, tokens, sessions | P2, P3, P6 |
| `spec §5` | Identity, projects, RBAC | P2, P4, P9 |
| `spec §6` | MVP features, routes | P5, P7, P8, P9 |
| `spec §7` | API surface | P2–P9 |
| `spec §8` | Data model | P1 |
| `spec §9` | Configuration | P0, P3 |
| `spec §10` | Tech stack | P0 |
| `spec §11` | Project structure | P0 |
| `spec §13` | Testing strategy | P1+, P10 |
| `spec §15` | Canonical sources (Distribution, OCI) | P3, P6, P7 |
| `spec §16` | License | P0, P5 |
| `spec Appendix A` | Registry HTTP API | P6, P7, P8 |
| `spec Appendix B` | coss UI contract | P5, P7, P8, P9 |
| `spec Appendix C` | DECISIONS.md seeds | P0 |

## Phase gates (do not skip)

| Gate | Requirement |
|------|-------------|
| **G1** | P3 exit criteria pass (`docker login`) before P6 |
| **G2** | P4 exit criteria pass (RBAC API) before P5, P6, P9 |
| **G3** | P5 **and** P6 both Done before P7 |
| **G4** | P7 Done before P8 |
| **G5** | P8 + P9 Done before P10 |
| **G6** | P10 E2E green before P11 release docs |

## Parallel phases

| After | May run in parallel |
|-------|---------------------|
| P4 Done | **P5** (UI shell) + **P6** (registry proxy) — Lane P, max 2 agents |

## Hot files (never parallelize)

| File / path | Phases |
|-------------|--------|
| `lib/db/schema.ts` (or `drizzle/schema.ts`) | P1, any schema change |
| `drizzle/**` migrations | P1 |
| `pnpm-lock.yaml` | any dependency add |
| `docker/compose.yml` | P0, P3, P6 |
| `app/layout.tsx` | P5 |
| Token signing keys / cert bundle config | P3 |

## Task ID format

| ID | Meaning | Commit subject |
|----|---------|----------------|
| `P0` … `P11` | Whole phase | `feat(scope)[P0]: …` |
| `P0-T03` | Nth checkbox task in phase section of `ROADMAP.md` | `feat(scope)[P0-T03]: …` |

Sub-task numbers match **checkbox order** under `### Tasks` in each phase section of `ROADMAP.md` (1-indexed).

## Default verification commands

Run from repo root (`/home/mdguggenbichler/projects/registry-ui`).

| Check | Command | When |
|-------|---------|------|
| lint | `pnpm lint` | Always (or eslint on scope paths) |
| typecheck | `pnpm typecheck` | Always |
| unit test | `pnpm test` | When tests exist for scope |
| integration | `docker compose -f docker/compose.ci.yml up -d` then `pnpm test:integration` | P3+, P6+ |
| compose smoke | `docker compose -f docker/compose.yml up -d` + curl health | P0+ |
| docker login | `docker login localhost:8080` | P3+ |
| docker push | `docker push localhost:8080/<project>/<repo>:tag` | P6+ |
| e2e | `pnpm test:e2e` | P10 |
| migration | `pnpm db:generate` then `git diff drizzle/` | schema tasks |

Mark `n/a` only when the command does not exist yet (early scaffold).

## Universal verifier checks (every task)

- Conventional commit with task linkage (`02-git-workflow.mdc`)
- TypeScript strict; no `any`; no `console.log` in production paths
- Drizzle: edit schema only, run `db:generate`, commit generated SQL
- No Harbor / joxit/docker-registry-ui source as reference (spec §0)
- No bulk `@coss/ui` install — Appendix B batches only
- No Docker socket in `app` container (spec §3.1)
- `/v2/*` always proxied through app — no dev registry port shortcut (spec Appendix C)
- Registry tokens include `x5c` header (spec §4.2)
- New decisions recorded in `DECISIONS.md`
