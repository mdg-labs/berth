// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useAuthUser } from "@/components/providers/auth-guard";
import { AccountProfileSection } from "@/components/account/account-profile-section";
import { ChangePasswordSection } from "@/components/account/change-password-section";

export function ProfilePageClient() {
  const { data } = useAuthUser();
  const user = data?.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account settings.
        </p>
      </div>
      <AccountProfileSection />
      {user?.hasPassword ? <ChangePasswordSection /> : null}
    </div>
  );
}
