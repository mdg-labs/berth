// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getLocale } from "next-intl/server";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { redirect } from "@/lib/i18n/navigation";
import { getSessionUser } from "@/lib/session/server";

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  const locale = await getLocale();

  if (!user) {
    redirect({ href: "/login", locale });
  } else if (!user.mustChangePassword) {
    redirect({ href: "/repositories", locale });
  }

  return <ChangePasswordForm />;
}
