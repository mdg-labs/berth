// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";

const messages: Record<string, string> = {
  bad_request: "The request could not be processed.",
  generic: "Something went wrong. Try again.",
};

const t = (key: string) => messages[key] ?? key;

describe("formatApiError", () => {
  it("maps known API error codes to translation keys", () => {
    const error = new ApiError("bad_request", "raw server message", 400);

    expect(formatApiError(t, error, "generic")).toBe(
      "The request could not be processed.",
    );
  });

  it("never uses the raw API error message for display", () => {
    const error = new ApiError("unknown_code", "raw server message", 500);

    expect(formatApiError(t, error, "generic")).toBe(
      "Something went wrong. Try again.",
    );
  });

  it("falls back when error is not an ApiError", () => {
    expect(formatApiError(t, new Error("network"), "generic")).toBe(
      "Something went wrong. Try again.",
    );
  });
});
