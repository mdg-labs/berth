// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getLocale } from "next-intl/server";

import { AuthGuard } from "@/components/providers/auth-guard";
import { PortalShell } from "@/components/layout/portal-shell";
import { redirect } from "@/lib/i18n/navigation";
import { getSessionUser } from "@/lib/session/server";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const locale = await getLocale();

  if (!user) {
    redirect({ href: "/login", locale });
  } else if (user.mustChangePassword) {
    redirect({ href: "/change-password", locale });
  }

  return (
    <AuthGuard>
      <PortalShell>{children}</PortalShell>
    </AuthGuard>
  );
}
