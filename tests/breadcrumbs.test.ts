// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { buildBreadcrumbItems } from "@/lib/navigation/breadcrumbs";

describe("buildBreadcrumbItems", () => {
  it("maps the repositories list route", () => {
    expect(buildBreadcrumbItems("/repositories")).toEqual([
      { label: "Repositories" },
    ]);
  });

  it("maps project catalog routes through /repositories", () => {
    expect(buildBreadcrumbItems("/r/demo-app")).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app" },
    ]);
  });

  it("maps project settings routes", () => {
    expect(buildBreadcrumbItems("/r/demo-app/settings")).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "Settings" },
    ]);
  });

  it("maps image tag list routes without the /i segment", () => {
    expect(buildBreadcrumbItems("/r/demo-app/i/my-image")).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "my-image" },
    ]);
  });

  it("maps image tag detail routes", () => {
    expect(buildBreadcrumbItems("/r/demo-app/i/my-image/t/latest")).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "my-image", href: "/r/demo-app/i/my-image" },
      { label: "latest" },
    ]);
  });

  it("maps bare /r to repositories list breadcrumb", () => {
    expect(buildBreadcrumbItems("/r")).toEqual([
      { label: "Repositories", href: "/repositories" },
    ]);
  });

  it("maps the profile route", () => {
    expect(buildBreadcrumbItems("/profile")).toEqual([{ label: "Profile" }]);
  });

  it("maps the reactivate account route", () => {
    expect(buildBreadcrumbItems("/reactivate-account")).toEqual([
      { label: "Reactivate account" },
    ]);
  });

  it("maps admin user detail routes", () => {
    expect(buildBreadcrumbItems("/admin/users/user-123")).toEqual([
      { label: "Admin", href: "/admin" },
      { label: "Users", href: "/admin" },
      { label: "user-123" },
    ]);
  });

  it("maps image settings routes", () => {
    expect(buildBreadcrumbItems("/r/demo-app/i/my-image/settings")).toEqual([
      { label: "Repositories", href: "/repositories" },
      { label: "demo-app", href: "/r/demo-app" },
      { label: "my-image", href: "/r/demo-app/i/my-image" },
      { label: "Settings" },
    ]);
  });
});
