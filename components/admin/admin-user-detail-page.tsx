// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { AdminUserRow } from "@/components/admin/admin-users-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDeletionCountdown } from "@/lib/users/presentation";
import { toastManager } from "@/components/ui/toast";

type UserResponse = {
  user: AdminUserRow;
  meta: { deleteGracePeriodDays: number };
};

type AdminUserDetailPageProps = {
  userId: string;
};

export function AdminUserDetailPage({ userId }: AdminUserDetailPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tDeletion = useTranslations("common.deletion");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");

  const userQuery = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => apiFetch<UserResponse>(`/api/admin/users/${userId}`),
  });

  const user = userQuery.data?.user;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [systemRole, setSystemRole] = useState<"admin" | "user">("user");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setSystemRole(user.systemRole);
      setPassword("");
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch<UserResponse & { emailSent?: boolean }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: {
          name,
          email,
          systemRole,
          password: password.trim() || undefined,
        },
      }),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.setQueryData(["admin-user", userId], response);
      toastManager.add({
        type: "success",
        title: "User updated",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Update failed",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  const sendResetEmailMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ emailSent: boolean }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: { sendResetEmail: true },
      }),
    onSuccess: (response) => {
      toastManager.add({
        type: "success",
        title: response.emailSent ? "Reset email sent" : "SMTP not configured",
        description: response.emailSent
          ? `A password reset link was sent to ${user?.email}.`
          : "Configure SMTP to send password reset emails.",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to send reset email",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toastManager.add({
        type: "success",
        title: "User deleted",
      });
      router.replace("/admin");
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

  const reactivateMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/users/${userId}/reactivate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void userQuery.refetch();
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

  if (userQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (userQuery.isError || !user) {
    return (
      <ErrorAlert
        title="User not found"
        message="This user may have been deleted."
        onRetry={() => void userQuery.refetch()}
      />
    );
  }

  const immediateDelete = userQuery.data?.meta.deleteGracePeriodDays === 0;
  const canDelete =
    user.status === "active" || user.status === "pending_deletion";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Button variant="outline" render={<Link href="/admin" />}>
          Back to users
        </Button>
      </div>

      {user.status === "pending_deletion" ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Pending deletion</CardTitle>
            <CardDescription>
              {formatDeletionCountdown(user.purgesAt, (key, values) =>
                tDeletion(key, values),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => void reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
            >
              Reactivate user
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Update account details and system role.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              updateMutation.mutate();
            }}
          >
            <Field>
              <FieldLabel htmlFor="admin-user-name">Name</FieldLabel>
              <Input
                id="admin-user-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-user-email">Email</FieldLabel>
              <Input
                id="admin-user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Fieldset>
              <FieldsetLegend>System role</FieldsetLegend>
              <RadioGroup
                value={systemRole}
                onValueChange={(value) =>
                  setSystemRole(value as "admin" | "user")
                }
              >
                <Label className="flex items-center gap-2">
                  <Radio value="user" />
                  User
                </Label>
                <Label className="flex items-center gap-2">
                  <Radio value="admin" />
                  Admin
                </Label>
              </RadioGroup>
            </Fieldset>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-loading={updateMutation.isPending ? "" : undefined}
            >
              {updateMutation.isPending ? <Spinner /> : null}
              Save changes
            </Button>
          </Form>
        </CardContent>
      </Card>

      {user.hasPassword ? (
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              Reset the local password. Leave blank to generate a temporary one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="admin-user-password">New password</FieldLabel>
              <Input
                id="admin-user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <FieldDescription>
                Blank password forces a change on next login.
              </FieldDescription>
            </Field>
            <Button
              type="button"
              variant="outline"
              onClick={() => void sendResetEmailMutation.mutate()}
              disabled={sendResetEmailMutation.isPending}
            >
              {sendResetEmailMutation.isPending ? <Spinner /> : null}
              Email reset link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              <Badge variant="secondary">OIDC</Badge> This account authenticates
              via OIDC.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {canDelete ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
            <CardDescription>
              {immediateDelete
                ? "This will permanently delete the user immediately."
                : "This schedules the user for deletion after the grace period."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete user
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              {immediateDelete
                ? "This action cannot be undone. Type the user email to confirm."
                : "The user will be signed out and scheduled for deletion."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {immediateDelete ? (
            <Input
              placeholder={user.email}
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
                (immediateDelete && deleteConfirmEmail !== user.email)
              }
              onClick={() => void deleteMutation.mutate()}
            >
              Delete user
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
