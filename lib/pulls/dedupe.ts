// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { PULL_DEDUPE_WINDOW_MS } from "./constants";

export type PullDedupeInput = {
  hasRecentImageDigestPull: boolean;
  hasRecentRepositoryDigestPull: boolean;
};

export type PullCounterIncrements = {
  tag: boolean;
  image: boolean;
  repository: boolean;
};

export function computePullCounterIncrements(
  tagReference: string | null,
  isDigestReference: boolean,
  dedupe: PullDedupeInput,
): PullCounterIncrements {
  return {
    tag: tagReference !== null || isDigestReference,
    image: !dedupe.hasRecentImageDigestPull,
    repository: !dedupe.hasRecentRepositoryDigestPull,
  };
}

export function getPullDedupeSinceDate(now = new Date()): Date {
  return new Date(now.getTime() - PULL_DEDUPE_WINDOW_MS);
}
