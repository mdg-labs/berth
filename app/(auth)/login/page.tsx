// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { isOidcConfigured } from "@/lib/oidc/config";
import { getSessionUser } from "@/lib/session/server";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(user.mustChangePassword ? "/change-password" : "/repositories");
  }

  return <LoginForm oidcEnabled={isOidcConfigured()} />;
}
