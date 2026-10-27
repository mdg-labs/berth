// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MachineAccountCreateDialog({
  repositoryId,
  open,
  onOpenChange,
}: MachineAccountCreateDialogProps) {
  const t = useTranslations("settings.machineAccounts");
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const secretId = useId();
  const commandId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowPull, setAllowPull] = useState(true);
  const [allowPush, setAllowPush] = useState(false);
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
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && createMutation.isPending) {
      return;
    }
    onOpenChange(next);
  }

  async function copyToClipboard(value: string, successTitle: string) {
    try {
      await navigator.clipboard.writeText(value);
      toastManager.add({ type: "success", title: successTitle });
    } catch {
      toastManager.add({
        type: "error",
        title: t("createdDialog.copyFailed"),
        description: t("createdDialog.copyFailedDescription"),
      });
    }
  }

  function renderCreated(result: CreateMachineAccountResponse) {
    const registryHost = window.location.host;
    const loginCommand = `echo '${result.secret}' | docker login ${registryHost} -u '${result.machineAccount.username}' --password-stdin`;

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
          <Alert variant="warning">
            <AlertTitle>{t("createdDialog.warningTitle")}</AlertTitle>
            <AlertDescription>
              {t("createdDialog.warningDescription")}
            </AlertDescription>
          </Alert>
          <Field className="w-full">
            <FieldLabel htmlFor={secretId}>
              {t("createdDialog.secret")}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={secretId}
                readOnly
                value={result.secret}
                className="font-mono text-xs"
              />
              <InputGroupAddon align="inline-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("createdDialog.copySecret")}
                  onClick={() =>
                    void copyToClipboard(
                      result.secret,
                      t("createdDialog.secretCopied"),
                    )
                  }
                >
                  <CopyIcon />
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field className="w-full">
            <FieldLabel htmlFor={commandId}>
              {t("createdDialog.command")}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={commandId}
                readOnly
                value={loginCommand}
                className="font-mono text-xs"
              />
              <InputGroupAddon align="inline-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("createdDialog.copyCommand")}
                  onClick={() =>
                    void copyToClipboard(
                      loginCommand,
                      t("createdDialog.commandCopied"),
                    )
                  }
                >
                  <CopyIcon />
                </Button>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {t("createdDialog.commandHint", {
                username: result.machineAccount.username,
              })}
            </FieldDescription>
          </Field>
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
                  (!allowPull && !allowPush)
                ) {
                  return;
                }
                createMutation.mutate({
                  name: normalizedName,
                  description,
                  allowPull,
                  allowPush,
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
