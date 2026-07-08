// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import {
  buildBreadcrumbItems,
  type NavigationTranslator,
} from "@/lib/navigation/breadcrumbs";

const t: NavigationTranslator = (key) => {
  const labels: Record<Parameters<NavigationTranslator>[0], string> = {
    repositories: "Repositories",
    settings: "Repository settings",
    imageSettings: "Settings",
    images: "Images",
    admin: "Admin",
    users: "Users",
    garbageCollection: "Garbage collection",
    auditLog: "Audit log",
    profile: "Profile",
    reactivateAccount: "Reactivate account",
  };

  return labels[key];
};

describe("buildBreadcrumbItems", () => {
  it("maps the repositories list route", () => {
    expect(buildBreadcrumbItems("/repositories", t)).toEqual([
      { label: "Repositories" },
    ]);
  });

  it("maps project catalog routes through /repositories", () => {
    expect(buildBreadcrumbItems("/r/demo-app", t)).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app" },
    ]);
  });

  it("maps project settings routes", () => {
    expect(buildBreadcrumbItems("/r/demo-app/settings", t)).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "Repository settings" },
    ]);
  });

  it("maps repository settings for my-repo", () => {
    expect(buildBreadcrumbItems("/r/my-repo/settings", t)).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "my-repo", href: "/r/my-repo" },
      { label: "Repository settings" },
    ]);
  });

  it("maps image tag list routes without the /i segment", () => {
    expect(buildBreadcrumbItems("/r/demo-app/i/my-image", t)).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "my-image" },
    ]);
  });

  it("maps image tag detail routes", () => {
    expect(buildBreadcrumbItems("/r/demo-app/i/my-image/t/latest", t)).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "my-image", href: "/r/demo-app/i/my-image" },
      { label: "latest" },
    ]);
  });

  it("maps bare /r to repositories list breadcrumb", () => {
    expect(buildBreadcrumbItems("/r", t)).toEqual([
      { label: "Repositories", href: "/repositories" },
    ]);
  });

  it("maps the profile route", () => {
    expect(buildBreadcrumbItems("/profile", t)).toEqual([{ label: "Profile" }]);
  });

  it("maps the reactivate account route", () => {
    expect(buildBreadcrumbItems("/reactivate-account", t)).toEqual([
      { label: "Reactivate account" },
    ]);
  });

  it("maps admin user detail routes", () => {
    expect(buildBreadcrumbItems("/admin/users/user-123", t)).toEqual([
      { label: "Admin", href: "/admin" },
      { label: "Users", href: "/admin" },
      { label: "user-123" },
    ]);
  });

  it("maps admin audit route", () => {
    expect(buildBreadcrumbItems("/admin/audit", t)).toEqual([
      { label: "Admin", href: "/admin" },
      { label: "Audit log" },
    ]);
  });

  it("maps image settings routes", () => {
    expect(buildBreadcrumbItems("/r/demo-app/i/my-image/settings", t)).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "my-image", href: "/r/demo-app/i/my-image" },
      { label: "Settings" },
    ]);
  });
});
