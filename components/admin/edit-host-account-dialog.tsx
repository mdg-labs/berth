// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import {
  HostAccountRepositoryPicker,
  hostAccountRepositoryError,
} from "@/components/admin/host-account-repository-picker";
import type { AdminMachineAccountRow } from "@/components/admin/admin-machine-accounts-page";
import { ErrorAlert } from "@/components/catalog/error-alert";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { useRepositoriesList } from "@/lib/hooks/use-repository";
import { MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH } from "@/lib/machine-accounts/config";

type EditHostAccountDialogProps = {
  account: AdminMachineAccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled: () => void;
};

export function EditHostAccountDialog({
  account,
  open,
  onOpenChange,
  onSettled,
}: EditHostAccountDialogProps) {
  const t = useTranslations("admin.machineAccounts");
  const descriptionId = useId();
  const repositoriesQuery = useRepositoriesList();
  const [description, setDescription] = useState<string | null>(null);
  const [repositoryIds, setRepositoryIds] = useState<string[] | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (input: {
      accountId: string;
      description: string;
      repositoryIds: string[];
    }) =>
      apiFetch(`/api/admin/machine-accounts/${input.accountId}`, {
        method: "PATCH",
        body: {
          description: input.description,
          repositoryIds: input.repositoryIds,
        },
      }),
    onSuccess: () => {
      onOpenChange(false);
      toastManager.add({ type: "success", title: t("toast.updated") });
    },
    onSettled,
  });

  const descriptionValue = description ?? account?.description ?? "";
  const selectedIds =
    repositoryIds ?? account?.repositories.map((entry) => entry.id) ?? [];

  const options = new Map<string, { id: string; name: string }>();
  for (const repository of repositoriesQuery.data?.repositories ?? []) {
    options.set(repository.id, { id: repository.id, name: repository.name });
  }
  for (const repository of account?.repositories ?? []) {
    options.set(repository.id, repository);
  }
  const repositories = [...options.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && updateMutation.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          updateMutation.reset();
          setDescription(null);
          setRepositoryIds(null);
          setSubmitted(false);
        }
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("hostEdit.title", { name: account?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("hostEdit.description")}</DialogDescription>
        </DialogHeader>
        <Form
          className="contents"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (!account || hostAccountRepositoryError(selectedIds) !== null) {
              return;
            }
            updateMutation.mutate({
              accountId: account.id,
              description: descriptionValue,
              repositoryIds: selectedIds,
            });
          }}
        >
          <DialogPanel className="space-y-4">
            {updateMutation.isError ? (
              <ErrorAlert
                title={t("hostEdit.errorTitle")}
                error={updateMutation.error}
                fallbackKey="request_failed"
              />
            ) : null}
            <Field>
              <FieldLabel htmlFor={descriptionId}>
                {t("hostForm.description")}
              </FieldLabel>
              <Textarea
                id={descriptionId}
                value={descriptionValue}
                maxLength={MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
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
                selectedIds={selectedIds}
                onChange={setRepositoryIds}
                showError={submitted}
              />
            )}
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("hostForm.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                updateMutation.isPending ||
                !account ||
                repositoriesQuery.isLoading
              }
              data-loading={updateMutation.isPending ? "" : undefined}
            >
              {updateMutation.isPending ? <Spinner /> : null}
              {t("hostEdit.submit")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}
