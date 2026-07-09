// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { apiFetch } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { formatApiError } from "@/lib/i18n/api-error";
import { Link, useRouter } from "@/lib/i18n/navigation";

type LoginResponse = {
  user?: AuthUser;
  mfaRequired?: boolean;
};

export function LoginForm({ oidcEnabled }: { oidcEnabled: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("errorsApi");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data) => {
      if (data.mfaRequired) {
        router.replace("/mfa-challenge");
        return;
      }

      if (!data.user) {
        return;
      }

      queryClient.setQueryData(["auth", "me"], data);
      toastManager.add({
        type: "success",
        title: t("toast.successTitle"),
        description: t("toast.successDescription", { name: data.user.name }),
      });
      router.replace(
        data.user.mustChangePassword
          ? "/change-password"
          : data.user.pendingDeletion
            ? "/reactivate-account"
            : "/repositories",
      );
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.errorTitle"),
        description: formatApiError(tErrors, error, "generic"),
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.mutate({ email, password });
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              {t("password")}
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loginMutation.isPending}
          data-loading={loginMutation.isPending ? "" : undefined}
        >
          {loginMutation.isPending ? <Spinner /> : null}
          {t("submit")}
        </Button>
      </form>

      {oidcEnabled ? (
        <div className="space-y-3">
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">{t("or")}</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              window.location.href = "/api/auth/oidc/start";
            }}
          >
            {t("oidc")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
