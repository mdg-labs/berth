// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { ImageSettingsPage } from "@/components/settings/image-settings-page";
import { TagDetailPage } from "@/components/tags/tag-detail-page";
import { TagsPage } from "@/components/tags/tags-page";
import { getTranslations } from "next-intl/server";

type PageProps = {
  params: Promise<{ repository: string; rest: string[] }>;
};

function parseImageRoute(rest: string[]): {
  kind: "settings";
  imageName: string;
} | {
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

  const segments = rest.map(decodeURIComponent);

  if (segments.at(-1) === "settings") {
    if (segments.length < 2) {
      return null;
    }

    return {
      kind: "settings",
      imageName: segments.slice(0, -1).join("/"),
    };
  }

  const tagMarkerIndex = segments.lastIndexOf("t");

  if (tagMarkerIndex > 0 && tagMarkerIndex === segments.length - 2) {
    return {
      kind: "detail",
      imageName: segments.slice(0, tagMarkerIndex).join("/"),
      tag: segments[tagMarkerIndex + 1]!,
    };
  }

  return {
    kind: "list",
    imageName: segments.join("/"),
  };
}

export default async function ImageRoutePage({ params }: PageProps) {
  const { repository, rest } = await params;
  const repositoryName = decodeURIComponent(repository);
  const parsed = parseImageRoute(rest);
  const t = await getTranslations("tags");

  if (!parsed) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("route.selectImage")}
      </div>
    );
  }

  if (parsed.kind === "settings") {
    return (
      <ImageSettingsPage
        repositoryName={repositoryName}
        imageName={parsed.imageName}
      />
    );
  }

  if (parsed.kind === "detail") {
    return (
      <TagDetailPage
        repositoryName={repositoryName}
        imageName={parsed.imageName}
        tag={parsed.tag}
      />
    );
  }

  return <TagsPage repositoryName={repositoryName} imageName={parsed.imageName} />;
}
