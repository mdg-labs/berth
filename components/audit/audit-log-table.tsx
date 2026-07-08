// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  SearchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { useCallback, useMemo } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  SelectItem,
  SelectPopup,
  SelectTrigger,
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
import { apiFetch } from "@/lib/api/client";
import type {
  AuditLogEntry,
  AuditLogListResponse,
  AuditLogSort,
} from "@/lib/audit/query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

type AuditLogTableProps = {
  apiPath: string;
  showClientIp?: boolean;
  queryKeyPrefix?: string;
};

const columnHelper = createColumnHelper<AuditLogEntry>();

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const SORT_OPTIONS = [
  "created_at_asc",
  "created_at_desc",
  "action_asc",
  "action_desc",
  "actor_asc",
  "actor_desc",
  "resource_asc",
  "resource_desc",
] as const satisfies readonly AuditLogSort[];

type SortColumn = "created_at" | "action" | "actor" | "resource";

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

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function sortForColumn(
  column: SortColumn,
  current: AuditLogSort,
): AuditLogSort {
  if (column === "created_at") {
    return current === "created_at_asc" ? "created_at_desc" : "created_at_asc";
  }
  if (column === "action") {
    return current === "action_asc" ? "action_desc" : "action_asc";
  }
  if (column === "actor") {
    return current === "actor_asc" ? "actor_desc" : "actor_asc";
  }
  return current === "resource_asc" ? "resource_desc" : "resource_asc";
}

function SortableHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sort: AuditLogSort;
  onSort: (next: AuditLogSort) => void;
}) {
  const asc = `${column}_asc` as AuditLogSort;
  const desc = `${column}_desc` as AuditLogSort;
  const isActive = sort === asc || sort === desc;
  const direction = sort === asc ? "asc" : sort === desc ? "desc" : null;

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      onClick={() => onSort(sortForColumn(column, sort))}
    >
      {label}
      {direction === "asc" ? (
        <ArrowUpIcon className="size-3.5" />
      ) : direction === "desc" ? (
        <ArrowDownIcon className="size-3.5" />
      ) : (
        <ArrowUpDownIcon className="size-3.5 opacity-50" />
      )}
      <span className="sr-only">{isActive ? `Sorted ${direction}` : "Sort"}</span>
    </button>
  );
}

function AuditSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function AuditLogTable({
  apiPath,
  showClientIp = true,
  queryKeyPrefix = "audit-log",
}: AuditLogTableProps) {
  const t = useTranslations("audit");
  const [query, setQuery] = useQueryStates({
    search: parseAsString.withDefault(""),
    sort: parseAsStringLiteral(SORT_OPTIONS).withDefault("created_at_desc"),
    page: parseAsInteger.withDefault(1),
    pageSize: parseAsInteger.withDefault(25),
    action: parseAsString.withDefault(""),
    actor: parseAsString.withDefault(""),
    resource: parseAsString.withDefault(""),
    from: parseAsString.withDefault(""),
    to: parseAsString.withDefault(""),
  });

  const debouncedSearch = useDebouncedValue(query.search, 300);
  const debouncedActor = useDebouncedValue(query.actor, 300);
  const debouncedResource = useDebouncedValue(query.resource, 300);

  const auditQuery = useQuery({
    queryKey: [
      queryKeyPrefix,
      apiPath,
      debouncedSearch,
      query.sort,
      query.page,
      query.pageSize,
      query.action,
      debouncedActor,
      debouncedResource,
      query.from,
      query.to,
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
      if (query.action) {
        params.set("action", query.action);
      }
      if (debouncedActor.trim()) {
        params.set("actor", debouncedActor.trim());
      }
      if (debouncedResource.trim()) {
        params.set("resource", debouncedResource.trim());
      }
      if (query.from) {
        params.set("from", query.from);
      }
      if (query.to) {
        params.set("to", query.to);
      }

      return apiFetch<AuditLogListResponse>(`${apiPath}?${params.toString()}`);
    },
  });

  const formatActor = useCallback(
    (entry: AuditLogEntry) => {
      if (entry.actor.email) {
        return entry.actor.name
          ? `${entry.actor.name} (${entry.actor.email})`
          : entry.actor.email;
      }
      if (entry.actor.userId === null) {
        return t("actor.system");
      }
      return t("actor.unknown");
    },
    [t],
  );

  const handleSort = useCallback(
    (next: AuditLogSort) => {
      void setQuery({ sort: next, page: 1 });
    },
    [setQuery],
  );

  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor("createdAt", {
        id: "createdAt",
        header: () => (
          <SortableHeader
            label={t("columns.timestamp")}
            column="created_at"
            sort={query.sort}
            onSort={handleSort}
          />
        ),
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">
            {formatTimestamp(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actor",
        header: () => (
          <SortableHeader
            label={t("columns.actor")}
            column="actor"
            sort={query.sort}
            onSort={handleSort}
          />
        ),
        cell: ({ row }) => formatActor(row.original),
      }),
      columnHelper.accessor("action", {
        header: () => (
          <SortableHeader
            label={t("columns.action")}
            column="action"
            sort={query.sort}
            onSort={handleSort}
          />
        ),
        cell: (info) => (
          <Badge variant="secondary" className="font-mono text-xs">
            {info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor("resource", {
        header: () => (
          <SortableHeader
            label={t("columns.resource")}
            column="resource"
            sort={query.sort}
            onSort={handleSort}
          />
        ),
        cell: (info) => (
          <span className="break-all font-mono text-xs">{info.getValue()}</span>
        ),
      }),
    ];

    if (showClientIp) {
      base.push(
        columnHelper.accessor("clientIp", {
          header: t("columns.clientIp"),
          cell: (info) => info.getValue() ?? "—",
        }),
      );
    }

    return base;
  }, [formatActor, handleSort, query.sort, showClientIp, t]);

  const table = useReactTable({
    data: auditQuery.data?.entries ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search ||
      query.action ||
      query.actor ||
      query.resource ||
      query.from ||
      query.to,
  );

  const clearFilters = () => {
    void setQuery({
      search: "",
      action: "",
      actor: "",
      resource: "",
      from: "",
      to: "",
      page: 1,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <InputGroup className="max-w-md">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query.search}
            onChange={(event) => {
              void setQuery({ search: event.target.value, page: 1 });
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
        </InputGroup>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="audit-from">
              {t("fromDate")}
            </label>
            <Input
              id="audit-from"
              type="date"
              value={query.from}
              onChange={(event) => {
                void setQuery({ from: event.target.value, page: 1 });
              }}
              className="w-auto"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="audit-to">
              {t("toDate")}
            </label>
            <Input
              id="audit-to"
              type="date"
              value={query.to}
              onChange={(event) => {
                void setQuery({ to: event.target.value, page: 1 });
              }}
              className="w-auto"
            />
          </div>
          {hasFilters ? (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t("clearFilters")}
            </Button>
          ) : null}
        </div>
      </div>

      {auditQuery.isLoading ? <AuditSkeleton /> : null}

      {auditQuery.error ? (
        <ErrorAlert
          error={auditQuery.error}
          fallbackKey="generic"
          message={
            auditQuery.error instanceof Error ? undefined : t("loadError")
          }
          onRetry={() => {
            void auditQuery.refetch();
          }}
        />
      ) : null}

      {!auditQuery.isLoading && !auditQuery.error ? (
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
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead />
                  <TableHead>
                    <Input
                      value={query.actor}
                      onChange={(event) => {
                        void setQuery({ actor: event.target.value, page: 1 });
                      }}
                      placeholder={t("actorPlaceholder")}
                      aria-label={t("actorPlaceholder")}
                      className="h-8"
                    />
                  </TableHead>
                  <TableHead>
                    <Select
                      value={query.action || "all"}
                      onValueChange={(value) => {
                        void setQuery({
                          action: value === "all" ? "" : (value ?? ""),
                          page: 1,
                        });
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full min-w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="all">{t("allActions")}</SelectItem>
                        {(auditQuery.data?.actions ?? []).map((action) => (
                          <SelectItem key={action} value={action}>
                            {action}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </TableHead>
                  <TableHead>
                    <Input
                      value={query.resource}
                      onChange={(event) => {
                        void setQuery({ resource: event.target.value, page: 1 });
                      }}
                      placeholder={t("resourcePlaceholder")}
                      aria-label={t("resourcePlaceholder")}
                      className="h-8"
                    />
                  </TableHead>
                  {showClientIp ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={showClientIp ? 5 : 4}
                      className="h-32 text-center"
                    >
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>{t("empty.title")}</EmptyTitle>
                          <EmptyDescription>
                            {t("empty.description")}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {total > 0 ? (
            <div
              className={cn(
                "flex flex-nowrap items-center justify-end gap-6 overflow-x-auto border-t px-2.5 py-4 text-sm text-muted-foreground",
              )}
            >
              <div className="flex items-center gap-2">
                <span>{t("pagination.rowsPerPage")}</span>
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
                  <SelectTrigger size="sm" className="w-auto min-w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>

              <span>
                {t("pagination.page", {
                  page: query.page,
                  totalPages,
                })}
              </span>

              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (query.page > 1) {
                          void setQuery({ page: query.page - 1 });
                        }
                      }}
                      aria-disabled={query.page <= 1}
                      className={cn(query.page <= 1 && "pointer-events-none opacity-50")}
                    >
                      {t("pagination.previous")}
                    </PaginationPrevious>
                  </PaginationItem>

                  {getPaginationRange(query.page, totalPages).map((item, index) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          href="#"
                          isActive={item === query.page}
                          onClick={(event) => {
                            event.preventDefault();
                            void setQuery({ page: item });
                          }}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (query.page < totalPages) {
                          void setQuery({ page: query.page + 1 });
                        }
                      }}
                      aria-disabled={query.page >= totalPages}
                      className={cn(
                        query.page >= totalPages && "pointer-events-none opacity-50",
                      )}
                    >
                      {t("pagination.next")}
                    </PaginationNext>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
