// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";
import { toastManager } from "@/components/ui/toast";

type RepositoryVisibilitySectionProps = {
  repositoryId: string;
  isPublic: boolean;
};

export function RepositoryVisibilitySection({
  repositoryId,
  isPublic,
}: RepositoryVisibilitySectionProps) {
  const t = useTranslations("settings.visibility");
  const tErrors = useTranslations("errorsApi");
  const queryClient = useQueryClient();
  const switchId = useId();

  const visibilityMutation = useMutation({
    mutationFn: (anonymousPullDefault: boolean) =>
      apiFetch(`/api/repositories/${repositoryId}/settings`, {
        method: "PATCH",
        body: { anonymousPullDefault },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repositories"] });
      toastManager.add({
        type: "success",
        title: t("toast.success"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.error"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Field className="flex-1">
            <FieldLabel htmlFor={switchId}>{t("label")}</FieldLabel>
            <FieldDescription>{t("fieldDescription")}</FieldDescription>
          </Field>
          <Switch
            id={switchId}
            checked={isPublic}
            disabled={visibilityMutation.isPending}
            onCheckedChange={(checked) => visibilityMutation.mutate(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
