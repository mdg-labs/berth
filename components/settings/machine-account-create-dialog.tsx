// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api/client";
import { MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH } from "@/lib/machine-accounts/config";
import type { MachineAccountSummary } from "@/lib/machine-accounts/types";
import {
  isValidRepositoryName,
  normalizeRepositoryName,
} from "@/lib/repositories/validation";

type CreateMachineAccountResponse = {
  machineAccount: MachineAccountSummary;
  secret: string;
};

type MachineAccountCreateDialogProps = {
  repositoryId: string;
  policy: MachineAccountExpiryPolicy | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MachineAccountCreateDialog({
  repositoryId,
  policy,
  open,
  onOpenChange,
}: MachineAccountCreateDialogProps) {
  const t = useTranslations("settings.machineAccounts");
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowPull, setAllowPull] = useState(true);
  const [allowPush, setAllowPush] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryChoice>(() =>
    initialExpiryChoice(policy),
  );
  const [submitted, setSubmitted] = useState(false);

  // gcTime 0 drops the response, which carries the secret, from the mutation
  // cache as soon as the mutation is reset or the dialog unmounts.
  const createMutation = useMutation({
    gcTime: 0,
    mutationFn: (input: {
      name: string;
      description: string;
      allowPull: boolean;
      allowPush: boolean;
      expiresAt: string | null;
    }) =>
      apiFetch<CreateMachineAccountResponse>(
        `/api/repositories/${repositoryId}/machine-accounts`,
        { method: "POST", body: input },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["repository-machine-accounts", repositoryId],
      });
    },
  });

  const created = createMutation.data;
  const nameTaken =
    createMutation.error instanceof ApiError &&
    createMutation.error.status === 409;
  const normalizedName = normalizeRepositoryName(name);
  const nameInvalid = submitted && !isValidRepositoryName(normalizedName);
  const permissionMissing = submitted && !allowPull && !allowPush;

  function resetDialog() {
    createMutation.reset();
    setName("");
    setDescription("");
    setAllowPull(true);
    setAllowPush(false);
    setExpiry(initialExpiryChoice(policy));
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && createMutation.isPending) {
      return;
    }
    onOpenChange(next);
  }

  function renderCreated(result: CreateMachineAccountResponse) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("createdDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("createdDialog.description", {
              name: result.machineAccount.name,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <MachineAccountSecretPanel
            secret={result.secret}
            username={result.machineAccount.username}
          />
        </DialogPanel>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("createdDialog.done")}
          </Button>
        </DialogFooter>
      </>
    );
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
      disablePointerDismissal={created !== undefined}
    >
      <DialogPopup className="max-w-lg">
        {created ? (
          renderCreated(created)
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("createDialog.title")}</DialogTitle>
              <DialogDescription>
                {t("createDialog.description")}
              </DialogDescription>
            </DialogHeader>
            <Form
              className="contents"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
                if (
                  !isValidRepositoryName(normalizedName) ||
                  (!allowPull && !allowPush) ||
                  !isExpiryChoiceValid(expiry, policy)
                ) {
                  return;
                }
                createMutation.mutate({
                  name: normalizedName,
                  description,
                  allowPull,
                  allowPush,
                  expiresAt: expiryChoiceToTimestamp(expiry, policy),
                });
              }}
            >
              <DialogPanel className="space-y-4">
                {createMutation.isError && !nameTaken ? (
                  <ErrorAlert
                    title={t("createDialog.errorTitle")}
                    error={createMutation.error}
                    fallbackKey="request_failed"
                  />
                ) : null}
                <Field invalid={nameInvalid || nameTaken}>
                  <FieldLabel htmlFor={nameId}>
                    {t("createDialog.name")}
                  </FieldLabel>
                  <Input
                    id={nameId}
                    value={name}
                    maxLength={63}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (nameTaken) {
                        createMutation.reset();
                      }
                    }}
                  />
                  <FieldError match={nameInvalid}>
                    {t("createDialog.errors.nameInvalid")}
                  </FieldError>
                  <FieldError match={nameTaken}>
                    {t("createDialog.errors.nameTaken")}
                  </FieldError>
                  <FieldDescription>{t("createDialog.nameHint")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={descriptionId}>
                    {t("createDialog.descriptionLabel")}
                  </FieldLabel>
                  <Textarea
                    id={descriptionId}
                    value={description}
                    maxLength={MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <Fieldset className="flex flex-col gap-2">
                  <FieldsetLegend className="font-medium text-base/4.5 sm:text-sm/4">
                    {t("createDialog.permissions")}
                  </FieldsetLegend>
                  <div className="flex flex-wrap gap-4">
                    <Label className="flex items-center gap-2">
                      <Checkbox
                        checked={allowPull}
                        aria-invalid={permissionMissing || undefined}
                        onCheckedChange={(checked) =>
                          setAllowPull(checked === true)
                        }
                      />
                      {t("permission.pull")}
                    </Label>
                    <Label className="flex items-center gap-2">
                      <Checkbox
                        checked={allowPush}
                        aria-invalid={permissionMissing || undefined}
                        onCheckedChange={(checked) =>
                          setAllowPush(checked === true)
                        }
                      />
                      {t("permission.push")}
                    </Label>
                  </div>
                  {permissionMissing ? (
                    <p role="alert" className="text-destructive-foreground text-xs">
                      {t("createDialog.errors.permissionRequired")}
                    </p>
                  ) : null}
                </Fieldset>
                <MachineAccountExpiryField
                  choice={expiry}
                  onChange={setExpiry}
                  policy={policy}
                  showError={submitted}
                />
              </DialogPanel>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={createMutation.isPending}
                  onClick={() => onOpenChange(false)}
                >
                  {t("createDialog.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-loading={createMutation.isPending ? "" : undefined}
                >
                  {createMutation.isPending ? <Spinner /> : null}
                  {t("createDialog.submit")}
                </Button>
              </DialogFooter>
            </Form>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
