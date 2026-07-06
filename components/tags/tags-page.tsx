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
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useMemo, useRef } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { formatBytes, formatDigest, repoPathSegments } from "@/lib/catalog/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useProjectByName } from "@/lib/hooks/use-project";
import type { TagSummary, TagsListResponse } from "@/lib/registry/client/types";

type TagsPageProps = {
  projectName: string;
  repoName: string;
};

const columnHelper = createColumnHelper<TagSummary>();

function TagsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function TagsPage({ projectName, repoName }: TagsPageProps) {
  const projectQuery = useProjectByName(projectName);
  const [query, setQuery] = useQueryStates({
    search: parseAsString.withDefault(""),
    sort: parseAsStringLiteral(["name", "name_desc"] as const).withDefault("name"),
    page: parseAsInteger.withDefault(1),
    pageSize: parseAsInteger.withDefault(25),
  });

  const debouncedSearch = useDebouncedValue(query.search, 300);

  const tagsQuery = useQuery({
    queryKey: [
      "tags",
      projectQuery.data?.id,
      repoName,
      debouncedSearch,
      query.sort,
      query.page,
      query.pageSize,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(query.page),
        pageSize: String(query.pageSize),
        sort: query.sort,
      });
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }

      const encodedRepo = repoName
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      return apiFetch<TagsListResponse>(
        `/api/projects/${projectQuery.data!.id}/repos/${encodedRepo}/tags?${params.toString()}`,
      );
    },
    enabled: Boolean(projectQuery.data?.id),
    refetchInterval: 30_000,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Tag",
        cell: (info) => (
          <Link
            href={`/p/${projectName}/r/${repoPathSegments(repoName)}/t/${encodeURIComponent(info.getValue())}`}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("digest", {
        header: "Digest",
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">
            {formatDigest(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("size", {
        header: "Size",
        cell: (info) => formatBytes(info.getValue()),
      }),
    ],
    [projectName, repoName],
  );

  const table = useReactTable({
    data: tagsQuery.data?.tags ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  const totalPages = tagsQuery.data
    ? Math.max(1, Math.ceil(tagsQuery.data.total / tagsQuery.data.pageSize))
    : 1;

  const isLoading = projectQuery.isLoading || tagsQuery.isLoading;
  const error = projectQuery.error ?? tagsQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{repoName}</h1>
          <p className="text-sm text-muted-foreground">
            Tags in {projectName}/{repoName}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="w-full sm:w-64">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search tags…"
              value={query.search}
              onChange={(event) =>
                void setQuery({ search: event.target.value, page: 1 })
              }
            />
          </InputGroup>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void setQuery({
                sort: query.sort === "name" ? "name_desc" : "name",
                page: 1,
              })
            }
          >
            {query.sort === "name_desc" ? <ArrowDownIcon /> : <ArrowUpIcon />}
            Sort
          </Button>
        </div>
      </div>

      {isLoading ? <TagsSkeleton /> : null}

      {error ? (
        <ErrorAlert
          message={error instanceof Error ? error.message : "Failed to load tags"}
          onRetry={() => {
            void projectQuery.refetch();
            void tagsQuery.refetch();
          }}
        />
      ) : null}

      {!isLoading && !error && tagsQuery.data?.tags.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No tags found</EmptyTitle>
            <EmptyDescription>
              Push a tag to this repository to see it here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!isLoading && !error && (tagsQuery.data?.tags.length ?? 0) > 0 ? (
        <div className="space-y-4">
          <div ref={parentRef} className="max-h-[60vh] overflow-auto rounded-lg border">
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
              <TableBody style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <TableRow
                      key={row.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  render={
                    <button
                      type="button"
                      disabled={query.page <= 1}
                      onClick={() => void setQuery({ page: Math.max(1, query.page - 1) })}
                    />
                  }
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink isActive>
                  {query.page} / {totalPages}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  render={
                    <button
                      type="button"
                      disabled={query.page >= totalPages}
                      onClick={() =>
                        void setQuery({ page: Math.min(totalPages, query.page + 1) })
                      }
                    />
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </div>
  );
}
