# Known escapes

Defect patterns that passed a `task-verifier` PASS and were later confirmed
real in review (CodeRabbit on a promotion or unit PR). `task-executor` checks
its change against this list before committing; `task-verifier` checks each
commit against it under layers 6 and 7. `pr-review` appends a line whenever it
fixes a confirmed finding whose pattern is not here yet.

One line per pattern: **category** — what goes wrong — where it was seen.
Keep it to patterns, not individual bugs; merge a new instance into an
existing line by adding its PR number.

## Data and concurrency

- **Read-then-write race** — an `UPDATE` after a `SELECT` filters on the id only and does not repeat the conditions (owner, not revoked, expected version or hash) the read relied on, so a concurrent change between them is overwritten — PR 15
- **Untruthful result** — an operation's result or audit entry reports an effect it did not perform (e.g. a digest listed as deleted when only a tag reference was removed) — PR 15
- **Direct references only** — "unreferenced" is computed from direct links alone, ignoring transitive references (children of an index or manifest list), so referenced data is offered for deletion — PR 15

## Input and API

- **Cast, not validated** — a request body or array is cast to its TypeScript type with no runtime check (or only the first element checked), so a wrong-typed value changes behaviour or throws into a 500 — PR 15
- **Unbounded fan-out** — `Promise.all` over a list of unbounded length issues one network call per element with no concurrency limit — PR 15

## CI workflows

- **Expression in shell source** — `${{ … }}` event or input data is expanded into a `run:` script instead of passed through `env:` and validated — PR 15
- **Built ≠ tested commit** — a publish job checks out a moving branch ref, or a per-SHA concurrency group lets an older run publish a shared tag last, so the published artifact is not the commit CI tested — PR 15

## Operator config and docs

- **Compose override assumed, not rendered** — a comment, or `!reset` with values, is assumed to unset or replace an inherited compose value; the merged `docker compose config` output was never checked — PR 15
- **Documented command not run as written** — an operator snippet fails when followed in order (permissions changed after ownership moves away, TLS block enabled before its certificate exists, image tag format differing from what the publisher pushes) — PR 15
- **Edge proxy appends forwarded headers** — the edge proxy appends to a client-supplied `X-Forwarded-For` while the app trusts the first entry — PR 15
