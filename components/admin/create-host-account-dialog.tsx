// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import {
  HostAccountRepositoryPicker,
  hostAccountRepositoryError,
} from "@/components/admin/host-account-repository-picker";
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
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useRepositoriesList } from "@/lib/hooks/use-repository";
import { MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH } from "@/lib/machine-accounts/config";
import type { MachineAccountSummary } from "@/lib/machine-accounts/types";
import {
  isValidRepositoryName,
  normalizeRepositoryName,
} from "@/lib/repositories/validation";

type CreateHostAccountResponse = {
  machineAccount: MachineAccountSummary;
  secret: string;
};

type CreateHostAccountDialogProps = {
  policy: MachineAccountExpiryPolicy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function CreateHostAccountDialog({
  policy,
  open,
  onOpenChange,
  onCreated,
}: CreateHostAccountDialogProps) {
  const t = useTranslations("admin.machineAccounts");
  const nameId = useId();
  const descriptionId = useId();
  const repositoriesQuery = useRepositoriesList();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repositoryIds, setRepositoryIds] = useState<string[]>([]);
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
      repositoryIds: string[];
      expiresAt: string | null;
    }) =>
      apiFetch<CreateHostAccountResponse>("/api/admin/machine-accounts", {
        method: "POST",
        body: input,
      }),
    onSuccess: onCreated,
  });

  const created = createMutation.data;
  const nameTaken =
    createMutation.error instanceof ApiError &&
    createMutation.error.status === 409;
  const normalizedName = normalizeRepositoryName(name);
  const nameInvalid = submitted && !isValidRepositoryName(normalizedName);
  const repositories = repositoriesQuery.data?.repositories ?? [];

  function resetDialog() {
    createMutation.reset();
    setName("");
    setDescription("");
    setRepositoryIds([]);
    setExpiry(initialExpiryChoice(policy));
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next && createMutation.isPending) {
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
      disablePointerDismissal={created !== undefined}
    >
      <DialogPopup className="max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("hostCreated.title")}</DialogTitle>
              <DialogDescription>
                {t("hostCreated.description", {
                  name: created.machineAccount.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-4">
              <MachineAccountSecretPanel
                secret={created.secret}
                username={created.machineAccount.username}
              />
            </DialogPanel>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("hostCreated.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("hostCreate.title")}</DialogTitle>
              <DialogDescription>{t("hostCreate.description")}</DialogDescription>
            </DialogHeader>
            <Form
              className="contents"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
                if (
                  !isValidRepositoryName(normalizedName) ||
                  hostAccountRepositoryError(repositoryIds) !== null ||
                  !isExpiryChoiceValid(expiry, policy)
                ) {
                  return;
                }
                createMutation.mutate({
                  name: normalizedName,
                  description,
                  repositoryIds,
                  expiresAt: expiryChoiceToTimestamp(expiry, policy),
                });
              }}
            >
              <DialogPanel className="space-y-4">
                {createMutation.isError && !nameTaken ? (
                  <ErrorAlert
                    title={t("hostCreate.errorTitle")}
                    error={createMutation.error}
                    fallbackKey="request_failed"
                  />
                ) : null}
                <Field invalid={nameInvalid || nameTaken}>
                  <FieldLabel htmlFor={nameId}>{t("hostForm.name")}</FieldLabel>
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
                    {t("hostForm.errors.nameInvalid")}
                  </FieldError>
                  <FieldError match={nameTaken}>
                    {t("hostForm.errors.nameTaken")}
                  </FieldError>
                  <FieldDescription>{t("hostForm.nameHint")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={descriptionId}>
                    {t("hostForm.description")}
                  </FieldLabel>
                  <Textarea
                    id={descriptionId}
                    value={description}
                    maxLength={MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <p className="text-muted-foreground text-sm">
                  {t("hostForm.pullOnly")}
                </p>
                {repositoriesQuery.isError ? (
                  <ErrorAlert
                    title={t("hostForm.repositoriesError")}
                    error={repositoriesQuery.error}
                    fallbackKey="request_failed"
                    onRetry={() => void repositoriesQuery.refetch()}
                  />
                ) : (
                  <HostAccountRepositoryPicker
                    repositories={repositories}
                    selectedIds={repositoryIds}
                    onChange={setRepositoryIds}
                    showError={submitted}
                  />
                )}
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
                  {t("hostForm.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || repositoriesQuery.isLoading
                  }
                  data-loading={createMutation.isPending ? "" : undefined}
                >
                  {createMutation.isPending ? <Spinner /> : null}
                  {t("hostCreate.submit")}
                </Button>
              </DialogFooter>
            </Form>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
