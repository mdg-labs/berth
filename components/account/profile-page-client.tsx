// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";

import { useAuthUser } from "@/components/providers/auth-guard";
import { AccountMfaSection } from "@/components/account/account-mfa-section";
import { AccountProfileSection } from "@/components/account/account-profile-section";
import { AccountTokensSection } from "@/components/account/account-tokens-section";
import { ChangePasswordSection } from "@/components/account/change-password-section";

export function ProfilePageClient() {
  const { data } = useAuthUser();
  const user = data?.user;
  const t = useTranslations("account.profile");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <AccountProfileSection />
      <AccountTokensSection />
      {user?.hasPassword ? <ChangePasswordSection /> : null}
      {user?.hasPassword ? <AccountMfaSection /> : null}
    </div>
  );
}
