// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type AnonymousPullOverride = "inherit" | "allow" | "deny";

export type ProjectSettings = {
  anonymousPullDefault: boolean;
};

export type RepositorySettings = {
  anonymousPull: AnonymousPullOverride;
  effectiveAnonymousPull: boolean;
  projectAnonymousPullDefault: boolean;
};
