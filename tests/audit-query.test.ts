// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { parseAuditLogQuery } from "@/lib/audit/query";

describe("parseAuditLogQuery", () => {
  it("applies defaults", () => {
    expect(parseAuditLogQuery(new URLSearchParams())).toEqual({
      page: 1,
      pageSize: 25,
      sort: "created_at_desc",
      search: undefined,
      action: undefined,
      actor: undefined,
      resource: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("parses pagination and filters", () => {
    const params = new URLSearchParams({
      page: "2",
      pageSize: "50",
      sort: "action_asc",
      search: "member",
      action: "member.add",
      actor: "admin",
      resource: "repository:demo",
      from: "2026-01-01",
      to: "2026-12-31",
    });

    expect(parseAuditLogQuery(params)).toEqual({
      page: 2,
      pageSize: 50,
      sort: "action_asc",
      search: "member",
      action: "member.add",
      actor: "admin",
      resource: "repository:demo",
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("clamps page size and invalid sort", () => {
    const params = new URLSearchParams({
      pageSize: "500",
      sort: "invalid",
    });

    expect(parseAuditLogQuery(params)).toMatchObject({
      pageSize: 100,
      sort: "created_at_desc",
    });
  });

  it("treats blank filters as undefined", () => {
    const params = new URLSearchParams({
      search: "   ",
      action: "",
    });

    expect(parseAuditLogQuery(params)).toMatchObject({
      search: undefined,
      action: undefined,
    });
  });
});
