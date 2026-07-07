// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { imagePathSegments } from "@/lib/catalog/format";

export type NavigationTranslator = (
  key:
    | "repositories"
    | "settings"
    | "images"
    | "admin"
    | "users"
    | "garbageCollection"
    | "profile"
    | "reactivateAccount",
) => string;

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

function parseRepositoryImageRoute(rest: string[]): {
  kind: "list";
  imageName: string;
} | {
  kind: "detail";
  imageName: string;
  tag: string;
} | null {
  if (rest.length === 0) {
    return null;
  }

  const tagMarkerIndex = rest.lastIndexOf("t");

  if (tagMarkerIndex > 0 && tagMarkerIndex === rest.length - 2) {
    return {
      kind: "detail",
      imageName: rest.slice(0, tagMarkerIndex).join("/"),
      tag: rest[tagMarkerIndex + 1]!,
    };
  }

  return {
    kind: "list",
    imageName: rest.join("/"),
  };
}

function buildRepositoryBreadcrumbs(
  segments: string[],
  t: NavigationTranslator,
): BreadcrumbItemData[] {
  if (segments.length < 2) {
    return [{ label: t("repositories"), href: "/repositories" }];
  }

  const repository = decodeURIComponent(segments[1]!);
  const repositoryPath = `/r/${encodeURIComponent(repository)}`;
  const items: BreadcrumbItemData[] = [
    { label: t("repositories"), href: "/repositories" },
  ];

  const tail = segments.slice(2);

  if (tail.length === 0) {
    items.push({ label: repository });
    return items;
  }

  if (tail[0] === "settings" && tail.length === 1) {
    items.push({ label: repository, href: repositoryPath });
    items.push({ label: t("settings") });
    return items;
  }

  if (tail[0] === "i" || tail[0] === "r") {
    const imageSegments = tail.slice(1).map(decodeURIComponent);
    items.push({ label: repository, href: repositoryPath });

    if (imageSegments.length === 0) {
      items.push({ label: t("images") });
      return items;
    }

    if (imageSegments.at(-1) === "settings" && imageSegments.length >= 2) {
      const imageName = imageSegments.slice(0, -1).join("/");
      const imageHref = `/r/${encodeURIComponent(repository)}/i/${imagePathSegments(imageName)}`;
      items.push({ label: imageName, href: imageHref });
      items.push({ label: t("settings") });
      return items;
    }

    const parsed = parseRepositoryImageRoute(imageSegments);
    if (!parsed) {
      items.push({ label: t("images") });
      return items;
    }

    const imageHref = `/r/${encodeURIComponent(repository)}/i/${imagePathSegments(parsed.imageName)}`;

    if (parsed.kind === "detail") {
      items.push({ label: parsed.imageName, href: imageHref });
      items.push({ label: parsed.tag });
      return items;
    }

    items.push({ label: parsed.imageName });
    return items;
  }

  items.push({ label: repository, href: repositoryPath });
  for (const [index, segment] of tail.entries()) {
    const isLast = index === tail.length - 1;
    const href = isLast
      ? undefined
      : `${repositoryPath}/${tail.slice(0, index + 1).join("/")}`;
    items.push({
      label: titleCase(decodeURIComponent(segment)),
      href,
    });
  }

  return items;
}

export function buildBreadcrumbItems(
  pathname: string,
  t: NavigationTranslator,
): BreadcrumbItemData[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  if (segments[0] === "r") {
    return buildRepositoryBreadcrumbs(segments, t);
  }

  if (segments[0] === "admin") {
    const items: BreadcrumbItemData[] = [
      { label: t("admin"), href: "/admin" },
    ];

    if (segments[1] === "users" && segments[2]) {
      items.push({ label: t("users"), href: "/admin" });
      items.push({ label: decodeURIComponent(segments[2]) });
      return items;
    }

    if (segments[1] === "gc") {
      items.push({ label: t("garbageCollection") });
      return items;
    }

    return items;
  }

  if (segments[0] === "profile") {
    return [{ label: t("profile") }];
  }

  if (segments[0] === "reactivate-account") {
    return [{ label: t("reactivateAccount") }];
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
