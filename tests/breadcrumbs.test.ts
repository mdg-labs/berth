// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { describe, expect, it } from "vitest";

import { buildBreadcrumbItems } from "@/lib/navigation/breadcrumbs";

describe("buildBreadcrumbItems", () => {
  it("maps the projects list route", () => {
    expect(buildBreadcrumbItems("/projects")).toEqual([
      { label: "Projects" },
    ]);
  });

  it("maps project catalog routes through /projects", () => {
    expect(buildBreadcrumbItems("/p/demo-app")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App" },
    ]);
  });

  it("maps project settings routes", () => {
    expect(buildBreadcrumbItems("/p/demo-app/settings")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App", href: "/p/demo-app" },
      { label: "Settings" },
    ]);
  });

  it("maps image tag list routes without the /i segment", () => {
    expect(buildBreadcrumbItems("/p/demo-app/i/my-image")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App", href: "/p/demo-app" },
      { label: "my-image" },
    ]);
  });

  it("maps image tag detail routes", () => {
    expect(buildBreadcrumbItems("/p/demo-app/i/my-image/t/latest")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App", href: "/p/demo-app" },
      { label: "my-image", href: "/p/demo-app/i/my-image" },
      { label: "latest" },
    ]);
  });

  it("does not expose a bare /p breadcrumb", () => {
    expect(buildBreadcrumbItems("/p")).toEqual([
      { label: "Projects", href: "/projects" },
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
    expect(buildBreadcrumbItems("/p/demo-app/i/my-image/settings")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App", href: "/p/demo-app" },
      { label: "my-image", href: "/p/demo-app/i/my-image" },
      { label: "Settings" },
    ]);
  });
});
