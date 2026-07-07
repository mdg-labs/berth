// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { AdminUserRow } from "@/components/admin/admin-users-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";
import { formatDeletionCountdown } from "@/lib/users/presentation";
import { toastManager } from "@/components/ui/toast";

type AdminUsersTableProps = {
  users: AdminUserRow[];
  deleteGracePeriodDays: number;
};

export function AdminUsersTable({
  users,
  deleteGracePeriodDays,
}: AdminUsersTableProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("admin.usersTable");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles.system");
  const tDeletion = useTranslations("common.deletion");
  const tErrors = useTranslations("errorsApi");
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");

  const immediateDelete = deleteGracePeriodDays === 0;

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/admin/users/${userId}/reactivate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toastManager.add({
        type: "success",
        title: t("toast.reactivated"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.reactivateFailed"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteTarget(null);
      setDeleteConfirmEmail("");
      toastManager.add({
        type: "success",
        title: t("toast.deleted"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.deleteFailed"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.email")}</TableHead>
              <TableHead>{t("columns.role")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.auth")}</TableHead>
              <TableHead>{t("columns.created")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="hover:text-primary"
                  >
                    {user.name}
                  </Link>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={user.systemRole === "admin" ? "default" : "secondary"}
                  >
                    {tRoles(user.systemRole)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.status === "pending_deletion" ? (
                    <Badge variant="destructive">
                      {formatDeletionCountdown(user.purgesAt, (key, values) =>
                        tDeletion(key, values),
                      )}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t("status.active")}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {user.hasPassword ? (
                    user.mustChangePassword ? (
                      <Badge variant="secondary">
                        {t("auth.passwordResetRequired")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("auth.local")}</Badge>
                    )
                  ) : (
                    <Badge variant="secondary">{t("auth.oidc")}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Menu>
                    <MenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("actions.aria", { name: user.name })}
                        />
                      }
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuItem
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                      >
                        {t("actions.edit")}
                      </MenuItem>
                      {user.status === "pending_deletion" ? (
                        <MenuItem
                          onClick={() => void reactivateMutation.mutate(user.id)}
                        >
                          {t("actions.reactivate")}
                        </MenuItem>
                      ) : (
                        <MenuItem onClick={() => setDeleteTarget(user)}>
                          {t("actions.delete")}
                        </MenuItem>
                      )}
                    </MenuPopup>
                  </Menu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmEmail("");
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteDialog.title", { email: deleteTarget?.email ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {immediateDelete
                ? t("deleteDialog.immediateDescription")
                : t("deleteDialog.graceDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {immediateDelete && deleteTarget ? (
            <Input
              placeholder={deleteTarget.email}
              value={deleteConfirmEmail}
              onChange={(event) => setDeleteConfirmEmail(event.target.value)}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {tCommon("actions.cancel")}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={
                deleteMutation.isPending ||
                !deleteTarget ||
                (immediateDelete && deleteConfirmEmail !== deleteTarget.email)
              }
              onClick={() => {
                if (deleteTarget) {
                  void deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {t("deleteDialog.confirmButton")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
