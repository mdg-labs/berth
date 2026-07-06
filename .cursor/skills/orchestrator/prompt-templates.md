# Orchestrator — Sub-agent prompt templates (Berth)

Copy and fill. Sub-agents do not see the orchestrator chat.

**Task model:** pass `model: "composer-2.5"` on every Task dispatch (execution + verifier), unless the operator names another model in chat.

**Orchestrator dispatch rules:**

- Build batch plan → show plan → start batch 1 (unless `plan only` / `wait`)
- **Parallel default:** up to **2** execution sub-agents when P5 + P6 run together (Lane P); Lane S otherwise
- **Lane P worktrees (mandatory):** `subagent_type: "best-of-n-runner"` on every Lane P execution + verifier Task
- **Every execution prompt** → **SCOPED CI GATE (SHELL)**; `required_permissions: ["all"]` on first Shell attempt
- **Lane P worktrees:** execution prompts must include `pnpm install` bootstrap before scoped CI
- **Every execution prompt** → **commit mandatory** before verifier handoff (`02-git-workflow.mdc`)
- After verifier PASS → orchestrator runs commit-linkage audit + `workspace-notes.md` update

---

## Roadmap execution

### Roadmap prompt section order (mandatory)

1. **TASK FIRST** — report In Progress
2. TASK / SESSION / BRANCH / LANE
3. ACCEPTANCE CRITERIA + DOC REFERENCE + READ/WRITE SCOPE
4. **SCOPED CI GATE (SHELL)** + **DB MIGRATIONS** (when schema)
5. WORK steps + **REQUIRED OUTPUT**

### TASK FIRST — mandatory header (roadmap execution)

Orchestrator fills in `P<phase>` or `P<phase>-T<nn>` and pastes this block **first**.

```text
⚠️ TASK FIRST — MANDATORY (before session memory, before Read/Grep, before any code)

Your FIRST action:
1. Output: TASK: P<phase>[-T<nn>] — In Progress

Do not create GitLab issues unless explicitly instructed.

Pre-handoff: Output TASK: P<phase>[-T<nn>] — In Review ONLY after scoped CI gate passes AND commit created.
```

### Roadmap — Lane S execution template

```text
⚠️ TASK FIRST — (paste filled block — MUST be first lines)

MODE: Roadmap
LANE: S
TARGET REPO: /home/mdguggenbichler/projects/registry-ui
WORK BRANCH: main
TASK ID: P<phase>[-T<nn>]
SESSION ID: P<phase>[-T<nn>]-<YYYYMMDD>-<4hex>

CI GATE (SHELL) — MANDATORY:
(paste SCOPED CI GATE block)

DB MIGRATIONS — MANDATORY (when touching schema):
(paste DB MIGRATIONS block)

ACCEPTANCE CRITERIA:
- <from ROADMAP.md phase exit criteria + task checkboxes for sub-task>

DOC REFERENCE:
- <from doc-index.md — spec §N, roadmap Pn>

READ SCOPE:
- docs/spec.md (§…)
- ROADMAP.md (Phase …)
- <paths>

WRITE SCOPE:
- <absolute paths>

WORK:
1. TASK FIRST — report In Progress
2. Read spec §0 constraints; record new decisions in DECISIONS.md
3. Session memory + implement within WRITE SCOPE
4. Scoped CI gate
5. COMMIT — one implementation commit:
   - Subject: <type>(<scope>)[P<phase>[-T<nn>]]: <summary>
   - Body: Task: P<phase>[-T<nn>]
   - Stage explicit paths only — never git add .
6. Report TASK: P<phase>[-T<nn>] — In Review

REQUIRED OUTPUT:
- TASK: … — In Progress (at start)
- TASK: … — In Review (at end, only after commit)
- COMMIT: SHA + full message
- Files changed (list)
- Tests / compose checks run + result
- DECISIONS.md entries added (if any)
- Notes for verifier (AC mapping)
```

### Roadmap — Verifier template

```text
MODE: Roadmap verify
TASK ID: P<phase>[-T<nn>]
TARGET REPO: /home/mdguggenbichler/projects/registry-ui
WORK BRANCH: main

CI GATE (SHELL) — MANDATORY:
(paste SCOPED CI GATE block)

VERIFY:
- Layer 1: committed paths ⊆ WRITE SCOPE; git status clean for scope paths
- Layer 2: scoped lint + typecheck + test (same rules as SCOPED CI GATE)
- Layer 3: each AC; spec refs; DECISIONS.md updated if needed; no Docker socket in app; no Harbor/joxit refs
- Layer 3b (integration phases): compose smoke / docker login / docker push as listed in ROADMAP exit criteria
- Layer 3c3: git log main --grep='\[P<phase>[-T<nn>\]' OR --grep='P<phase>[-T<nn>]' — must hit task commit SHA

REQUIRED OUTPUT:
- PASS | FAIL
- Commit SHA audited: <sha>
- Gaps with file:line hints (on FAIL)
```

