// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useRouter } from "next/navigation";

import { ChangePasswordSection } from "@/components/account/change-password-section";

export function ChangePasswordForm() {
  const router = useRouter();

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Change your password
        </h1>
        <p className="text-sm text-muted-foreground">
          You must set a new password before continuing.
        </p>
      </div>
      <ChangePasswordSection
        embedded
        requireCurrentPassword={false}
        onSuccess={() => router.replace("/repositories")}
      />
    </div>
  );
}
