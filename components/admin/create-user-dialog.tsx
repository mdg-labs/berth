// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { AdminUserRow } from "@/components/admin/admin-users-page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";
import { toastManager } from "@/components/ui/toast";

type CreateUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

type CreateUserResponse = {
  user: AdminUserRow;
  emailSent?: boolean;
};

function resetFormState(
  setEmail: (value: string) => void,
  setName: (value: string) => void,
  setPassword: (value: string) => void,
  setSystemRole: (value: "admin" | "user") => void,
) {
  setEmail("");
  setName("");
  setPassword("");
  setSystemRole("user");
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateUserDialogProps) {
  const t = useTranslations("admin.createUser");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles.system");
  const tErrors = useTranslations("errorsApi");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [systemRole, setSystemRole] = useState<"admin" | "user">("user");

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreateUserResponse>("/api/admin/users", {
        method: "POST",
        body: {
          email,
          name,
          password: password.trim() || undefined,
          systemRole,
        },
      }),
    onSuccess: (data) => {
      const hadPassword = Boolean(password.trim());
      toastManager.add({
        type: "success",
        title: t("toast.success"),
        description: hadPassword
          ? t("toast.withPassword", { email })
          : data.emailSent
            ? t("toast.setPasswordEmail", { email })
            : t("toast.mustChangePassword", { email }),
      });
      resetFormState(setEmail, setName, setPassword, setSystemRole);
      onOpenChange(false);
      onCreated();
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.error"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next && !createMutation.isPending) {
      resetFormState(setEmail, setName, setPassword, setSystemRole);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="space-y-4 px-6 pb-2">
            <Fieldset className="space-y-4">
              <FieldsetLegend className="sr-only">
                {t("fieldsetLegend")}
              </FieldsetLegend>
              <Field>
                <FieldLabel htmlFor="create-user-email">{t("emailLabel")}</FieldLabel>
                <Input
                  id="create-user-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-user-name">{t("nameLabel")}</FieldLabel>
                <Input
                  id="create-user-name"
                  name="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-user-password">
                  {t("passwordLabel")}
                </FieldLabel>
                <Input
                  id="create-user-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <FieldDescription>{t("passwordHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("systemRoleLabel")}</FieldLabel>
                <RadioGroup
                  value={systemRole}
                  onValueChange={(value) =>
                    setSystemRole(value as "admin" | "user")
                  }
                  className="gap-2"
                >
                  <Label className="flex items-center gap-2 font-normal">
                    <Radio value="user" />
                    {tRoles("user")}
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <Radio value="admin" />
                    {tRoles("admin")}
                  </Label>
                </RadioGroup>
              </Field>
            </Fieldset>
          </div>
          <DialogFooter variant="bare">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-loading={createMutation.isPending ? "" : undefined}
            >
              {createMutation.isPending ? <Spinner /> : null}
              {t("submit")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}
