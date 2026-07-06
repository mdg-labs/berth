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
import { useCallback, useMemo, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { useAuthUser } from "@/components/providers/auth-guard";
import { BulkDeleteDialog } from "@/components/delete/bulk-delete-dialog";
import { GcInfoAlert } from "@/components/delete/gc-info-alert";
import { canDeleteRegistryContent } from "@/components/delete/permissions";
import { TagSiblingsCell } from "@/components/tags/tag-siblings-cell";
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
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectButton,
  SelectItem,
  SelectPopup,
  SelectValue,
} from "@/components/ui/select";
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
import { formatBytes, formatDigest, imagePathSegments } from "@/lib/catalog/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useRepositoryByName } from "@/lib/hooks/use-repository";
import type { TagSummary, TagsListResponse } from "@/lib/registry/client/types";
import { cn } from "@/lib/utils";

type TagsPageProps = {
  repositoryName: string;
  imageName: string;
};

const columnHelper = createColumnHelper<TagSummary>();

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function encodeRepoPath(imageName: string): string {
  return imageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getPaginationRange(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];

  if (currentPage > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (currentPage < totalPages - 2) {
    pages.push("ellipsis");
  }

  pages.push(totalPages);

  return pages;
}

function TagsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function TagsPage({ repositoryName, imageName }: TagsPageProps) {
  const queryClient = useQueryClient();
  const authQuery = useAuthUser();
  const repositoryQuery = useRepositoryByName(repositoryName);
  const [query, setQuery] = useQueryStates({
    search: parseAsString.withDefault(""),
    sort: parseAsStringLiteral(["name", "name_desc"] as const).withDefault("name"),
    page: parseAsInteger.withDefault(1),
    pageSize: parseAsInteger.withDefault(25),
  });

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [showGcInfo, setShowGcInfo] = useState(false);

  const debouncedSearch = useDebouncedValue(query.search, 300);

  const tagsQuery = useQuery({
    queryKey: [
      "tags",
      repositoryQuery.data?.id,
      imageName,
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
        `/api/repositories/${repositoryQuery.data!.id}/images/${encodeRepoPath(imageName)}/tags?${params.toString()}`,
      );
    },
    enabled: Boolean(repositoryQuery.data?.id),
    refetchInterval: 30_000,
  });

  const canDelete = canDeleteRegistryContent(
    authQuery.data?.user.systemRole ?? "user",
    repositoryQuery.data?.role ?? null,
  );
  const canManage =
    authQuery.data?.user.systemRole === "admin" ||
    repositoryQuery.data?.role === "admin";
  const canAccessSettings = canManage || canDelete;

  const bulkDeleteMutation = useMutation({
    mutationFn: (tagNames: string[]) =>
      apiFetch<{ deletedTags: string[] }>(
        `/api/repositories/${repositoryQuery.data!.id}/images/${encodeRepoPath(imageName)}/tags/bulk-delete`,
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
            href={`/r/${repositoryName}/i/${imagePathSegments(imageName)}/t/${encodeURIComponent(info.getValue())}`}
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
      columnHelper.accessor("pullCount", {
        header: () => <span className="block w-full text-right">Pulls</span>,
        cell: (info) => (
          <span className="block text-right tabular-nums text-muted-foreground">
            {info.getValue() ?? 0}
          </span>
        ),
      }),
      columnHelper.accessor("siblings", {
        header: "Siblings",
        cell: (info) => (
          <TagSiblingsCell
            repositoryName={repositoryName}
            imageName={imageName}
            siblings={info.getValue()}
          />
        ),
      }),
    );

    return baseColumns;
  }, [
    canDelete,
    repositoryName,
    imageName,
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

  const total = tagsQuery.data?.total ?? 0;
  const pageSize = tagsQuery.data?.pageSize ?? query.pageSize;
  const totalPages = total > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const rangeStart = total === 0 ? 0 : (query.page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(query.page * pageSize, total);
  const pageNumbers = getPaginationRange(query.page, totalPages);

  const isLoading = repositoryQuery.isLoading || tagsQuery.isLoading;
  const error = repositoryQuery.error ?? tagsQuery.error;
  const selectedTagNames = [...selectedTags];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{imageName}</h1>
          <p className="text-sm text-muted-foreground">
            Tags in {repositoryName}/{imageName}
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
          {canAccessSettings ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={`/r/${encodeURIComponent(repositoryName)}/i/${imagePathSegments(imageName)}/settings`}
                />
              }
            >
              <SettingsIcon />
              Settings
            </Button>
          ) : null}
        </div>
      </div>

      {showGcInfo ? (
        <div className="shrink-0">
          <GcInfoAlert onDismiss={() => setShowGcInfo(false)} />
        </div>
      ) : null}

      {canDelete && selectedTagNames.length > 0 ? (
        <Toolbar className="shrink-0">
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

      {isLoading ? <TagsSkeleton className="shrink-0" /> : null}

      {error ? (
        <div className="shrink-0">
          <ErrorAlert
            message={error instanceof Error ? error.message : "Failed to load tags"}
            onRetry={() => {
              void repositoryQuery.refetch();
              void tagsQuery.refetch();
            }}
          />
        </div>
      ) : null}

      {!isLoading && !error && tagsQuery.data?.tags.length === 0 ? (
        <Empty className="shrink-0 rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No tags found</EmptyTitle>
            <EmptyDescription>
              Push a tag to this image to see it here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!isLoading && !error && (tagsQuery.data?.tags.length ?? 0) > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="min-h-0 flex-1 overflow-auto">
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
                  <TableRow key={row.id}>
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

          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-6 overflow-x-auto border-t px-2.5 py-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <Select
                value={String(query.pageSize)}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }

                  void setQuery({
                    pageSize: Number.parseInt(value, 10),
                    page: 1,
                  });
                }}
              >
                <SelectButton size="sm" className="w-auto min-w-16">
                  <SelectValue />
                </SelectButton>
                <SelectPopup>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <span>
              {rangeStart}–{rangeEnd} of {total}
            </span>

            {totalPages > 1 ? (
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      render={
                        <button
                          type="button"
                          disabled={query.page <= 1}
                          onClick={() =>
                            void setQuery({ page: Math.max(1, query.page - 1) })
                          }
                        />
                      }
                    />
                  </PaginationItem>
                  {pageNumbers.map((page, index) =>
                    page === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === query.page}
                          render={
                            <button
                              type="button"
                              onClick={() => void setQuery({ page })}
                            />
                          }
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      render={
                        <button
                          type="button"
                          disabled={query.page >= totalPages}
                          onClick={() =>
                            void setQuery({
                              page: Math.min(totalPages, query.page + 1),
                            })
                          }
                        />
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </div>
        </div>
      ) : null}

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        tagNames={selectedTagNames}
        isPending={bulkDeleteMutation.isPending}
        onConfirm={() => bulkDeleteMutation.mutate(selectedTagNames)}
      />
    </div>
  );
}
