// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { repoPathSegments } from "@/lib/catalog/format";

export type BreadcrumbItemData = {
  label: string;
  href?: string;
};

function titleCase(segment: string): string {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseProjectRepositoryRoute(rest: string[]): {
  kind: "list";
  repoName: string;
} | {
  kind: "detail";
  repoName: string;
  tag: string;
} | null {
  if (rest.length === 0) {
    return null;
  }

  const tagMarkerIndex = rest.lastIndexOf("t");

  if (tagMarkerIndex > 0 && tagMarkerIndex === rest.length - 2) {
    return {
      kind: "detail",
      repoName: rest.slice(0, tagMarkerIndex).join("/"),
      tag: rest[tagMarkerIndex + 1]!,
    };
  }

  return {
    kind: "list",
    repoName: rest.join("/"),
  };
}

function buildProjectBreadcrumbs(segments: string[]): BreadcrumbItemData[] {
  if (segments.length < 2) {
    return [{ label: "Projects", href: "/projects" }];
  }

  const project = decodeURIComponent(segments[1]!);
  const projectPath = `/p/${encodeURIComponent(project)}`;
  const items: BreadcrumbItemData[] = [
    { label: "Projects", href: "/projects" },
  ];

  const tail = segments.slice(2);

  if (tail.length === 0) {
    items.push({ label: titleCase(project) });
    return items;
  }

  if (tail[0] === "settings" && tail.length === 1) {
    items.push({ label: titleCase(project), href: projectPath });
    items.push({ label: "Settings" });
    return items;
  }

  if (tail[0] === "r") {
    const repoSegments = tail.slice(1).map(decodeURIComponent);
    items.push({ label: titleCase(project), href: projectPath });

    if (repoSegments.length === 0) {
      items.push({ label: "Repositories" });
      return items;
    }

    if (repoSegments.at(-1) === "settings" && repoSegments.length >= 2) {
      const repoName = repoSegments.slice(0, -1).join("/");
      const repoHref = `/p/${encodeURIComponent(project)}/r/${repoPathSegments(repoName)}`;
      items.push({ label: repoName, href: repoHref });
      items.push({ label: "Settings" });
      return items;
    }

    const parsed = parseProjectRepositoryRoute(repoSegments);
    if (!parsed) {
      items.push({ label: "Repositories" });
      return items;
    }

    const repoHref = `/p/${encodeURIComponent(project)}/r/${repoPathSegments(parsed.repoName)}`;

    if (parsed.kind === "detail") {
      items.push({ label: parsed.repoName, href: repoHref });
      items.push({ label: parsed.tag });
      return items;
    }

    items.push({ label: parsed.repoName });
    return items;
  }

  items.push({ label: titleCase(project), href: projectPath });
  for (const [index, segment] of tail.entries()) {
    const isLast = index === tail.length - 1;
    const href = isLast
      ? undefined
      : `${projectPath}/${tail.slice(0, index + 1).join("/")}`;
    items.push({
      label: titleCase(decodeURIComponent(segment)),
      href,
    });
  }

  return items;
}

export function buildBreadcrumbItems(pathname: string): BreadcrumbItemData[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  if (segments[0] === "p") {
    return buildProjectBreadcrumbs(segments);
  }

  if (segments[0] === "admin") {
    const items: BreadcrumbItemData[] = [{ label: "Admin", href: "/admin" }];

    if (segments[1] === "users" && segments[2]) {
      items.push({ label: "Users", href: "/admin" });
      items.push({ label: decodeURIComponent(segments[2]) });
      return items;
    }

    if (segments[1] === "gc") {
      items.push({ label: "Garbage collection" });
      return items;
    }

    return items;
  }

  if (segments[0] === "profile") {
    return [{ label: "Profile" }];
  }

  if (segments[0] === "reactivate-account") {
    return [{ label: "Reactivate account" }];
  }

  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;

    return {
      label: titleCase(decodeURIComponent(segment)),
      href: isLast
        ? undefined
        : `/${segments.slice(0, index + 1).join("/")}`,
    };
  });
}
