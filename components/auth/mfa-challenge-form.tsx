// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { apiFetch } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { OTPField, OTPFieldInput } from "@/components/ui/otp-field";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { formatApiError } from "@/lib/i18n/api-error";
import { Link, useRouter } from "@/lib/i18n/navigation";

type MfaStatusResponse = {
  required: boolean;
};

type MfaVerifyResponse = {
  user: AuthUser;
};

export function MfaChallengeForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("auth.mfaChallenge");
  const tErrors = useTranslations("errorsApi");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["auth", "mfa", "status"],
    queryFn: () => apiFetch<MfaStatusResponse>("/api/auth/mfa/status"),
    retry: false,
  });

  const verifyMutation = useMutation({
    mutationFn: (verificationCode: string) =>
      apiFetch<MfaVerifyResponse>("/api/auth/mfa/verify", {
        method: "POST",
        body: { code: verificationCode },
      }),
    onSuccess: (data) => {
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

  if (statusQuery.isLoading) {
    return null;
  }

  if (!statusQuery.data?.required) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-xs text-center">
        <p className="text-sm text-muted-foreground">{t("expired")}</p>
        <Button render={<Link href="/login" />}>{t("backToSignIn")}</Button>
      </div>
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    verifyMutation.mutate(useBackupCode ? backupCode : code);
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Form className="space-y-4" onSubmit={handleSubmit}>
        {useBackupCode ? (
          <Field>
            <FieldLabel htmlFor="backup-code">{t("backupCode")}</FieldLabel>
            <Input
              id="backup-code"
              name="backupCode"
              autoComplete="one-time-code"
              placeholder="ABCD-1234"
              value={backupCode}
              onChange={(event) => setBackupCode(event.target.value)}
              required
            />
            <FieldDescription>{t("backupCodeHint")}</FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel>{t("code")}</FieldLabel>
            <div className="flex justify-center">
              <OTPField
                aria-label={t("code")}
                length={6}
                value={code}
                onValueChange={setCode}
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <OTPFieldInput
                    key={index}
                    aria-label={
                      index === 0 ? undefined : t("codeSlot", { index: index + 1 })
                    }
                  />
                ))}
              </OTPField>
            </div>
          </Field>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={
            verifyMutation.isPending ||
            (useBackupCode ? backupCode.trim().length === 0 : code.length !== 6)
          }
          data-loading={verifyMutation.isPending ? "" : undefined}
        >
          {verifyMutation.isPending ? <Spinner /> : null}
          {t("submit")}
        </Button>
      </Form>

      <div className="text-center text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-primary hover:underline"
          onClick={() => {
            setUseBackupCode((current) => !current);
            setCode("");
            setBackupCode("");
          }}
        >
          {useBackupCode ? t("useAuthenticator") : t("useBackupCode")}
        </button>
      </div>

      <div className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-primary hover:underline">
          {t("backToSignIn")}
        </Link>
      </div>
    </div>
  );
}
