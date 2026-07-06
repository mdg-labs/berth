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
import { useProjectByName } from "@/lib/hooks/use-project";
import type { CatalogResponse } from "@/lib/registry/client/types";
import { imagePathSegments } from "@/lib/catalog/format";

type CatalogPageProps = {
  projectName: string;
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

function visibilityBadgeLabel(repo: CatalogResponse["repositories"][number]) {
  if (repo.anonymousPull === "allow") {
    return "Public override";
  }

  if (repo.anonymousPull === "deny") {
    return "Private override";
  }

  return repo.effectiveAnonymousPull ? "Public" : "Private";
}

export function CatalogPage({ projectName }: CatalogPageProps) {
  const { data: authData } = useAuthUser();
  const projectQuery = useProjectByName(projectName);
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault(""),
  );
  const debouncedSearch = useDebouncedValue(search, 300);

  const canManage =
    authData?.user.systemRole === "admin" ||
    projectQuery.data?.role === "admin";

  const catalogQuery = useQuery({
    queryKey: ["catalog", projectQuery.data?.id, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      const query = params.toString();
      return apiFetch<CatalogResponse>(
        `/api/projects/${projectQuery.data!.id}/catalog${query ? `?${query}` : ""}`,
      );
    },
    enabled: Boolean(projectQuery.data?.id),
    refetchInterval: 30_000,
  });

  const isLoading = projectQuery.isLoading || catalogQuery.isLoading;
  const error = projectQuery.error ?? catalogQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{projectName}</h1>
          <p className="text-sm text-muted-foreground">
            Browse images in this project.
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
            void projectQuery.refetch();
            void catalogQuery.refetch();
          }}
        />
      ) : null}

      {!isLoading && !error && catalogQuery.data?.repositories.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>No images yet</EmptyTitle>
            <EmptyDescription>
              Push an image to this project to see it here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!isLoading && !error && (catalogQuery.data?.repositories.length ?? 0) > 0 ? (
        <ul className="divide-y rounded-lg border">
          {catalogQuery.data!.repositories.map((repo) => (
            <li key={repo.name} className="flex items-center gap-2 px-4 py-4">
              <Link
                href={`/p/${projectName}/i/${imagePathSegments(repo.name)}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-4 transition-colors hover:text-primary"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{repo.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage ? (
                    <Badge
                      variant={
                        repo.effectiveAnonymousPull ? "secondary" : "outline"
                      }
                    >
                      {visibilityBadgeLabel(repo)}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary">
                    {repo.tagCount} tag{repo.tagCount === 1 ? "" : "s"}
                  </Badge>
                </div>
              </Link>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Settings for ${repo.name}`}
                  render={
                    <Link
                      href={`/p/${encodeURIComponent(projectName)}/i/${imagePathSegments(repo.name)}/settings`}
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
