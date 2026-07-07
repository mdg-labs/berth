// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { PackageIcon, SearchIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { PublicShell } from "@/components/public/public-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { imagePathSegments } from "@/lib/catalog/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import type { PublicImagesResponse } from "@/lib/public/images";

const columnHelper = createColumnHelper<PublicImagesResponse["images"][number]>();

function PublicCatalogSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="divide-y">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 rounded-none" />
        ))}
      </div>
    </div>
  );
}

function PublicEmptyLanding() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-10 py-8 text-center md:py-16">
      <div className="space-y-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Berth
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Self-hosted OCI artifact registry with identity, repositories, and
          RBAC.
        </p>
      </div>

      <Empty className="w-full rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageIcon />
          </EmptyMedia>
          <EmptyTitle>No public images yet</EmptyTitle>
          <EmptyDescription>
            Images marked for anonymous pull will appear here. Sign in to manage
            repositories and publish container images.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/login" />}>Sign in</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export function PublicCatalogPage() {
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault(""),
  );
  const debouncedSearch = useDebouncedValue(search, 300);

  const imagesQuery = useQuery({
    queryKey: ["public-images", debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      const query = params.toString();
      return apiFetch<PublicImagesResponse>(
        `/api/public/images${query ? `?${query}` : ""}`,
      );
    },
    refetchInterval: 30_000,
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "image",
        header: "Image",
        cell: ({ row }) => {
          const { repository, name } = row.original;
          const qualified = `${repository}/${name}`;
          const nextPath = `/r/${encodeURIComponent(repository)}/i/${imagePathSegments(name)}`;
          return (
            <Link
              href={`/login?next=${encodeURIComponent(nextPath)}`}
              className="font-mono text-sm transition-colors hover:text-primary"
            >
              {qualified}
            </Link>
          );
        },
      }),
      columnHelper.accessor("repository", {
        header: "Repository",
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("tagCount", {
        header: "Tags",
        cell: (info) => (
          <Badge variant="secondary">
            {info.getValue()} tag{info.getValue() === 1 ? "" : "s"}
          </Badge>
        ),
      }),
      columnHelper.accessor("pullCount", {
        header: () => <span className="block w-full text-right">Pulls</span>,
        cell: (info) => (
          <span className="block text-right tabular-nums text-muted-foreground">
            {info.getValue()}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: imagesQuery.data?.images ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const isLoading = imagesQuery.isLoading;
  const error = imagesQuery.error;
  const hasImages = (imagesQuery.data?.images.length ?? 0) > 0;
  const isEmpty =
    !isLoading && !error && (imagesQuery.data?.images.length ?? 0) === 0;

  return (
    <PublicShell>
      {isEmpty && !debouncedSearch.trim() ? <PublicEmptyLanding /> : null}

      {!isEmpty || debouncedSearch.trim() ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Public images
              </h1>
              <p className="text-sm text-muted-foreground">
                {isLoading
                  ? "Loading publicly available images…"
                  : `${imagesQuery.data?.total ?? 0} image${(imagesQuery.data?.total ?? 0) === 1 ? "" : "s"} available for anonymous pull.`}
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

          {isLoading ? <PublicCatalogSkeleton /> : null}

          {error ? (
            <ErrorAlert
              message={
                error instanceof Error
                  ? error.message
                  : "Failed to load public images"
              }
              onRetry={() => void imagesQuery.refetch()}
            />
          ) : null}

          {!isLoading &&
          !error &&
          debouncedSearch.trim() &&
          (imagesQuery.data?.images.length ?? 0) === 0 ? (
            <Empty className="rounded-lg border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No matching images</EmptyTitle>
                <EmptyDescription>
                  Try a different search term or browse all public images.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {!isLoading && !error && hasImages ? (
            <div className="overflow-hidden rounded-lg border bg-background">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={`${row.original.repository}/${row.original.name}`}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </PublicShell>
  );
}