---

## SCOPED CI GATE (SHELL) — mandatory

Berth is a **single Next.js app** (not a monorepo). Run scoped checks for WRITE ∪ READ paths.

```text
SCOPED CI GATE (SHELL) — MANDATORY:
- NEVER run pnpm or docker commands in the default sandbox
- ALWAYS invoke Shell with required_permissions: ["all"] on the FIRST attempt
- Run from repo root (main checkout or Lane P worktree)

FORBIDDEN (sub-agents):
  Unfiltered full E2E or compose integration unless task AC requires it

STEP 0 — Lane P worktree bootstrap:
  pnpm install

STEP 1 — Lint (scope paths when possible):
  pnpm lint
  # or: pnpm exec eslint "<paths-from-scope>"

STEP 2 — Typecheck:
  pnpm typecheck

STEP 3 — Unit tests (when they exist for scope):
  pnpm test

STEP 4 — Integration (when AC requires — P0+, P3+, P6+):
  docker compose -f docker/compose.yml up -d --build
  curl -sf http://localhost:8080/api/health
  curl -sf http://localhost:8080/api/ready   # when implemented
  docker login localhost:8080                  # P3+
  docker push localhost:8080/...               # P6+

If schema changed:
  pnpm db:generate
  git diff drizzle/

If any check fails → fix or report FAIL; do not commit or set In Review
Report which commands ran in REQUIRED OUTPUT
```

### Full CI — pre-push only (orchestrator / operator)

When the user **explicitly asks to push** to `origin`:

```bash
pnpm lint && pnpm typecheck && pnpm test
docker compose -f docker/compose.ci.yml up -d --build
pnpm test:integration   # when available
pnpm test:e2e           # P10+
```

---

## DB MIGRATIONS — mandatory when touching schema

```text
DB MIGRATIONS — MANDATORY (Drizzle):
- Edit lib/db/schema.ts (or project schema path) ONLY
- Generate: pnpm db:generate
- Commit generated SQL in drizzle/ alongside schema change in the same task commit
- FORBIDDEN: hand-written migration SQL unless documented exception in DECISIONS.md
```

---

## Worktree isolation (Lane P — mandatory)

Orchestrator: paste into **every** Lane P execution and verifier prompt. Dispatch with `subagent_type: "best-of-n-runner"`.

```text
⚠️ WORKTREE ISOLATION — MANDATORY (Lane P)

You run in an isolated Cursor git worktree — NOT the main repo checkout.

RULES:
0. FIRST SHELL: pnpm install
1. All edits, git, and CI inside your worktree cwd
2. Create/checkout WORK BRANCH only inside this worktree
3. Never git checkout WORK BRANCH in the main checkout while other Lane P agents run
4. Never commit to main during Lane P execution — orchestrator merges after batch verify

WORK BRANCH: orchestrator/P<phase>[-T<nn>]
```

### Orchestrator — Lane P batch merge (after verifier PASS)

```bash
cd /home/mdguggenbichler/projects/registry-ui
git checkout main
git merge orchestrator/P5    # example — merge each branch serially
git merge orchestrator/P6
```

Then commit-linkage audit before advancing queue.

---

## Orchestrator — pre-dispatch checklist

Before execution Task:

- [ ] Previous phase exit criteria met (see doc-index gates)
- [ ] Batch lane: Lane P (P5+P6 only, ≤2 agents) or Lane S
- [ ] Lane P: `subagent_type: "best-of-n-runner"` + WORKTREE ISOLATION block
- [ ] **TASK FIRST** with IDs filled in
- [ ] **SCOPED CI GATE** + **DB MIGRATIONS** (when schema)
- [ ] ACCEPTANCE CRITERIA from `ROADMAP.md` exit criteria (+ task checkbox for sub-tasks)

After execution:

- [ ] Output contains commit SHA — else FAIL, do not dispatch verifier

After verifier PASS:

- [ ] Lane P: merge task branch(es) to `main` serially
- [ ] Commit-linkage audit
- [ ] Update `workspace-notes.md`

---

## DOC REFERENCE block (examples)

```text
DOC REFERENCE (read these paths — do not paste contents):
- spec §3 — Docker Compose stack
- spec §4.1.1 — Registry proxy requirements
- spec §4.3 — Token auth flow, CSRF, session revocation
- spec §8 — Data model
- spec Appendix B — coss install batch (Shell only for P5)
- roadmap P6 — exit criteria
- decisions — JWT algorithm choice
```
