// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { TagDetailPage } from "@/components/tags/tag-detail-page";
import { TagsPage } from "@/components/tags/tags-page";

type PageProps = {
  params: Promise<{ project: string; rest?: string[] }>;
};

function parseRepositoryRoute(rest: string[] | undefined): {
  kind: "list";
  repoName: string;
} | {
  kind: "detail";
  repoName: string;
  tag: string;
} | null {
  if (!rest || rest.length === 0) {
    return null;
  }

  const segments = rest.map(decodeURIComponent);
  const tagMarkerIndex = segments.lastIndexOf("t");

  if (
    tagMarkerIndex > 0 &&
    tagMarkerIndex === segments.length - 2
  ) {
    return {
      kind: "detail",
      repoName: segments.slice(0, tagMarkerIndex).join("/"),
      tag: segments[tagMarkerIndex + 1]!,
    };
  }

  return {
    kind: "list",
    repoName: segments.join("/"),
  };
}

export default async function RepositoryRoutePage({ params }: PageProps) {
  const { project, rest } = await params;
  const projectName = decodeURIComponent(project);
  const parsed = parseRepositoryRoute(rest);

  if (!parsed) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Select a repository from the project catalog.
      </div>
    );
  }

  if (parsed.kind === "detail") {
    return (
      <TagDetailPage
        projectName={projectName}
        repoName={parsed.repoName}
        tag={parsed.tag}
      />
    );
  }

  return <TagsPage projectName={projectName} repoName={parsed.repoName} />;
}
