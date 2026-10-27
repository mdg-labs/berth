// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BotIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { MachineAccountCreateDialog } from "@/components/settings/machine-account-create-dialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";
import type { MachineAccountSummary } from "@/lib/machine-accounts/types";

type MachineAccountsResponse = {
  machineAccounts: MachineAccountSummary[];
};

type RepositoryMachineAccountsSectionProps = {
  repositoryId: string;
};

export function RepositoryMachineAccountsSection({
  repositoryId,
}: RepositoryMachineAccountsSectionProps) {
  const t = useTranslations("settings.machineAccounts");
  const tCommon = useTranslations("common.actions");
  const tErrors = useTranslations("errorsApi");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<MachineAccountSummary | null>(null);

  const queryKey = ["repository-machine-accounts", repositoryId];

  const accountsQuery = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<MachineAccountsResponse>(
        `/api/repositories/${repositoryId}/machine-accounts`,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) =>
      apiFetch(
        `/api/repositories/${repositoryId}/machine-accounts/${accountId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setDeleteOpen(false);
      toastManager.add({
        type: "success",
        title: t("toast.deleted"),
      });
    },
    onError: (error) => {
      setDeleteOpen(false);
      toastManager.add({
        type: "error",
        title: t("toast.deleteError"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const accounts = accountsQuery.data?.machineAccounts;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BotIcon className="size-5" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          {accounts && accounts.length > 0 ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              {t("create")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {accountsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : accountsQuery.isError ? (
            <ErrorAlert
              error={accountsQuery.error}
              onRetry={() => void accountsQuery.refetch()}
            />
          ) : accounts && accounts.length === 0 ? (
            <Empty className="rounded-lg border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{t("empty.title")}</EmptyTitle>
                <EmptyDescription>{t("empty.description")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  <PlusIcon />
                  {t("create")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : accounts ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.username")}</TableHead>
                  <TableHead>{t("table.description")}</TableHead>
                  <TableHead>{t("table.permissions")}</TableHead>
                  <TableHead>{t("table.createdBy")}</TableHead>
                  <TableHead>{t("table.createdAt")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("table.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        {account.name}
                        {account.kind === "host" ? (
                          <Badge variant="outline">{t("managedBySystem")}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{account.username}</code>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {account.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {account.allowPull ? (
                          <Badge variant="secondary">
                            {t("permission.pull")}
                          </Badge>
                        ) : null}
                        {account.allowPush ? (
                          <Badge variant="secondary">
                            {t("permission.push")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.createdBy?.name ?? t("deletedUser")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(account.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {account.kind === "host" ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("deleteAccount", { name: account.name })}
                          onClick={() => {
                            setDeleteTarget(account);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <MachineAccountCreateDialog
        repositoryId={repositoryId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <AlertDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteDialog.title", { name: deleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", {
                username: deleteTarget?.username ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {tCommon("cancel")}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || !deleteTarget}
              data-loading={deleteMutation.isPending ? "" : undefined}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? <Spinner /> : null}
              {t("deleteDialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
