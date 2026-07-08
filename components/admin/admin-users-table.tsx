// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { AdminInviteRow, AdminUserRow } from "@/components/admin/admin-users-page";
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
import { emailDeliveryToast } from "@/lib/email/delivery-feedback";
import type { EmailDeliveryStatus } from "@/lib/email/send";
import { formatApiError } from "@/lib/i18n/api-error";
import { formatDeletionCountdown } from "@/lib/users/presentation";
import { toastManager } from "@/components/ui/toast";

type AdminUsersTableProps = {
  users: AdminUserRow[];
  invites: AdminInviteRow[];
  deleteGracePeriodDays: number;
};

type DirectoryRow =
  | { kind: "user"; user: AdminUserRow; sortAt: string }
  | { kind: "invite"; invite: AdminInviteRow; sortAt: string };

export function AdminUsersTable({
  users,
  invites,
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

  const directoryRows = useMemo<DirectoryRow[]>(() => {
    const userRows: DirectoryRow[] = users.map((user) => ({
      kind: "user",
      user,
      sortAt: user.createdAt,
    }));
    const inviteRows: DirectoryRow[] = invites.map((invite) => ({
      kind: "invite",
      invite,
      sortAt: invite.invitedAt,
    }));

    return [...userRows, ...inviteRows].sort(
      (left, right) =>
        new Date(right.sortAt).getTime() - new Date(left.sortAt).getTime(),
    );
  }, [users, invites]);

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

  const resendInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch<{ emailStatus: EmailDeliveryStatus }>(
        `/api/admin/invites/${inviteId}/resend`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      const toast = emailDeliveryToast(data.emailStatus, {
        sent: {
          title: t("toast.inviteResent"),
          description: t("toast.inviteResent"),
        },
        not_configured: {
          title: t("toast.inviteResentNoSmtp"),
          description: t("toast.inviteResentNoSmtpDescription"),
        },
        failed: {
          title: t("toast.inviteResendFailed"),
          description: t("toast.inviteResendFailedDescription"),
        },
      });
      toastManager.add(toast);
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.inviteResendError"),
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
            {directoryRows.map((row) =>
              row.kind === "user" ? (
                <TableRow key={`user-${row.user.id}`}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/users/${row.user.id}`}
                      className="hover:text-primary"
                    >
                      {row.user.name}
                    </Link>
                  </TableCell>
                  <TableCell>{row.user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.user.systemRole === "admin" ? "default" : "secondary"
                      }
                    >
                      {tRoles(row.user.systemRole)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.user.status === "pending_deletion" ? (
                      <Badge variant="destructive">
                        {formatDeletionCountdown(row.user.purgesAt, (key, values) =>
                          tDeletion(key, values),
                        )}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("status.active")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.user.hasPassword ? (
                      row.user.mustChangePassword ? (
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
                    {new Date(row.user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("actions.aria", { name: row.user.name })}
                          />
                        }
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem
                          onClick={() => router.push(`/admin/users/${row.user.id}`)}
                        >
                          {t("actions.edit")}
                        </MenuItem>
                        {row.user.status === "pending_deletion" ? (
                          <MenuItem
                            onClick={() => void reactivateMutation.mutate(row.user.id)}
                          >
                            {t("actions.reactivate")}
                          </MenuItem>
                        ) : (
                          <MenuItem onClick={() => setDeleteTarget(row.user)}>
                            {t("actions.delete")}
                          </MenuItem>
                        )}
                      </MenuPopup>
                    </Menu>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={`invite-${row.invite.id}`}>
                  <TableCell className="font-medium">{row.invite.name}</TableCell>
                  <TableCell>{row.invite.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.invite.systemRole === "admin" ? "default" : "secondary"
                      }
                    >
                      {tRoles(row.invite.systemRole)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">
                        {t("status.pendingInvitation")}
                      </Badge>
                      {row.invite.expired ? (
                        <Badge variant="secondary">
                          {t("status.expiredInvitation")}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t("auth.invitation")}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.invite.invitedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("actions.aria", { name: row.invite.name })}
                          />
                        }
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem
                          onClick={() =>
                            void resendInviteMutation.mutate(row.invite.id)
                          }
                          disabled={resendInviteMutation.isPending}
                        >
                          {t("actions.resendInvitation")}
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </TableCell>
                </TableRow>
              ),
            )}
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
