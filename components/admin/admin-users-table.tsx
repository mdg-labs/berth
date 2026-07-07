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
import { apiFetch, ApiError } from "@/lib/api/client";
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
  const tDeletion = useTranslations("common.deletion");
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
        title: "User reactivated",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Reactivate failed",
        description:
          error instanceof ApiError ? error.message : "Request failed",
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
        title: "User deleted",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Delete failed",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Auth</TableHead>
              <TableHead>Created</TableHead>
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
                    {user.systemRole}
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
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {user.hasPassword ? (
                    user.mustChangePassword ? (
                      <Badge variant="secondary">Password reset required</Badge>
                    ) : (
                      <Badge variant="secondary">Local</Badge>
                    )
                  ) : (
                    <Badge variant="secondary">OIDC</Badge>
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
                          aria-label={`Actions for ${user.name}`}
                        />
                      }
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuItem
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                      >
                        Edit
                      </MenuItem>
                      {user.status === "pending_deletion" ? (
                        <MenuItem
                          onClick={() => void reactivateMutation.mutate(user.id)}
                        >
                          Reactivate
                        </MenuItem>
                      ) : (
                        <MenuItem onClick={() => setDeleteTarget(user)}>
                          Delete
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
            <AlertDialogTitle>Delete {deleteTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              {immediateDelete
                ? "This action cannot be undone. Type the user email to confirm."
                : "The user will be signed out and scheduled for deletion."}
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
              Cancel
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
              Delete user
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
