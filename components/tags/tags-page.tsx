// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useCallback, useMemo, useRef, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { useAuthUser } from "@/components/providers/auth-guard";
import { BulkDeleteDialog } from "@/components/delete/bulk-delete-dialog";
import { GcInfoAlert } from "@/components/delete/gc-info-alert";
import { canDeleteRegistryContent } from "@/components/delete/permissions";
import { RepositoryDeleteDialog } from "@/components/delete/repository-delete-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toastManager } from "@/components/ui/toast";
import { Toolbar, ToolbarButton, ToolbarGroup } from "@/components/ui/toolbar";
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

function encodeRepoPath(repoName: string): string {
  return repoName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

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
  const queryClient = useQueryClient();
  const authQuery = useAuthUser();
  const projectQuery = useProjectByName(projectName);
  const [query, setQuery] = useQueryStates({
    search: parseAsString.withDefault(""),
    sort: parseAsStringLiteral(["name", "name_desc"] as const).withDefault("name"),
    page: parseAsInteger.withDefault(1),
    pageSize: parseAsInteger.withDefault(25),
  });

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [repoDeleteOpen, setRepoDeleteOpen] = useState(false);
  const [showGcInfo, setShowGcInfo] = useState(false);

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

      return apiFetch<TagsListResponse>(
        `/api/projects/${projectQuery.data!.id}/repos/${encodeRepoPath(repoName)}/tags?${params.toString()}`,
      );
    },
    enabled: Boolean(projectQuery.data?.id),
    refetchInterval: 30_000,
  });

  const canDelete = canDeleteRegistryContent(
    authQuery.data?.user.systemRole ?? "user",
    projectQuery.data?.role ?? null,
  );
  const canManage =
    authQuery.data?.user.systemRole === "admin" ||
    projectQuery.data?.role === "admin";

  const bulkDeleteMutation = useMutation({
    mutationFn: (tagNames: string[]) =>
      apiFetch<{ deletedTags: string[] }>(
        `/api/projects/${projectQuery.data!.id}/repos/${encodeRepoPath(repoName)}/tags/bulk-delete`,
        { method: "POST", body: { tags: tagNames } },
      ),
    onSuccess: (result) => {
      setBulkDeleteOpen(false);
      setSelectedTags(new Set());
      setShowGcInfo(true);
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      toastManager.add({
        type: "success",
        title: "Tags deleted",
        description: `Removed ${result.deletedTags.length} tag${result.deletedTags.length === 1 ? "" : "s"}.`,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Bulk delete failed",
        description: error instanceof Error ? error.message : "Request failed",
      });
    },
  });

  const repoDeleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ deletedTags: string[] }>(
        `/api/projects/${projectQuery.data!.id}/repos/${encodeRepoPath(repoName)}`,
        { method: "DELETE" },
      ),
    onSuccess: (result) => {
      setRepoDeleteOpen(false);
      setSelectedTags(new Set());
      setShowGcInfo(true);
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      toastManager.add({
        type: "success",
        title: "Repository deleted",
        description: `Removed ${result.deletedTags.length} tag${result.deletedTags.length === 1 ? "" : "s"}.`,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Repository delete failed",
        description: error instanceof Error ? error.message : "Request failed",
      });
    },
  });

  const toggleTag = useCallback((tagName: string, checked: boolean) => {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(tagName);
      } else {
        next.delete(tagName);
      }
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(
    (checked: boolean) => {
      const pageTags = tagsQuery.data?.tags ?? [];
      setSelectedTags((current) => {
        const next = new Set(current);
        for (const tag of pageTags) {
          if (checked) {
            next.add(tag.name);
          } else {
            next.delete(tag.name);
          }
        }
        return next;
      });
    },
    [tagsQuery.data?.tags],
  );

  const columns = useMemo(() => {
    const baseColumns = [];

    if (canDelete) {
      const pageTags = tagsQuery.data?.tags ?? [];
      const allSelected =
        pageTags.length > 0 && pageTags.every((tag) => selectedTags.has(tag.name));
      const someSelected =
        pageTags.some((tag) => selectedTags.has(tag.name)) && !allSelected;

      baseColumns.push(
        columnHelper.display({
          id: "select",
          header: () => (
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
              aria-label="Select all tags on page"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={selectedTags.has(row.original.name)}
              onCheckedChange={(checked) =>
                toggleTag(row.original.name, checked === true)
              }
              aria-label={`Select ${row.original.name}`}
            />
          ),
        }),
      );
    }

    baseColumns.push(
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
    );

    return baseColumns;
  }, [
    canDelete,
    projectName,
    repoName,
    selectedTags,
    tagsQuery.data?.tags,
    toggleAllOnPage,
    toggleTag,
  ]);

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
  const selectedTagNames = [...selectedTags];

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
          {canManage ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={`/p/${encodeURIComponent(projectName)}/r/${repoPathSegments(repoName)}/settings`}
                />
              }
            >
              <SettingsIcon />
              Settings
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              variant="destructive-outline"
              size="sm"
              disabled={(tagsQuery.data?.total ?? 0) === 0}
              onClick={() => setRepoDeleteOpen(true)}
            >
              <Trash2Icon />
              Delete repository
            </Button>
          ) : null}
        </div>
      </div>

      {showGcInfo ? <GcInfoAlert onDismiss={() => setShowGcInfo(false)} /> : null}

      {canDelete && selectedTagNames.length > 0 ? (
        <Toolbar>
          <ToolbarGroup className="flex-1 px-2 text-sm text-muted-foreground">
            {selectedTagNames.length} selected
          </ToolbarGroup>
          <ToolbarButton
            render={
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
              />
            }
          >
            <Trash2Icon />
            Delete selected
          </ToolbarButton>
        </Toolbar>
      ) : null}

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

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        tagNames={selectedTagNames}
        isPending={bulkDeleteMutation.isPending}
        onConfirm={() => bulkDeleteMutation.mutate(selectedTagNames)}
      />

      <RepositoryDeleteDialog
        open={repoDeleteOpen}
        onOpenChange={setRepoDeleteOpen}
        repoName={repoName}
        tagCount={tagsQuery.data?.total ?? 0}
        isPending={repoDeleteMutation.isPending}
        onConfirm={() => repoDeleteMutation.mutate()}
      />
    </div>
  );
}
