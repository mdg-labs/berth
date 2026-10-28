#!/usr/bin/env bash
# Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE
#
# Reports whether a published GitHub release exists for a tag.
#   exit 0   no release for the tag
#   exit 10  a release exists
#   exit 1   the lookup itself failed (gh error text is printed to stderr)
set -euo pipefail

TAG="${1:?usage: release-exists.sh <tag>}"

status=0
err="$(gh release view "$TAG" 2>&1 >/dev/null)" || status=$?

if [ "$status" -eq 0 ]; then
  exit 10
fi

if [[ "$err" == *"release not found"* ]]; then
  exit 0
fi

echo "gh release view ${TAG} failed (exit ${status}): ${err}" >&2
exit 1
