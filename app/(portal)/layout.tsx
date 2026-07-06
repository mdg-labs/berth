// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { redirect } from "next/navigation";

import { AuthGuard } from "@/components/providers/auth-guard";
import { PortalHeader } from "@/components/layout/portal-header";
import { getSessionUser } from "@/lib/session/server";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-foreground">
        <PortalHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
