// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  DownloadIcon,
  LockIcon,
  LockOpenIcon,
  PackageIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { useAuthUser } from "@/components/providers/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api/client";
import { useRepositoryByName } from "@/lib/hooks/use-repository";
import type { CatalogResponse } from "@/lib/registry/client/types";
import { imagePathSegments } from "@/lib/catalog/format";

type CatalogPageProps = {
  repositoryName: string;
};

function CatalogSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

function visibilityLabel(
  image: CatalogResponse["images"][number],
): "Public" | "Private" {
  return image.effectiveAnonymousPull ? "Public" : "Private";
}

function ImageVisibilityLock({
  image,
}: {
  image: CatalogResponse["images"][number];
}) {
  const label = visibilityLabel(image);
  const isPublic = image.effectiveAnonymousPull;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={label}
          />
        }
      >
        {isPublic ? (
          <LockOpenIcon className="size-4" aria-hidden />
        ) : (
          <LockIcon className="size-4" aria-hidden />
        )}
      </TooltipTrigger>
      <TooltipPopup
        side="top"
        className="border-border/80 px-2.5 py-1 font-medium shadow-md/10"
      >
        {label}
      </TooltipPopup>
    </Tooltip>
  );
}

function ImagePullCount({ pullCount }: { pullCount: number }) {
  const label = `${pullCount} pull${pullCount === 1 ? "" : "s"}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-1.5 text-sm text-muted-foreground"
            aria-label={label}
          />
        }
      >
        <DownloadIcon className="size-4 shrink-0" aria-hidden />
        <span className="tabular-nums font-medium">{pullCount}</span>
      </TooltipTrigger>
      <TooltipPopup
        side="top"
        className="border-border/80 px-2.5 py-1 font-medium shadow-md/10"
      >
        Pulls
      </TooltipPopup>
    </Tooltip>
  );
}

function ImageCatalogCard({
  image,
  repositoryName,
  canManage,
}: {
  image: CatalogResponse["images"][number];
  repositoryName: string;
  canManage: boolean;
}) {
  const imageTitle = `${repositoryName}/${image.name}`;
  const tagsHref = `/r/${repositoryName}/i/${imagePathSegments(image.name)}`;
  const settingsHref = `/r/${encodeURIComponent(repositoryName)}/i/${imagePathSegments(image.name)}/settings`;

  return (
    <Card className="relative min-h-36 transition-colors hover:border-ring/50">
      <CardHeader className="pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
            <PackageIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="flex h-10 min-w-0 flex-1 flex-col justify-between">
            <CardTitle className="leading-none">
              <Link
                href={tagsHref}
                className="block truncate font-mono text-lg leading-none transition-colors hover:text-primary"
              >
                {imageTitle}
              </Link>
            </CardTitle>
            <Badge variant="secondary" className="w-fit">
              {image.tagCount} tag{image.tagCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
        {canManage ? (
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Settings for ${imageTitle}`}
              render={<Link href={settingsHref} />}
            >
              <SettingsIcon className="size-4" />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center">
          {canManage ? <ImageVisibilityLock image={image} /> : null}
        </div>
        <ImagePullCount pullCount={image.pullCount ?? 0} />
      </div>
    </Card>
  );
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {catalogQuery.data!.images.map((image) => (
            <ImageCatalogCard
              key={image.name}
              image={image}
              repositoryName={repositoryName}
              canManage={canManage}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
