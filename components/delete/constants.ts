// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export const BULK_DELETE_CONFIRM_THRESHOLD = 5;

export const BULK_DELETE_CONFIRM_PHRASE = "delete tags";

export function repositoryDeleteConfirmPhrase(repoName: string): string {
  return `delete ${repoName}`;
}

export { GC_INFO_MESSAGE } from "@/lib/registry/delete/constants";
