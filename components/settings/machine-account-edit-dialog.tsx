// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

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
import { MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH } from "@/lib/machine-accounts/config";
import type { MachineAccountSummary } from "@/lib/machine-accounts/types";

type MachineAccountEditDialogProps = {
  repositoryId: string;
  account: MachineAccountSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MachineAccountEditDialog({
  repositoryId,
  account,
  open,
  onOpenChange,
}: MachineAccountEditDialogProps) {
  const t = useTranslations("settings.machineAccounts");
  const queryClient = useQueryClient();
  const descriptionId = useId();
  const [description, setDescription] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (input: { accountId: string; description: string }) =>
      apiFetch(
        `/api/repositories/${repositoryId}/machine-accounts/${input.accountId}`,
        { method: "PATCH", body: { description: input.description } },
      ),
    onSuccess: () => {
      onOpenChange(false);
      toastManager.add({ type: "success", title: t("toast.updated") });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["repository-machine-accounts", repositoryId],
      });
    },
  });

  const value = description ?? account?.description ?? "";

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
        }
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("editDialog.title", { name: account?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>
        <Form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (account) {
              updateMutation.mutate({ accountId: account.id, description: value });
            }
          }}
        >
          <DialogPanel className="space-y-4">
            {updateMutation.isError ? (
              <ErrorAlert
                title={t("editDialog.errorTitle")}
                error={updateMutation.error}
                fallbackKey="request_failed"
              />
            ) : null}
            <Field>
              <FieldLabel htmlFor={descriptionId}>
                {t("createDialog.descriptionLabel")}
              </FieldLabel>
              <Textarea
                id={descriptionId}
                value={value}
                maxLength={MACHINE_ACCOUNT_DESCRIPTION_MAX_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              {t("editDialog.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending || !account}
              data-loading={updateMutation.isPending ? "" : undefined}
            >
              {updateMutation.isPending ? <Spinner /> : null}
              {t("editDialog.submit")}
            </Button>
          </DialogFooter>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}
