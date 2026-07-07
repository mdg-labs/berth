// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { toastManager } from "@/components/ui/toast";
import { formatApiError } from "@/lib/i18n/api-error";
import { Link, useRouter } from "@/lib/i18n/navigation";

export function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth.acceptInvite");
  const tErrors = useTranslations("errorsApi");
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const validationQuery = useQuery({
    queryKey: ["accept-invite", token],
    queryFn: () =>
      apiFetch<{ email: string; name: string; systemRole: string }>(
        `/api/auth/accept-invite?token=${encodeURIComponent(token)}`,
      ),
    enabled: Boolean(token),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/auth/accept-invite", {
        method: "POST",
        body: { token, password },
      }),
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: t("toast.successTitle"),
        description: t("toast.successDescription"),
      });
      router.replace("/login");
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.errorTitle"),
        description: formatApiError(tErrors, error, "generic"),
      });
    },
  });

  if (!token) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6 text-center shadow-xs">
        <p className="text-sm text-muted-foreground">{t("invalidLink")}</p>
        <Button render={<Link href="/login" />}>{t("goToSignIn")}</Button>
      </div>
    );
  }

  if (validationQuery.isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-xs">
        <Spinner />
      </div>
    );
  }

  if (validationQuery.isError) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6 text-center shadow-xs">
        <p className="text-sm text-muted-foreground">{t("expiredLink")}</p>
        <Button render={<Link href="/login" />}>{t("goToSignIn")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("description", {
            name: validationQuery.data?.name ?? "",
            email: validationQuery.data?.email ?? "",
          })}
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirmPassword) {
            toastManager.add({
              type: "error",
              title: t("toast.passwordMismatchTitle"),
            });
            return;
          }
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <label htmlFor="invite-password" className="text-sm font-medium">
            {t("password")}
          </label>
          <input
            id="invite-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="invite-password-confirm" className="text-sm font-medium">
            {t("confirmPassword")}
          </label>
          <input
            id="invite-password-confirm"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={mutation.isPending}
          data-loading={mutation.isPending ? "" : undefined}
        >
          {mutation.isPending ? <Spinner /> : null}
          {t("submit")}
        </Button>
      </form>
    </div>
  );
}
