// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { toastManager } from "@/components/ui/toast";
import { formatApiError } from "@/lib/i18n/api-error";
import { Link } from "@/lib/i18n/navigation";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const tErrors = useTranslations("errors.api");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ message: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      }),
    onSuccess: () => {
      setSubmitted(true);
      toastManager.add({
        type: "success",
        title: t("toast.successTitle"),
        description: t("toast.successDescription"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.errorTitle"),
        description: formatApiError(tErrors, error, "generic"),
      });
    },
  });

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {submitted ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("successMessage")}
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="forgot-email" className="text-sm font-medium">
              {t("email")}
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          {t("backToSignIn")}
        </Link>
      </p>
    </div>
  );
}
