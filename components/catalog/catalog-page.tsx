// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PackageIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { useAuthUser } from "@/components/providers/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import { useRepositoryByName } from "@/lib/hooks/use-repository";
import type { CatalogResponse } from "@/lib/registry/client/types";
import { imagePathSegments } from "@/lib/catalog/format";

type CatalogPageProps = {
  repositoryName: string;
};

function CatalogSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

function visibilityBadgeLabel(image: CatalogResponse["images"][number]) {
  if (image.anonymousPull === "allow") {
    return "Public override";
  }

  if (image.anonymousPull === "deny") {
    return "Private override";
  }

  return image.effectiveAnonymousPull ? "Public" : "Private";
}

export function CatalogPage({ repositoryName }: CatalogPageProps) {
  const { data: authData } = useAuthUser();
  const repositoryQuery = useRepositoryByName(repositoryName);
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault(""),
  );
  const debouncedSearch = useDebouncedValue(search, 300);

  const canManage =
    authData?.user.systemRole === "admin" ||
    repositoryQuery.data?.role === "admin";

  const catalogQuery = useQuery({
    queryKey: ["catalog", repositoryQuery.data?.id, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      const query = params.toString();
      return apiFetch<CatalogResponse>(
        `/api/repositories/${repositoryQuery.data!.id}/catalog${query ? `?${query}` : ""}`,
      );
    },
    enabled: Boolean(repositoryQuery.data?.id),
    refetchInterval: 30_000,
  });

  const isLoading = repositoryQuery.isLoading || catalogQuery.isLoading;
  const error = repositoryQuery.error ?? catalogQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{repositoryName}</h1>
          <p className="text-sm text-muted-foreground">
            Browse images in this repository
            {catalogQuery.data?.repositoryPullCount !== undefined
              ? ` · ${catalogQuery.data.repositoryPullCount} pull${catalogQuery.data.repositoryPullCount === 1 ? "" : "s"}`
              : ""}
            .
          </p>
        </div>
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search images…"
            value={search}
            onChange={(event) => void setSearch(event.target.value)}
          />
        </InputGroup>
      </div>

      {isLoading ? <CatalogSkeleton /> : null}

      {error ? (
        <ErrorAlert
          message={
            error instanceof Error ? error.message : "Failed to load catalog"
          }
          onRetry={() => {
            void repositoryQuery.refetch();
            void catalogQuery.refetch();
          }}
        />
      ) : null}

      {!isLoading && !error && catalogQuery.data?.images.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>No images yet</EmptyTitle>
            <EmptyDescription>
              Push an image to this repository to see it here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!isLoading && !error && (catalogQuery.data?.images.length ?? 0) > 0 ? (
        <ul className="divide-y rounded-lg border">
          {catalogQuery.data!.images.map((image) => (
            <li key={image.name} className="flex items-center gap-2 px-4 py-4">
              <Link
                href={`/r/${repositoryName}/i/${imagePathSegments(image.name)}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 transition-colors hover:text-primary"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{image.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage ? (
                    <Badge
                      variant={
                        image.effectiveAnonymousPull ? "secondary" : "outline"
                      }
                    >
                      {visibilityBadgeLabel(image)}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary">
                    {image.tagCount} tag{image.tagCount === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline">
                    {image.pullCount ?? 0} pull{(image.pullCount ?? 0) === 1 ? "" : "s"}
                  </Badge>
                </div>
              </Link>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Settings for ${image.name}`}
                  render={
                    <Link
                      href={`/r/${encodeURIComponent(repositoryName)}/i/${imagePathSegments(image.name)}/settings`}
                    />
                  }
                >
                  <SettingsIcon className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
