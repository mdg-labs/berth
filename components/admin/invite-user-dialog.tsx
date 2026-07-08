// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import type { EmailDeliveryStatus } from "@/lib/email/send";
import { emailDeliveryToast } from "@/lib/email/delivery-feedback";
import { formatApiError } from "@/lib/i18n/api-error";
import { toastManager } from "@/components/ui/toast";

type InviteUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
};

type InviteResponse = {
  invite: {
    id: string;
    email: string;
    name: string;
  };
  emailStatus: EmailDeliveryStatus;
};

function resetFormState(
  setEmail: (value: string) => void,
  setName: (value: string) => void,
  setSystemRole: (value: "admin" | "user") => void,
) {
  setEmail("");
  setName("");
  setSystemRole("user");
}

export function InviteUserDialog({
  open,
  onOpenChange,
  onInvited,
}: InviteUserDialogProps) {
  const t = useTranslations("admin.inviteUser");
  const tCommon = useTranslations("common");
  const tRoles = useTranslations("roles.system");
  const tErrors = useTranslations("errorsApi");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [systemRole, setSystemRole] = useState<"admin" | "user">("user");

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiFetch<InviteResponse>("/api/admin/invites", {
        method: "POST",
        body: {
          email,
          name,
          systemRole,
        },
      }),
    onSuccess: (data) => {
      const toast = emailDeliveryToast(data.emailStatus, {
        sent: {
          title: t("toast.success"),
          description: t("toast.emailSent", { email }),
        },
        not_configured: {
          title: t("toast.noSmtp"),
          description: t("toast.noSmtpDescription", { email }),
        },
        failed: {
          title: t("toast.emailFailed"),
          description: t("toast.emailFailedDescription", { email }),
        },
      });
      toastManager.add(toast);
      resetFormState(setEmail, setName, setSystemRole);
      onOpenChange(false);
      onInvited();
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
    if (!next && !inviteMutation.isPending) {
      resetFormState(setEmail, setName, setSystemRole);
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
            inviteMutation.mutate();
          }}
        >
          <div className="space-y-4 px-6 pb-2">
            <Fieldset className="space-y-4">
              <FieldsetLegend className="sr-only">
                {t("fieldsetLegend")}
              </FieldsetLegend>
              <Field>
                <FieldLabel htmlFor="invite-user-email">{t("emailLabel")}</FieldLabel>
                <Input
                  id="invite-user-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-user-name">{t("nameLabel")}</FieldLabel>
                <Input
                  id="invite-user-name"
                  name="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
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
              disabled={inviteMutation.isPending}
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              data-loading={inviteMutation.isPending ? "" : undefined}
            >
              {inviteMutation.isPending ? <Spinner /> : null}
              {t("submit")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}
