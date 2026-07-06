// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getSessionUser } from "@/lib/session/server";

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (!user.mustChangePassword) {
    redirect("/projects");
  }

  return <ChangePasswordForm />;
}
