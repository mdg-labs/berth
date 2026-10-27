// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PowerIcon, PowerOffIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { AdminMachineAccountRow } from "@/components/admin/admin-machine-accounts-page";
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

export const ADMIN_MACHINE_ACCOUNTS_QUERY_KEY = "admin-machine-accounts";

type AdminMachineAccountsTableProps = {
  accounts: AdminMachineAccountRow[];
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function toggleUrl(account: AdminMachineAccountRow): string {
  const owner = account.repositories[0];
  return account.kind === "repository" && owner
    ? `/api/repositories/${owner.id}/machine-accounts/${account.id}`
    : `/api/admin/machine-accounts/${account.id}`;
}

export function AdminMachineAccountsTable({
  accounts,
}: AdminMachineAccountsTableProps) {
  const t = useTranslations("admin.machineAccounts");
  const tCommon = useTranslations("common.actions");
  const tErrors = useTranslations("errorsApi");
  const queryClient = useQueryClient();
  const [toggleOpen, setToggleOpen] = useState(false);
  const [toggleTarget, setToggleTarget] =
    useState<AdminMachineAccountRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<AdminMachineAccountRow | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [ADMIN_MACHINE_ACCOUNTS_QUERY_KEY],
    });

  const toggleMutation = useMutation({
    mutationFn: (input: { account: AdminMachineAccountRow; disabled: boolean }) =>
      apiFetch(toggleUrl(input.account), {
        method: "PATCH",
        body: { disabled: input.disabled },
      }),
    onSuccess: (_data, input) => {
      setToggleOpen(false);
      toastManager.add({
        type: "success",
        title: input.disabled ? t("toast.disabled") : t("toast.enabled"),
      });
    },
    onError: (error, input) => {
      setToggleOpen(false);
      toastManager.add({
        type: "error",
        title: input.disabled
          ? t("toast.disableError")
          : t("toast.enableError"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
    onSettled: () => {
      void refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) =>
      apiFetch(`/api/admin/machine-accounts/${accountId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setDeleteOpen(false);
      toastManager.add({ type: "success", title: t("toast.deleted") });
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
      void refresh();
    },
  });

  const enabling = toggleTarget?.disabledAt != null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead>{t("table.username")}</TableHead>
            <TableHead>{t("table.kind")}</TableHead>
            <TableHead>{t("table.repositories")}</TableHead>
            <TableHead>{t("table.permissions")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead>{t("table.expires")}</TableHead>
            <TableHead>{t("table.lastUsed")}</TableHead>
            <TableHead>{t("table.createdBy")}</TableHead>
            <TableHead>{t("table.createdAt")}</TableHead>
            <TableHead className="w-0">
              <span className="sr-only">{t("table.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell className="font-medium">{account.name}</TableCell>
              <TableCell>
                <code className="text-xs">{account.username}</code>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{t(`kind.${account.kind}`)}</Badge>
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-wrap gap-1">
                  {account.repositories.map((repository) => (
                    <Badge key={repository.id} variant="secondary">
                      {repository.name}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {account.allowPull ? (
                    <Badge variant="secondary">{t("permission.pull")}</Badge>
                  ) : null}
                  {account.allowPush ? (
                    <Badge variant="secondary">{t("permission.push")}</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    account.status === "active"
                      ? "success"
                      : account.status === "disabled"
                        ? "warning"
                        : "error"
                  }
                >
                  {t(`status.${account.status}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {account.expiresAt
                  ? formatDate(account.expiresAt)
                  : t("status.never")}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {account.lastUsedAt
                  ? formatDate(account.lastUsedAt)
                  : t("status.neverUsed")}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {account.createdBy?.name ?? t("deletedUser")}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(account.createdAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      account.disabledAt
                        ? t("enableAccount", { name: account.name })
                        : t("disableAccount", { name: account.name })
                    }
                    onClick={() => {
                      setToggleTarget(account);
                      setToggleOpen(true);
                    }}
                  >
                    {account.disabledAt ? (
                      <PowerIcon className="size-4" />
                    ) : (
                      <PowerOffIcon className="size-4" />
                    )}
                  </Button>
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
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        onOpenChangeComplete={(isOpen) => {
          if (!isOpen) {
            setToggleTarget(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {enabling
                ? t("enableDialog.title", { name: toggleTarget?.name ?? "" })
                : t("disableDialog.title", { name: toggleTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {enabling
                ? t("enableDialog.description", {
                    username: toggleTarget?.username ?? "",
                  })
                : t("disableDialog.description", {
                    username: toggleTarget?.username ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {tCommon("cancel")}
            </AlertDialogClose>
            <Button
              variant={enabling ? "default" : "destructive"}
              disabled={toggleMutation.isPending || !toggleTarget}
              data-loading={toggleMutation.isPending ? "" : undefined}
              onClick={() => {
                if (toggleTarget) {
                  toggleMutation.mutate({
                    account: toggleTarget,
                    disabled: !toggleTarget.disabledAt,
                  });
                }
              }}
            >
              {toggleMutation.isPending ? <Spinner /> : null}
              {enabling ? t("enableDialog.confirm") : t("disableDialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

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
