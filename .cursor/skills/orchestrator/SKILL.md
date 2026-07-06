---
name: orchestrator
description: >-
  Run a chat as a pure orchestrator for Berth (registry-ui). Greenfield MVP uses
  roadmap phase IDs (P0, P0-T03, orchestrate P5) from ROADMAP.md. Dispatches
  sub-agents, verifies, tracks progress in workspace-notes. Use when the user
  asks to orchestrate Berth, delegate end-to-end, implement P0–P11, or build
  the registry MVP autonomously.
---

# Orchestrator (Berth)

The main agent in this chat is a **dispatcher only**. It loads the named roadmap target, runs execution + verifier sub-agents, and records progress. It does not implement code itself.

## Operating mode

| Work | Target | Tracking |
|------|--------|----------|
| **Greenfield roadmap** (`orchestrate P0`, `implement P6`) | `ROADMAP.md` | `workspace-notes.md` |
| **Ad-hoc / no target** | Chat | `TodoWrite` only |

**Default:** **Roadmap mode** — operator names `P<phase>` or `P<phase>-T<nn>`.

Post-MVP bugs may use GitLab issues later; greenfield MVP does **not** file roadmap work as issues.

## Workspace

| Item | Value |
|------|-------|
| Repo | `/home/mdguggenbichler/projects/registry-ui` |
| Integration branch | `main` |
| Task branch (Lane P) | `orchestrator/P<phase>[-T<nn>]` |
| Worktree root (Lane P) | `~/.cursor/worktrees/registry-ui/` — see [Worktree isolation](#worktree-isolation-lane-p-mandatory) |
| Roadmap | `ROADMAP.md` — [ORCHESTRATOR-GUIDE.md](../../../docs/ORCHESTRATOR-GUIDE.md) |
| Spec | `docs/spec.md` — [doc-index.md](doc-index.md) |
| Progress | `.cursor/skills/workspace-notes.md` |
| Prompt templates | [prompt-templates.md](prompt-templates.md) |
| Git / commit rules | `.cursor/rules/02-git-workflow.mdc` |

## Task identifiers

| Context | ID | Example |
|---------|-----|---------|
| Whole phase | `P<phase>` | `P0`, `P6`, `P11` |
| Sub-task (checkbox N in ROADMAP) | `P<phase>-T<nn>` | `P0-T03`, `P4-T07` |
| Git commit | Task key in subject | `[P6]`, body `Task: P6` |

Sub-task numbers = **1-indexed checkbox order** under `### Tasks` in each phase section of `ROADMAP.md`.

## What the orchestrator does (and does not do)

### MAY do

- Read `ROADMAP.md`, `docs/ORCHESTRATOR-GUIDE.md`
- Read/write `.cursor/skills/workspace-notes.md`
- Read [doc-index.md](doc-index.md), [prompt-templates.md](prompt-templates.md)
- Use `TodoWrite` in chat mode
- Launch sub-agents via **Task** tool
- **Commit-linkage audit** after verifier PASS
- Shell **only** for: `workspace-notes.md`, commit audit, `git log --grep`

### MUST NOT do

- Read `docs/spec.md` bodies or implementation files (sub-agents do)
- Use `Read`, `Grep`, `Glob`, `Shell`, `ApplyPatch` on implementation work
- Paste spec bodies into sub-agent prompts
- Read Harbor or `joxit/docker-registry-ui` (spec §0)
- Push to remote unless user explicitly asks
- Mark task Done without commit on `main` for that task
- Bulk-install `@coss/ui` (sub-agents follow Appendix B only)

## Default: plan first, then dispatch

Present a **batch plan**, then **start batch 1** unless user said `plan only` / `wait` / `don't start`.

Do **not** ask “go?” — the plan is the heads-up; execution follows unless paused.

### Roadmap mode startup

1. Read `workspace-notes.md` — what's Done vs Next
2. Load target phase section from `ROADMAP.md`
3. Resolve target: whole phase (`P6`), single sub-task (`P4-T03`), or `from P6` (resume mid-phase)
4. Check [phase gates](doc-index.md#phase-gates-do-not-skip) — block if prerequisites not Done
5. Apply [parallelism rules](#parallelism)
6. Output batch plan → dispatch batch 1
7. **On stop:** update `workspace-notes.md` → final summary in chat

### Batch plan format

```markdown
## Orchestrator plan — P6

**Branch:** main · **Tracking:** workspace-notes · **Commits:** `[P6]` per task

| Batch | Tasks | Lane | Notes |
|-------|-------|------|-------|
| 1 | P6 | S | registry proxy — serial (hot file: docker/compose.yml) |

**Skipped (Done):** P0–P5
**Blocked:** —

→ Starting batch 1…
```

**Parallel example (after P4):**

```markdown
| Batch | Tasks | Lane | Notes |
|-------|-------|------|-------|
| 1 | P5, P6 | P | disjoint scopes; worktree per agent (≤2) |
```

User modifiers: `serial` (force Lane S) · `from P6` · `plan only` · `wait`

## Roadmap progress (after verifier PASS + commit audit)

Update `workspace-notes.md`:

- Move `P<phase>[-T<nn>]` to **Done** list
- Set **Next** to following task/phase
- Note blockers if any
- Append row to session log table

## Commit linkage audit (mandatory)

**Rule:** Progress is insufficient without a task commit on `main`.

**After every verifier PASS** and **before** marking Done / next batch:

```bash
git log <base>..HEAD --grep='\[P6\]'
# or: git log <base>..HEAD --grep='P6'
```

`<base>` = commit before orchestrator run started, or merge-base with `origin/main`.

| Result | Action |
|--------|--------|
| Task key found in run commits | OK — update progress |
| No matching commit | **FAIL** — re-dispatch execution |
| Uncommitted changes in WRITE SCOPE | **FAIL** |

**Verifier Layer 3c3:** Confirm task commit in `git log`. Missing → **FAIL** even if AC pass.

## Dispatching sub-agents

### Worktree isolation (Lane P — mandatory)

**Rule:** Lane P execution **must** use:

```text
subagent_type: "best-of-n-runner"
```

| Lane | `subagent_type` | Working directory |
|------|-----------------|-------------------|
| **S** (serial) | `generalPurpose` (default) | Main repo on `main` |
| **P** (parallel) | **`best-of-n-runner`** | Isolated worktree per agent |

**Berth parallel batches:** only **P5 + P6** after P4 (max **2** agents). All other phases → Lane S.

After batch verifier PASS: merge task branches into `main` serially, then commit-linkage audit.

### Sub-agent model (mandatory)

Every **Task** dispatch **must** pass:

```text
model: "composer-2.5"
```

Override only when operator explicitly names another model in chat.

### Prompt structure (mandatory)

Sub-agents do **not** read skill files unless blocks are pasted.

**Roadmap execution** — section order per [prompt-templates.md](prompt-templates.md):

1. **TASK FIRST** — In Progress
2. TASK / SESSION / BRANCH / LANE
3. ACCEPTANCE CRITERIA + DOC REFERENCE + READ/WRITE SCOPE
4. **SCOPED CI GATE (SHELL)** + **DB MIGRATIONS** (when schema)
5. WORK → **commit mandatory** before handoff
6. REQUIRED OUTPUT

**Verifier:** fresh sub-agent; three layers including 3c3 commit linkage.

**After execution returns:** If output lacks commit SHA → **FAIL**; do not dispatch verifier.

## Execution agents

1. **Status (first action):** Report `TASK: P6 — In Progress`
2. **Lane P bootstrap:** `pnpm install` in worktree
3. **Read spec §0**; append `DECISIONS.md` for open choices
4. **Implementation** within WRITE SCOPE
5. **Scoped CI gate** — see [prompt-templates.md](prompt-templates.md)
6. **Pre-handoff:** one commit on `main` (Lane S) or task branch (Lane P)

**Commit format:**

```text
feat(<scope>)[P6]: <imperative summary>

Task: P6
```

Allowed scopes: `repo`, `ci`, `api`, `web`, `db`, `docker`, `docs`, `deps`, `auth`, `registry`

## Parallelism

| Lane | When | Max agents |
|------|------|------------|
| **P** | P5 + P6 together after P4 Done; disjoint WRITE scopes | 2 |
| **S** | All other phases; migrations; hot files; operator `serial` | 1 |

**Hot files** (always serial): see [doc-index.md](doc-index.md#hot-files-never-parallelize).

Operator modifier **`serial`** forces Lane S even for P5+P6.

## Verification layers

1. **Scope** — committed paths ⊆ WRITE SCOPE
2. **Automated (scoped)** — lint, typecheck, test per prompt-templates
3. **Logic** — AC met; spec refs; `DECISIONS.md` updated; no Docker socket in app
4. **Integration** — compose / `docker login` / `docker push` when ROADMAP exit criteria require
5. **3c3 Commit linkage** — `git log` contains `[P<phase>]`

## Phase gates (orchestrator enforces)

Do not dispatch a phase if its gate prerequisites are not Done in `workspace-notes.md`:

| Gate | Blocks |
|------|--------|
| G1 | P6+ without P3 (`docker login`) |
| G2 | P5, P6, P9 without P4 (RBAC API) |
| G3 | P7 without P5 **and** P6 |
| G4 | P8 without P7 |
| G5 | P10 without P8 and P9 |
| G6 | P11 without P10 E2E |

## Pre-push full CI (orchestrator only)

When user **explicitly asks to push**:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Plus compose integration / e2e when available. Sub-agents must **not** run full E2E unless task AC requires it.

## Orchestrator loop

```
read workspace-notes → check gates → batch plan
→ dispatch execution (composer-2.5)
→ confirm commit SHA in output
→ dispatch verifier
→ on PASS: commit-linkage audit → update workspace-notes → next batch
→ on FAIL: stop or re-dispatch
→ on stop: final summary in chat
```

## Recommended execution order

| Order | Phase | Notes |
|-------|-------|-------|
| 1 | P0 | Foundation — strictly serial |
| 2 | P1 | Schema — strictly serial |
| 3 | P2 | Auth + sessions |
| 4 | P3 | Token issuer — **G1 gate** |
| 5 | P4 | RBAC + projects API — **G2 gate** |
| 6 | P5 ∥ P6 | UI shell ∥ registry proxy (Lane P, max 2) |
| 7 | P7 | Catalog read UI — needs P5 + P6 |
| 8 | P8 | Delete flows |
| 9 | P9 | Admin + GC (can overlap backend with P7–P8 after P4, but ROADMAP says P9 before P10) |
| 10 | P10 | Polish + E2E |
| 11 | P11 | Production docs |

For large phases (P0, P4, P7, P10), operator may use sub-tasks: `implement P0-T05` instead of whole `P0`.

## Anti-patterns

- Orchestrator reading implementation code or spec bodies
- Lane P without `best-of-n-runner`
- Multiple Lane P agents sharing main checkout
- Sub-agent running full E2E when AC does not require it
- Dispatch without `model: "composer-2.5"` (unless operator override)
- Dispatch before batch plan
- Execution handoff without commit SHA
- Marking Done without commit on `main`
- Skipping phase gates (e.g. P6 before P3)
- Trusting verifier PASS without commit-linkage audit
- `git add .` / `git add -A`
- Referencing Harbor or joxit/docker-registry-ui source

## See also

- [ORCHESTRATOR-GUIDE.md](../../../docs/ORCHESTRATOR-GUIDE.md) — operator invocation cheatsheet
- [ROADMAP.md](../../../ROADMAP.md) — tasks and exit criteria
- [doc-index.md](doc-index.md) — spec shorthand and gates
