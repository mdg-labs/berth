// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";

import { ChangePasswordSection } from "@/components/account/change-password-section";
import { useRouter } from "@/lib/i18n/navigation";

export function ChangePasswordForm() {
  const router = useRouter();
  const t = useTranslations("auth.changePassword");

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ChangePasswordSection
        embedded
        requireCurrentPassword={false}
        onSuccess={() => router.replace("/repositories")}
      />
    </div>
  );
}
