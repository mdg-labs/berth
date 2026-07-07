#!/usr/bin/env bash
# Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE
#
# Pragmatic i18n guard for migrated UI directories. Fails on obvious hardcoded
# user-facing English; allowlists translation helpers, tests, and dynamic data.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SCAN_PATHS=(
  "components"
  "app/[locale]"
  "lib/email"
  "lib/navigation"
  "lib/users"
)

FAIL=0

report_hits() {
  local label="$1"
  local hits="$2"

  if [[ -n "$hits" ]]; then
    echo "i18n check failed: ${label}"
    echo "$hits"
    echo
    FAIL=1
  fi
}

filter_allowlisted() {
  grep -v -E '(useTranslations|getTranslations|\bt\(|\btCommon\(|\btErrors\(|\btRoles\(|formatApiError)' \
    | grep -v -E '(Copyright|@/messages/|messages/)' \
    | grep -v -E '<Kbd>(Ctrl|Cmd|Meta|Shift|Alt|K|⌘)</Kbd>' \
    | grep -v -E 'throw new Error' \
    | grep -v -E 'new ApiError\(' \
    || true
}

rg_scan() {
  local pattern="$1"
  local path

  for path in "${SCAN_PATHS[@]}"; do
    rg -n \
      --glob '*.tsx' \
      --glob '*.ts' \
      --glob '!**/*.test.ts' \
      --glob '!**/*.test.tsx' \
      --glob '!**/tests/**' \
      "$pattern" \
      "$path" 2>/dev/null || true
  done | filter_allowlisted
}

report_hits "hardcoded placeholder/aria/title attributes" "$(
  rg_scan '(placeholder|aria-label|aria-labelledby|title|description)=\{?["'"'"'][A-Z]'
)"

report_hits "hardcoded toast/alert copy" "$(
  rg_scan '(title|description|label):\s*["'"'"'][A-Z]'
)"

report_hits "hardcoded JSX text nodes" "$(
  rg_scan '>\s*[A-Z][a-zA-Z][^<{]{2,}\s*<'
)"

report_hits "UI reads error.message (use formatApiError)" "$(
  rg -n \
    --glob 'components/**/*.tsx' \
    --glob 'components/**/*.ts' \
    --glob '!**/*.test.ts' \
    --glob '!**/*.test.tsx' \
    'error\.message' \
    components 2>/dev/null \
    | grep -v -E 'throw new Error' \
    || true
)"

if [[ $FAIL -ne 0 ]]; then
  echo "Fix hardcoded strings with useTranslations()/getTranslations() and messages/en/*.json"
  exit 1
fi

echo "i18n string check passed."
