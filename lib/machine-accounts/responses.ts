// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import { apiError } from "@/lib/api/errors";
import type { MachineAccountExpiryError } from "@/lib/machine-accounts/store";

export function machineAccountExpiryResponse(
  error: MachineAccountExpiryError | "token_expired",
) {
  switch (error) {
    case "token_expired":
      return apiError(
        "bad_request",
        "Machine account is expired; set a new expiry to rotate",
        400,
      );
    case "never_expire_not_allowed":
      return apiError(
        "bad_request",
        "Never-expiring machine accounts are not allowed on this instance",
        400,
      );
    case "expiry_in_past":
      return apiError("bad_request", "Expiry must be in the future", 400);
    case "expiry_exceeds_max":
      return apiError(
        "bad_request",
        "Expiry exceeds the maximum allowed by this instance",
        400,
      );
  }
}
