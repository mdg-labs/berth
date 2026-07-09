// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getSystemSettings } from "@/lib/admin/settings";

export type PatPolicy = {
  patMaxValidityDays: number | null;
  patAllowNeverExpire: boolean;
};

export async function getPatPolicy(): Promise<PatPolicy> {
  const settings = await getSystemSettings();
  return {
    patMaxValidityDays: settings.patMaxValidityDays,
    patAllowNeverExpire: settings.patAllowNeverExpire,
  };
}

export const PAT_LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export const PAT_PREFIX = "bt_";
