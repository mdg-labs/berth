# Orchestrator Guide — Berth Roadmap

How to build the MVP by orchestrating against `ROADMAP.md`. Use the **orchestrator skill** (`.cursor/skills/orchestrator/SKILL.md`) — do not improvise dispatch rules.

---

## Workflow

```text
1. Operator names roadmap target  →  orchestrator reads ROADMAP.md + workspace-notes
2. Batch plan (respect phase gates + parallel rules + Done skip)
3. Dispatch execution sub-agent(s) with prompt template (model: composer-2.5)
4. Execution: implement → scoped CI → one commit ([P<phase>]) → In Review
5. Verifier PASS + commit-linkage audit  →  mark Done in workspace-notes  →  next batch
6. On stop: final summary in chat
```

**Commits:** one task = one implementation commit on `main` (Lane S) or task branch merged to `main` (Lane P). Subject includes `[P<phase>]`; body includes `Task: P<phase>`.

---

## Invocation

| Command | Behavior |
|---------|----------|
| `orchestrate P0` | All incomplete work in Phase 0 |
| `implement P3` | Single roadmap phase |
| `implement P0-T05` | Single checkbox task within Phase 0 |
| `orchestrate through P3` | Sequential P0→P3 |
| `implement #1` | Single GitHub issue (Kaneo status sync) |
| `orchestrate #1` | Same as `implement #1` with verifier gate |
| `orchestrate P5 plan only` | Batch plan, no dispatch |
| `orchestrate P5 serial` | Force Lane S even if parallel-eligible |

**Roadmap IDs:** `P0` … `P11` (or `P0-T03` for sub-tasks).  
**Issue IDs:** GitHub `#N` on `mdg-labs/berth` — **never Kaneo task IDs in commits**.

**Progress:** `workspace-notes.md` (roadmap) · GitHub closed + Kaneo `done` (issue mode)

---

## What the orchestrator reads

| File | Purpose |
|------|---------|
| `ROADMAP.md` | Phases, tasks, exit criteria, parallel rules |
| `docs/spec.md` | *(sub-agents only — orchestrator uses doc-index)* |
| `.cursor/skills/workspace-notes.md` | Done / Next / blockers |
| `.cursor/skills/orchestrator/doc-index.md` | Spec shorthand, gates, hot files |
| `.cursor/skills/orchestrator/prompt-templates.md` | TASK FIRST / STATUS FIRST, CI GATE |
| `.cursor/skills/orchestrator/kaneo-issues.md` | GitHub `#N` + Kaneo MCP sync blocks |

The orchestrator does **not** read full spec bodies — sub-agents do.

---

## GitHub + Kaneo issue mode

For bugs and post-MVP work (`implement #1`):

1. **GitHub `#N`** is the only ID in plans, prompts, and **commits** (`[#1]` + `fixes #1`)
2. **Kaneo MCP** drives status: `to-do` → `in-progress` → `in-review` → `done` (syncs to GitHub labels)
3. Resolve Kaneo `taskId` from GitHub issue body footer (`Task: <id>`) — MCP only, never in git
4. Close via `gh issue close <N>` after verifier PASS

Test issue: [mdg-labs/berth#1](https://github.com/mdg-labs/berth/issues/1) ↔ Kaneo Berth task #1.

```text
@orchestrator implement #1
```

---

## Sub-agent prompt template (minimum)

Use the full template from `.cursor/skills/orchestrator/prompt-templates.md`. Minimum sections:

```markdown
⚠️ TASK FIRST — MANDATORY
TASK: P6 — In Progress

MODE: Roadmap · LANE: S · BRANCH: main
SESSION: P6-<YYYYMMDD>-<4hex>

DOC REFERENCE: spec §4.1.1, spec §7.6, roadmap P6

READ SCOPE:
- docs/spec.md (§4.1.1, §7.6)
- ROADMAP.md (Phase 6)

WRITE SCOPE:
- /home/mdguggenbichler/projects/registry-ui/app/v2/...
- ...

ACCEPTANCE CRITERIA:
(paste exit criteria from ROADMAP.md Phase 6 verbatim)

SCOPED CI GATE (SHELL): (see prompt-templates.md)

WORK:
1. TASK FIRST → implement → scoped CI
2. COMMIT: feat(registry)[P6]: <summary> / body: Task: P6
3. TASK: P6 — In Review (only after commit)
```

---

## Marking progress

After verifier PASS **and** `git log --grep='P6'`:

```markdown
## Roadmap progress

**Current phase:** P6

### Done
- P0 … P6

### Next
- P7
```

**Do not** mark Done if the task commit is missing from `git log`.

---

## Serial vs parallel decision tree

```
Does task touch lib/db/schema.ts or drizzle/?
  YES → SERIAL

Does task run db:generate?
  YES → SERIAL

Is target P5 or P6 AND P4 Done AND other phase not in flight?
  YES → PARALLEL OK (Lane P, max 2: P5 + P6)

Did operator pass `serial`?
  YES → SERIAL

Are WRITE scopes overlapping (compose.yml, layout.tsx)?
  YES → SERIAL
```

---

## Phase gates (do not skip)

| Gate | Requirement |
|------|-------------|
| **G1** | P3 exit (`docker login`) before P6 |
| **G2** | P4 exit (RBAC API) before P5, P6, P9 |
| **G3** | P5 **and** P6 Done before P7 |
| **G4** | P7 Done before P8 |
| **G5** | P8 + P9 Done before P10 |
| **G6** | P10 E2E green before P11 |

---

## Hot files (never parallelize)

| File | Phases |
|------|--------|
| `lib/db/schema.ts` | P1+ |
| `drizzle/**` | P1+ |
| `pnpm-lock.yaml` | any dep add |
| `docker/compose.yml` | P0, P3, P6 |
| `app/layout.tsx` | P5 |

---

## Verifier checklist (every task)

1. WRITE scope respected — committed paths only
2. **Task commit exists** — `git log --grep='[P6]'` or `P6`
3. Scoped CI passed (lint, typecheck, test as applicable)
4. ROADMAP exit criteria satisfied (including docker/compose checks when listed)
5. Drizzle migrations generated, not hand-written
6. `DECISIONS.md` updated for new choices
7. No Docker socket mounted in `app` service
8. No Harbor / joxit/docker-registry-ui references in implementation
9. coss: Appendix B batch only (UI phases)
10. **Issue mode:** commit contains `fixes #N` only — no Kaneo task ID; GitHub issue closed after PASS

## When to use GitHub issues vs roadmap

| Use GitHub `#N` | Use roadmap `P<n>` |
|-----------------|---------------------|
| Bug reports | Greenfield MVP (P0–P11) |
| Post-MVP features | `orchestrate P0` |
| `implement #1` | `implement P6` |

## Getting started

```text
@orchestrator orchestrate P0
```

**Issue (test sync):**

```text
@orchestrator implement #1
```

---

**See also:** `ROADMAP.md`, `.cursor/skills/orchestrator/SKILL.md`, `.cursor/rules/01-orchestrator.mdc`
