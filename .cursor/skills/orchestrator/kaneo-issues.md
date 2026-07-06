# Berth — Kaneo + GitHub issues reference

Orchestrator and **sub-agents** use this when a prompt includes a **ISSUE SYNC** block.

## Operating mode

| Mode | ID | When |
|------|-----|------|
| **Roadmap (greenfield MVP)** | `P0` … `P11` | `orchestrate P0` — progress in `workspace-notes.md` |
| **GitHub issue (bugs/iteration)** | `#N` | `implement #1` — Kaneo + GitHub bidirectional sync |

**Greenfield:** orchestrate against `ROADMAP.md`. **Do not** file roadmap phases as GitHub issues.

**Bugs / iteration:** create tasks in Kaneo (syncs to GitHub) or on GitHub (syncs to Kaneo), implement via **`#N`**.

## One identifier in git (mandatory)

| Context | ID | Example |
|---------|-----|---------|
| Operator, orchestrator, prompts, plans, **commits** | **GitHub `#N` only** | `#1` |

```text
feat(api)[#1]: add health endpoint

fixes #1
```

**Forbidden in commits:** Kaneo task IDs (`d4fd7ibt0agftmlv0bi8lcze`), `Task: …` footers, Kaneo task numbers as commit keys.

Kaneo IDs are for **MCP status sync only** — never appear in commit subjects or bodies.

## Workspace constants

| Field | Value |
|-------|-------|
| GitHub owner | `mdg-labs` |
| GitHub repo | `berth` |
| GitHub issue URL | `https://github.com/mdg-labs/berth/issues/<N>` |
| Kaneo workspace | MDG-Labs (`X3VbytvC7pKgazK2dAsOQIFtdGYRzdGH`) |
| Kaneo project | Berth (`odf06mcdzi4l40gb0aa0laps`, slug `BERTH`) |
| Sync | Bidirectional Kaneo ↔ GitHub (active) — task `number` = GitHub issue `number` |

## Resolving Kaneo `taskId` from GitHub `#N`

Sub-agents need Kaneo `taskId` for status MCP calls. **Never put it in commits.**

**Method 1 (preferred):** read GitHub issue body footer:

```text
---
<sub>Task: d4fd7ibt0agftmlv0bi8lcze</sub>
```

```bash
gh issue view <N> --repo mdg-labs/berth --json body -q .body
# regex: Task: ([a-z0-9]+)
```

**Method 2 (fallback):** Kaneo MCP `list_tasks`:

```text
projectId: odf06mcdzi4l40gb0aa0laps
→ find task where number === N
→ use task.id
```

## Tool selection

### GitHub (`gh` CLI — primary for read/close)

Shell `required_permissions: ["all"]` on first `gh` attempt.

| Operation | Command |
|-----------|---------|
| Read issue | `gh issue view <N> --repo mdg-labs/berth` |
| Read JSON | `gh issue view <N> --repo mdg-labs/berth --json title,body,state,labels` |
| List / search | `gh issue list --repo mdg-labs/berth --state open` |
| Comment | `gh issue comment <N> --repo mdg-labs/berth -b "…"` |
| Close (Done) | `gh issue close <N> --repo mdg-labs/berth` |
| Reopen (verifier FAIL) | `gh issue reopen <N> --repo mdg-labs/berth` |

GitHub MCP (`user-github`) `issue_read` / `issue_write` is acceptable when `gh` is unavailable.

### Kaneo MCP (`user-kaneo` — primary for status)

| Operation | Tool | Args |
|-----------|------|------|
| Get task | `get_task` | `taskId` |
| List tasks | `list_tasks` | `projectId`, optional `status` |
| Status transition | `update_task_status` | `taskId`, `status` |
| Verifier note | `create_task_comment` | `taskId`, `content` |

**Do not** pass Kaneo task IDs to git or commit messages.

## Status workflow (Kaneo ↔ GitHub labels)

Bidirectional sync maps Kaneo column status ↔ GitHub label `status:<status>`.

```
to-do → in-progress → in-review → done (GitHub issue closed)
```

