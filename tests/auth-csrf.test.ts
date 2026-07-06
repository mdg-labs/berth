// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  hasValidCsrfHeader,
  isCsrfExemptPath,
  requiresCsrfHeader,
} from "@/lib/csrf/check";
import { CSRF_HEADER, CSRF_VALUE } from "@/lib/csrf/constants";

describe("csrf", () => {
  it("requires CSRF on mutating /api routes", () => {
    expect(requiresCsrfHeader("POST", "/api/auth/login")).toBe(true);
    expect(requiresCsrfHeader("PATCH", "/api/projects/1")).toBe(true);
    expect(requiresCsrfHeader("DELETE", "/api/projects/1")).toBe(true);
  });

  it("exempts token endpoint and /v2 proxy", () => {
    expect(isCsrfExemptPath("/api/auth/token")).toBe(true);
    expect(isCsrfExemptPath("/v2/")).toBe(true);
    expect(requiresCsrfHeader("POST", "/api/auth/token")).toBe(false);
  });

  it("does not require CSRF on GET", () => {
    expect(requiresCsrfHeader("GET", "/api/auth/me")).toBe(false);
  });

  it("validates header value", () => {
    const headers = new Headers({ [CSRF_HEADER]: CSRF_VALUE });
    expect(hasValidCsrfHeader(headers)).toBe(true);

    const invalid = new Headers({ [CSRF_HEADER]: "wrong" });
    expect(hasValidCsrfHeader(invalid)).toBe(false);
  });
});
