// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import deleteMessages from "../../messages/en/delete.json";

export const BULK_DELETE_CONFIRM_THRESHOLD = 5;

/** @deprecated Prefer `delete.bulkDelete.confirmPhrase` via next-intl. */
export const BULK_DELETE_CONFIRM_PHRASE = deleteMessages.bulkDelete.confirmPhrase;

/** @deprecated Prefer `delete.imageDelete.confirmPhrase` via next-intl. */
export function imageDeleteConfirmPhrase(imageName: string): string {
  return deleteMessages.imageDelete.confirmPhrase.replace("{name}", imageName);
}
