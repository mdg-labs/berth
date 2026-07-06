// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { canDeleteRegistryContent } from "@/components/delete/permissions";
import {
  BULK_DELETE_CONFIRM_PHRASE,
  BULK_DELETE_CONFIRM_THRESHOLD,
  repositoryDeleteConfirmPhrase,
} from "@/components/delete/constants";

describe("delete permissions", () => {
  it("allows system admin regardless of project role", () => {
    expect(canDeleteRegistryContent("admin", null)).toBe(true);
    expect(canDeleteRegistryContent("admin", "developer")).toBe(true);
  });

  it("allows maintainer and project admin", () => {
    expect(canDeleteRegistryContent("user", "maintainer")).toBe(true);
    expect(canDeleteRegistryContent("user", "admin")).toBe(true);
  });

  it("denies developer and guest", () => {
    expect(canDeleteRegistryContent("user", "developer")).toBe(false);
    expect(canDeleteRegistryContent("user", "guest")).toBe(false);
    expect(canDeleteRegistryContent("user", null)).toBe(false);
  });
});

describe("delete confirmation constants", () => {
  it("requires typed phrase above threshold", () => {
    expect(BULK_DELETE_CONFIRM_THRESHOLD).toBe(5);
    expect(BULK_DELETE_CONFIRM_PHRASE).toBe("delete tags");
  });

  it("builds repository delete phrase from repo name", () => {
    expect(repositoryDeleteConfirmPhrase("hello/world")).toBe(
      "delete hello/world",
    );
  });
});
