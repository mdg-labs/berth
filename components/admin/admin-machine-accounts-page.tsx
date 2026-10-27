// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";

import {
  ADMIN_MACHINE_ACCOUNTS_QUERY_KEY,
  AdminMachineAccountsTable,
} from "@/components/admin/admin-machine-accounts-table";
import { ErrorAlert } from "@/components/catalog/error-alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import { useRepositoriesList } from "@/lib/hooks/use-repository";
import type { MachineAccountSummary } from "@/lib/machine-accounts/types";

export type AdminMachineAccountRow = MachineAccountSummary & {
  status: "active" | "disabled" | "expired";
};

type MachineAccountsResponse = {
  machineAccounts: AdminMachineAccountRow[];
};

const KINDS = ["repository", "host"] as const;
const STATUSES = ["active", "disabled", "expired"] as const;
const ALL = "all";

export function AdminMachineAccountsPage() {
  const t = useTranslations("admin.machineAccounts");
  const [filters, setFilters] = useQueryStates({
    kind: parseAsStringLiteral(KINDS),
    repositoryId: parseAsString,
    status: parseAsStringLiteral(STATUSES),
  });

  const repositoriesQuery = useRepositoriesList();
  const repositories = repositoriesQuery.data?.repositories ?? [];

  const accountsQuery = useQuery({
    queryKey: [ADMIN_MACHINE_ACCOUNTS_QUERY_KEY, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.kind) {
        params.set("kind", filters.kind);
      }
      if (filters.repositoryId) {
        params.set("repositoryId", filters.repositoryId);
      }
      if (filters.status) {
        params.set("status", filters.status);
      }
      const query = params.toString();
      return apiFetch<MachineAccountsResponse>(
        `/api/admin/machine-accounts${query ? `?${query}` : ""}`,
      );
    },
  });

  const hasFilters = Boolean(
    filters.kind || filters.repositoryId || filters.status,
  );
  const accounts = accountsQuery.data?.machineAccounts;
  const selectedRepository = repositories.find(
    (repository) => repository.id === filters.repositoryId,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.kind ?? ALL}
          onValueChange={(value) =>
            void setFilters({
              kind: KINDS.find((kind) => kind === value) ?? null,
            })
          }
        >
          <SelectTrigger size="sm" className="w-auto min-w-36" aria-label={t("filters.kind")}>
            <SelectValue>
              {filters.kind ? t(`kind.${filters.kind}`) : t("filters.allKinds")}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value={ALL}>{t("filters.allKinds")}</SelectItem>
            {KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`kind.${kind}`)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>

        <Select
          value={filters.repositoryId ?? ALL}
          onValueChange={(value) =>
            void setFilters({ repositoryId: value === ALL ? null : value })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-auto min-w-44"
            aria-label={t("filters.repository")}
          >
            <SelectValue>
              {filters.repositoryId
                ? (selectedRepository?.name ?? filters.repositoryId)
                : t("filters.allRepositories")}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value={ALL}>{t("filters.allRepositories")}</SelectItem>
            {repositories.map((repository) => (
              <SelectItem key={repository.id} value={repository.id}>
                {repository.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>

        <Select
          value={filters.status ?? ALL}
          onValueChange={(value) =>
            void setFilters({
              status: STATUSES.find((status) => status === value) ?? null,
            })
          }
        >
          <SelectTrigger size="sm" className="w-auto min-w-36" aria-label={t("filters.status")}>
            <SelectValue>
              {filters.status
                ? t(`status.${filters.status}`)
                : t("filters.allStatuses")}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value={ALL}>{t("filters.allStatuses")}</SelectItem>
            {STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`status.${status}`)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              void setFilters({ kind: null, repositoryId: null, status: null })
            }
          >
            {t("filters.clear")}
          </Button>
        ) : null}
      </div>

      {repositoriesQuery.isError ? (
        <ErrorAlert
          title={t("filters.repositoriesError")}
          error={repositoriesQuery.error}
          onRetry={() => void repositoriesQuery.refetch()}
        />
      ) : null}

      {accountsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {accountsQuery.isError ? (
        <ErrorAlert
          title={t("loadError")}
          error={accountsQuery.error}
          onRetry={() => void accountsQuery.refetch()}
        />
      ) : null}

      {accounts && accounts.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t("empty.title")}</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? t("empty.filteredDescription")
                : t("empty.description")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {accounts && accounts.length > 0 ? (
        <AdminMachineAccountsTable accounts={accounts} />
      ) : null}
    </div>
  );
}
