// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type AnonymousPullOverride = "inherit" | "allow" | "deny";

export type ImageSettings = {
  anonymousPull: AnonymousPullOverride;
  effectiveAnonymousPull: boolean;
  repositoryAnonymousPullDefault: boolean;
};
