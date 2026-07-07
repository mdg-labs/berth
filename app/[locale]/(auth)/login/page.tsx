// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getLocale } from "next-intl/server";

import { LoginForm } from "@/components/auth/login-form";
import { redirect } from "@/lib/i18n/navigation";
import { isOidcConfigured } from "@/lib/oidc/config";
import { getSessionUser } from "@/lib/session/server";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    const locale = await getLocale();
    redirect({
      href: user.mustChangePassword ? "/change-password" : "/repositories",
      locale,
    });
  }

  return <LoginForm oidcEnabled={isOidcConfigured()} />;
}
