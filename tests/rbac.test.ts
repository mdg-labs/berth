// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  canPerformProjectAction,
  filterScopeActionsForPublicPull,
  filterScopeActionsForRole,
  isPublicPullOnlyAccess,
  isSystemAdmin,
} from "@/lib/rbac/check";
import {
  publicGuestAllowsScopeAction,
  RBAC_MATRIX,
  roleAllowsAction,
  roleAllowsScopeAction,
} from "@/lib/rbac/matrix";
import type { ProjectAction, ProjectRole } from "@/lib/rbac/types";

const ALL_SCOPE_ACTIONS = ["pull", "push", "delete"] as const;

describe("RBAC matrix", () => {
  it("matches spec §5.3 role capabilities", () => {
    for (const row of RBAC_MATRIX) {
      expect(roleAllowsScopeAction(row.role, "pull")).toBe(row.pull);
      expect(roleAllowsScopeAction(row.role, "push")).toBe(row.push);
      expect(roleAllowsScopeAction(row.role, "delete")).toBe(row.delete);
      expect(roleAllowsAction(row.role, "manage_members")).toBe(
        row.manageMembers,
      );
      expect(roleAllowsAction(row.role, "delete_project")).toBe(
        row.deleteProject,
      );
    }
  });

  it("returns false for null role on all actions", () => {
    const actions: ProjectAction[] = [
      "pull",
      "push",
      "delete",
      "manage_members",
      "delete_project",
      "view_project",
      "update_project",
    ];

    for (const action of actions) {
      expect(roleAllowsAction(null, action)).toBe(false);
    }
  });

  it("public guest allows pull only", () => {
    expect(publicGuestAllowsScopeAction("pull")).toBe(true);
    expect(publicGuestAllowsScopeAction("push")).toBe(false);
    expect(publicGuestAllowsScopeAction("delete")).toBe(false);
  });
});

describe("RBAC role × action × public/private", () => {
  const roles: ProjectRole[] = [
    "guest",
    "developer",
    "maintainer",
    "admin",
  ];

  for (const role of roles) {
    for (const scopeAction of ALL_SCOPE_ACTIONS) {
      it(`${role} scope ${scopeAction} matches matrix`, () => {
        const allowed = roleAllowsScopeAction(role, scopeAction);
        const row = RBAC_MATRIX.find((entry) => entry.role === role);
        const expected =
          scopeAction === "pull"
            ? row?.pull
            : scopeAction === "push"
              ? row?.push
              : row?.delete;
        expect(allowed).toBe(expected);
      });
    }
  }

  it("system admin bypasses project action checks", () => {
    expect(isSystemAdmin("admin")).toBe(true);
    expect(
      canPerformProjectAction("admin", null, "delete_project"),
    ).toBe(true);
    expect(
      canPerformProjectAction("admin", null, "manage_members"),
    ).toBe(true);
  });

  it("non-admin requires project role for manage_members", () => {
    expect(
      canPerformProjectAction("user", "developer", "manage_members"),
    ).toBe(false);
    expect(
      canPerformProjectAction("user", "admin", "manage_members"),
    ).toBe(true);
  });
});

describe("scope action filtering", () => {
  it("developer gets pull and push only", () => {
    expect(
      filterScopeActionsForRole(["pull", "push", "delete"], "developer"),
    ).toEqual(["pull", "push"]);
  });

  it("maintainer gets delete", () => {
    expect(
      filterScopeActionsForRole(["pull", "push", "delete"], "maintainer"),
    ).toEqual(["pull", "push", "delete"]);
  });

  it("guest on public project gets pull only", () => {
    expect(filterScopeActionsForPublicPull(["pull", "push"])).toEqual(["pull"]);
  });

  it("detects public pull-only access", () => {
    expect(
      isPublicPullOnlyAccess([
        { type: "repository", actions: ["pull"] },
      ]),
    ).toBe(true);

    expect(
      isPublicPullOnlyAccess([
        { type: "repository", actions: ["pull", "push"] },
      ]),
    ).toBe(false);

    expect(
      isPublicPullOnlyAccess([{ type: "registry", actions: ["*"] }]),
    ).toBe(false);
  });
});

describe("project name validation", () => {
  it("accepts DNS-like slugs", async () => {
    const { isValidProjectName } = await import(
      "@/lib/projects/validation"
    );
    expect(isValidProjectName("my-project")).toBe(true);
    expect(isValidProjectName("ab")).toBe(true);
    expect(isValidProjectName("1bad")).toBe(false);
    expect(isValidProjectName("a")).toBe(false);
  });
});