| Stage | Kaneo `update_task_status` | GitHub (synced) | Who |
|-------|---------------------------|-----------------|-----|
| Ready | `to-do` | `status:to-do`, open | intake / triage |
| **In Progress** | `in-progress` | `status:in-progress` | **Execution** (first action) |
| **In Review** | `in-review` | `status:in-review` | **Execution** (after CI, before verifier) |
| **Done** | `done` + close GitHub | `closed` | **Verifier** + orchestrator confirm |

On verifier **FAIL:** Kaneo `to-do` + `gh issue reopen <N>` if closed.

**Vocabulary:** "Ready" in prose = Kaneo `to-do` / label `status:to-do`.

## Status sync — sub-agent duties

### Execution — first actions

1. `gh issue view <N> --repo mdg-labs/berth` — load AC from title/body
2. Resolve Kaneo `taskId` (see above) — store in session memory only
3. Kaneo MCP `update_task_status` → `in-progress`
4. Output: `ISSUE STATUS: In Progress on #<N>`

### Execution — last actions

1. **Scoped CI gate** passes
2. Kaneo MCP `update_task_status` → `in-review`
3. **One implementation commit:** `[#N]` subject + `fixes #N` body — **no Kaneo ID**
4. Output commit SHA before verifier handoff

### Verifier — PASS / FAIL

- **PASS:** Kaneo `create_task_comment` "Verifier: PASS" → Kaneo `update_task_status` `done` → `gh issue close <N>` → confirm `git log --grep='fixes #N'`
- **FAIL:** Kaneo comment "Verifier: FAIL — …" → Kaneo `to-do` → `gh issue reopen` if needed

### Orchestrator — after verifier PASS (mandatory)

1. **Commit-linkage audit** — `git log <base>..HEAD --grep='fixes #N'` must hit
2. Confirm GitHub closed: `gh issue view <N> --repo mdg-labs/berth --json state`
3. No `fixes #N` in run commits → **FAIL** — do not advance queue

## ISSUE SYNC blocks

### Execution

```text
ISSUE SYNC — EXECUTION:
- github: mdg-labs/berth
- issue: #<N> (ONLY id in commits and REQUIRED OUTPUT)
- kaneo projectId: odf06mcdzi4l40gb0aa0laps (status MCP only — never in commits)
- FIRST ACTION: resolve taskId → Kaneo update_task_status in-progress BEFORE code
- BEFORE HANDOFF: scoped CI passes → Kaneo in-review → one commit with fixes #<N>
- COMMIT: [#<N>] subject + fixes #<N> body (03-issue-commit-linking.mdc)
- FORBIDDEN: Kaneo taskId in commit; close issue during execution; git add .
- OUTPUT: commit SHA required — orchestrator will not dispatch verifier without it
```

### Verifier

```text
ISSUE SYNC — VERIFIER:
- github: mdg-labs/berth
- issue: #<N>
- kaneo taskId: <resolved> (MCP only)
- AFTER PASS: Kaneo comment → done → gh issue close → confirm fixes #N in git log
- AFTER FAIL: Kaneo comment → to-do → gh issue reopen if closed
```

## Epic / parent tasks

When a task has a parent GitHub issue `#P`:

| Commit | Subject | Body |
|--------|---------|------|
| Child work | `[#<leaf>][#<P>]` | `fixes #<leaf>` + `refs #<P>` |
| Final child closing epic | `[#<leaf>][#<P>]` | `fixes #<leaf>` + `refs #<P>` + `fixes #<P>` when in `CLOSE_PARENTS` |

Orchestrator passes `PARENT: #P`, `CLOSE_PARENTS: [#P]` or `none`.

Resolve parent Kaneo taskId separately for status updates on epic if needed.

## When to use GitHub issues vs roadmap

| Use GitHub `#N` | Use roadmap `P<n>` |
|-----------------|-------------------|
| Bug reports | Greenfield MVP (P0–P11) |
| Post-MVP features | `orchestrate P0` |
| `implement #1` | `implement P6` |
