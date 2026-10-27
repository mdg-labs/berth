#!/usr/bin/env bash
# Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE
#
# Exercises release-exists.sh against a fake `gh` placed first on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${HERE}/release-exists.sh"

STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat > "${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
if [ -n "${FAKE_GH_STDERR:-}" ]; then
  echo "$FAKE_GH_STDERR" >&2
fi
exit "${FAKE_GH_EXIT:-0}"
STUB
chmod +x "${STUB_DIR}/gh"

failures=0

check() {
  local name="$1" want="$2" want_err="$3" exit_code="$4" stderr_text="$5"
  local got=0 out
  out="$(PATH="${STUB_DIR}:${PATH}" FAKE_GH_EXIT="$exit_code" FAKE_GH_STDERR="$stderr_text" \
    "$SCRIPT" v1.2.3 2>&1)" || got=$?
  if [ "$got" -ne "$want" ]; then
    echo "FAIL ${name}: exit ${got}, want ${want}"
    failures=$((failures + 1))
    return
  fi
  if [ -n "$want_err" ] && [[ "$out" != *"$want_err"* ]]; then
    echo "FAIL ${name}: output missing '${want_err}': ${out}"
    failures=$((failures + 1))
    return
  fi
  echo "ok   ${name}"
}

check "release exists" 10 "" 0 ""
check "release not found" 0 "" 1 "release not found"
check "network error" 1 "dial tcp: lookup api.github.com" 1 "error connecting to api.github.com: dial tcp: lookup api.github.com"
check "api error with other exit code" 1 "HTTP 502" 4 "HTTP 502: Bad Gateway"
check "rate limit" 1 "API rate limit exceeded" 1 "HTTP 403: API rate limit exceeded"

if [ "$failures" -ne 0 ]; then
  echo "${failures} failure(s)"
  exit 1
fi
