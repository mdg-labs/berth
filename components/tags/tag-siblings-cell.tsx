// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { imagePathSegments } from "@/lib/catalog/format";

type TagSiblingsCellProps = {
  repositoryName: string;
  imageName: string;
  siblings: string[];
};

export function TagSiblingsCell({
  repositoryName,
  imageName,
  siblings,
}: TagSiblingsCellProps) {
  if (siblings.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="flex max-w-md flex-wrap gap-1">
      {siblings.map((sibling) => (
        <Badge
          key={sibling}
          variant="secondary"
          size="sm"
          render={
            <Link
              href={`/r/${encodeURIComponent(repositoryName)}/i/${imagePathSegments(imageName)}/t/${encodeURIComponent(sibling)}`}
            />
          }
        >
          {sibling}
        </Badge>
      ))}
    </div>
  );
}
