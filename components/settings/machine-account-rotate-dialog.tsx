// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import {
  type ExpiryChoice,
  expiryChoiceToTimestamp,
  initialExpiryChoice,
  isExpiryChoiceValid,
  MachineAccountExpiryField,
  type MachineAccountExpiryPolicy,
} from "@/components/settings/machine-account-expiry";
import { MachineAccountSecretPanel } from "@/components/settings/machine-account-secret-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import type { MachineAccountSummary } from "@/lib/machine-accounts/types";

type RotateMachineAccountResponse = {
  machineAccount: MachineAccountSummary;
  secret: string;
};

type MachineAccountRotateDialogProps = {
  // null rotates through the system-admin route, which covers both kinds.
  repositoryId: string | null;
  account: MachineAccountSummary | null;
  policy: MachineAccountExpiryPolicy | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled?: () => void;
};

export function MachineAccountRotateDialog({
  repositoryId,
  account,
  policy,
  open,
  onOpenChange,
  onSettled,
}: MachineAccountRotateDialogProps) {
  const t = useTranslations("settings.machineAccounts");
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"keep" | "new">("keep");
  const [expiry, setExpiry] = useState<ExpiryChoice>(() =>
    initialExpiryChoice(policy),
  );
  const [submitted, setSubmitted] = useState(false);

  // gcTime 0 drops the response, which carries the secret, from the mutation
  // cache as soon as the mutation is reset or the dialog unmounts.
  const rotateMutation = useMutation({
    gcTime: 0,
    mutationFn: (input: { accountId: string; expiresAt?: string | null }) =>
      apiFetch<RotateMachineAccountResponse>(
        repositoryId === null
          ? `/api/admin/machine-accounts/${input.accountId}/rotate`
          : `/api/repositories/${repositoryId}/machine-accounts/${input.accountId}/rotate`,
        {
          method: "POST",
          body:
            input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt },
        },
      ),
    onSettled: () => {
      if (repositoryId !== null) {
        void queryClient.invalidateQueries({
          queryKey: ["repository-machine-accounts", repositoryId],
        });
      }
      onSettled?.();
    },
  });

  const rotated = rotateMutation.data;
  const expired =
    account?.expiresAt != null &&
    new Date(account.expiresAt).getTime() <= Date.now();
  const effectiveMode = expired ? "new" : mode;

  function resetDialog() {
    rotateMutation.reset();
    setMode("keep");
    setExpiry(initialExpiryChoice(policy));
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && rotateMutation.isPending) {
      return;
    }
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          resetDialog();
        }
      }}
      disablePointerDismissal={rotated !== undefined}
    >
      <DialogPopup className="max-w-lg">
        {rotated ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("rotateDialog.doneTitle")}</DialogTitle>
              <DialogDescription>
                {t("rotateDialog.doneDescription", {
                  name: rotated.machineAccount.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-4">
              <MachineAccountSecretPanel
                secret={rotated.secret}
                username={rotated.machineAccount.username}
              />
            </DialogPanel>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("createdDialog.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("rotateDialog.title", { name: account?.name ?? "" })}
              </DialogTitle>
              <DialogDescription>
                {t("rotateDialog.description", {
                  username: account?.username ?? "",
                })}
              </DialogDescription>
            </DialogHeader>
            <Form
              className="contents"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!account) {
                  return;
                }
                setSubmitted(true);
                if (effectiveMode === "keep") {
                  rotateMutation.mutate({ accountId: account.id });
                  return;
                }
                if (!isExpiryChoiceValid(expiry, policy)) {
                  return;
                }
                rotateMutation.mutate({
                  accountId: account.id,
                  expiresAt: expiryChoiceToTimestamp(expiry, policy),
                });
              }}
            >
              <DialogPanel className="space-y-4">
                {rotateMutation.isError ? (
                  <ErrorAlert
                    title={t("rotateDialog.errorTitle")}
                    error={rotateMutation.error}
                    fallbackKey="request_failed"
                  />
                ) : null}
                <Alert variant="warning">
                  <AlertDescription>{t("rotateDialog.warning")}</AlertDescription>
                </Alert>
                <Field>
                  <FieldLabel>{t("rotateDialog.expiryMode")}</FieldLabel>
                  <RadioGroup
                    value={effectiveMode}
                    onValueChange={(value) => setMode(value as "keep" | "new")}
                  >
                    <Label className="flex items-center gap-2">
                      <Radio value="keep" disabled={expired} />
                      {account?.expiresAt
                        ? t("rotateDialog.keepExpiry", {
                            date: new Date(account.expiresAt).toLocaleDateString(),
                          })
                        : t("rotateDialog.keepNoExpiry")}
                    </Label>
                    <Label className="flex items-center gap-2">
                      <Radio value="new" />
                      {t("rotateDialog.newExpiry")}
                    </Label>
                  </RadioGroup>
                  {expired ? (
                    <p className="text-muted-foreground text-xs">
                      {t("rotateDialog.expiredHint")}
                    </p>
                  ) : null}
                </Field>
                {effectiveMode === "new" ? (
                  <MachineAccountExpiryField
                    choice={expiry}
                    onChange={setExpiry}
                    policy={policy}
                    showError={submitted}
                  />
                ) : null}
              </DialogPanel>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={rotateMutation.isPending}
                  onClick={() => onOpenChange(false)}
                >
                  {t("rotateDialog.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={rotateMutation.isPending || !account}
                  data-loading={rotateMutation.isPending ? "" : undefined}
                >
                  {rotateMutation.isPending ? <Spinner /> : null}
                  {t("rotateDialog.submit")}
                </Button>
              </DialogFooter>
            </Form>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
