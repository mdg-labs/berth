#!/usr/bin/env bash
set -euo pipefail

LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"

if [ -n "$LAST_TAG" ]; then
  RANGE="${LAST_TAG}..HEAD"
else
  RANGE="HEAD"
fi

COMMITS="$(git log "$RANGE" --no-merges --pretty=format:"%s (%h)")"

declare -A SECTIONS=(
  [feat]="Features"
  [fix]="Bug fixes"
  [perf]="Performance"
  [refactor]="Refactoring"
  [docs]="Documentation"
  [test]="Tests"
  [ci]="CI"
  [build]="Build"
  [deps]="Dependencies"
  [chore]="Chores"
)

declare -A BUCKETS
BUCKETS[other]=""

while IFS= read -r line; do
  [ -z "$line" ] && continue

  commit_type=""
  parsed="$(printf '%s' "$line" | sed -nE 's/^([a-zA-Z]+)(\([^)]*\))?(\[[^]]*\])?:.*/\1/p')"
  if [ -n "$parsed" ]; then
    commit_type="$parsed"
  fi

  bucket="other"
  if [ -n "$commit_type" ] && [ -n "${SECTIONS[$commit_type]+x}" ]; then
    bucket="$commit_type"
  fi

  if [ -z "${BUCKETS[$bucket]:-}" ]; then
    BUCKETS[$bucket]="- ${line}"
  else
    BUCKETS[$bucket]="${BUCKETS[$bucket]}"$'\n'"- ${line}"
  fi
done <<< "$COMMITS"

if [ -z "$COMMITS" ]; then
  echo "No changes since ${LAST_TAG:-the beginning of history}."
  exit 0
fi

ORDER=(feat fix perf refactor docs test ci build deps chore other)

for key in "${ORDER[@]}"; do
  content="${BUCKETS[$key]:-}"
  [ -z "$content" ] && continue

  if [ "$key" = "other" ]; then
    heading="Other"
  else
    heading="${SECTIONS[$key]}"
  fi

  echo "## ${heading}"
  echo
  echo "$content"
  echo
done
