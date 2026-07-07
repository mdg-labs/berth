// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useAuthUser } from "@/components/providers/auth-guard";
import { apiFetch } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toastManager } from "@/components/ui/toast";
import { formatApiError } from "@/lib/i18n/api-error";
import { useRouter } from "@/lib/i18n/navigation";

type ReactivateResponse = {
  user: AuthUser;
};

export function ReactivateAccountCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useAuthUser();
  const user = data?.user;
  const t = useTranslations("account.reactivate");
  const tErrors = useTranslations("errors.api");

  const reactivateMutation = useMutation({
    mutationFn: () =>
      apiFetch<ReactivateResponse>("/api/account/reactivate", {
        method: "POST",
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      toastManager.add({
        type: "success",
        title: t("toast.successTitle"),
        description: t("toast.successDescription"),
      });
      router.replace("/repositories");
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.errorTitle"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  if (!user?.pendingDeletion) {
    return null;
  }

  const purgeDate = user.purgesAt
    ? new Date(user.purgesAt).toLocaleString()
    : t("purgeDateSoon");

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description", { purgeDate })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          onClick={() => void reactivateMutation.mutate()}
          disabled={reactivateMutation.isPending}
          data-loading={reactivateMutation.isPending ? "" : undefined}
        >
          {t("reactivate")}
        </Button>
        <Button
          variant="outline"
          onClick={() => void logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {t("signOut")}
        </Button>
      </CardContent>
    </Card>
  );
}
