// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { apiFetch } from "@/lib/api/client";
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
import { formatApiError } from "@/lib/i18n/api-error";
import type { EmailDeliveryStatus } from "@/lib/email/send";
import { emailDeliveryToast } from "@/lib/email/delivery-feedback";
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
  const t = useTranslations("admin.userDetail");
  const tUsers = useTranslations("admin.users");
  const tTable = useTranslations("admin.usersTable");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles.system");
  const tDeletion = useTranslations("common.deletion");
  const tErrors = useTranslations("errorsApi");
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
        title: t("toast.updated"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.updateFailed"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const sendResetEmailMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ emailStatus: EmailDeliveryStatus }>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: { sendResetEmail: true },
      }),
    onSuccess: (response) => {
      const toast = emailDeliveryToast(response.emailStatus, {
        sent: {
          title: t("toast.resetEmailSent"),
          description: t("toast.resetEmailSentDescription", {
            email: user?.email ?? "",
          }),
        },
        not_configured: {
          title: t("toast.smtpNotConfigured"),
          description: t("toast.smtpNotConfiguredDescription"),
        },
        failed: {
          title: t("toast.resetEmailFailed"),
          description: t("toast.resetEmailFailedDescription"),
        },
      });
      toastManager.add(toast);
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.resetEmailFailed"),
        description: formatApiError(tErrors, error, "request_failed"),
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
        title: t("toast.deleted"),
      });
      router.replace("/admin");
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.deleteFailed"),
        description: formatApiError(tErrors, error, "request_failed"),
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

  if (userQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (userQuery.isError || !user) {
    return (
      <ErrorAlert
        title={t("notFound.title")}
        message={t("notFound.description")}
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
          {tUsers("backToUsers")}
        </Button>
      </div>

      {user.status === "pending_deletion" ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>{t("pendingDeletion.title")}</CardTitle>
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
              {t("pendingDeletion.reactivateButton")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("identity.title")}</CardTitle>
          <CardDescription>{t("identity.description")}</CardDescription>
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
              <FieldLabel htmlFor="admin-user-name">
                {t("identity.nameLabel")}
              </FieldLabel>
              <Input
                id="admin-user-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-user-email">
                {t("identity.emailLabel")}
              </FieldLabel>
              <Input
                id="admin-user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Fieldset>
              <FieldsetLegend>{t("identity.systemRoleLegend")}</FieldsetLegend>
              <RadioGroup
                value={systemRole}
                onValueChange={(value) =>
                  setSystemRole(value as "admin" | "user")
                }
              >
                <Label className="flex items-center gap-2">
                  <Radio value="user" />
                  {tRoles("user")}
                </Label>
                <Label className="flex items-center gap-2">
                  <Radio value="admin" />
                  {tRoles("admin")}
                </Label>
              </RadioGroup>
            </Fieldset>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-loading={updateMutation.isPending ? "" : undefined}
            >
              {updateMutation.isPending ? <Spinner /> : null}
              {t("identity.saveChanges")}
            </Button>
          </Form>
        </CardContent>
      </Card>

      {user.hasPassword ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("security.title")}</CardTitle>
            <CardDescription>{t("security.passwordDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="admin-user-password">
                {t("security.newPasswordLabel")}
              </FieldLabel>
              <Input
                id="admin-user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <FieldDescription>{t("security.blankPasswordHint")}</FieldDescription>
            </Field>
            <Button
              type="button"
              variant="outline"
              onClick={() => void sendResetEmailMutation.mutate()}
              disabled={sendResetEmailMutation.isPending}
            >
              {sendResetEmailMutation.isPending ? <Spinner /> : null}
              {t("security.emailResetLink")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("security.title")}</CardTitle>
            <CardDescription>
              <Badge variant="secondary">{tTable("auth.oidc")}</Badge>{" "}
              {t("security.oidcDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {canDelete ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>{t("dangerZone.title")}</CardTitle>
            <CardDescription>
              {immediateDelete
                ? t("dangerZone.immediateDescription")
                : t("dangerZone.graceDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              {t("dangerZone.deleteButton")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteDialog.title", { email: user.email })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {immediateDelete
                ? t("deleteDialog.immediateDescription")
                : t("deleteDialog.graceDescription")}
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
              {tCommon("actions.cancel")}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={
                deleteMutation.isPending ||
                (immediateDelete && deleteConfirmEmail !== user.email)
              }
              onClick={() => void deleteMutation.mutate()}
            >
              {t("deleteDialog.confirmButton")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
