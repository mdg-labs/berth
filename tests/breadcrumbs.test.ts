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

  it("maps repository tag list routes without the /r segment", () => {
    expect(buildBreadcrumbItems("/p/demo-app/r/my-repo")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App", href: "/p/demo-app" },
      { label: "my-repo" },
    ]);
  });

  it("maps repository tag detail routes", () => {
    expect(buildBreadcrumbItems("/p/demo-app/r/my-repo/t/latest")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App", href: "/p/demo-app" },
      { label: "my-repo", href: "/p/demo-app/r/my-repo" },
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

  it("maps repository settings routes", () => {
    expect(buildBreadcrumbItems("/p/demo-app/r/my-repo/settings")).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Demo App", href: "/p/demo-app" },
      { label: "my-repo", href: "/p/demo-app/r/my-repo" },
      { label: "Settings" },
    ]);
  });
});
