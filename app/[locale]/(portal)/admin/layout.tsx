// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getLocale } from "next-intl/server";

import type { Locale } from "@/lib/i18n/config";
import { getServerTranslator } from "@/lib/i18n/server-translator";
import { redirect } from "@/lib/i18n/navigation";
import { getSessionUser } from "@/lib/session/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  const locale = await getLocale();

  if (!user) {
    redirect({ href: "/login", locale });
  } else if (user.systemRole !== "admin") {
    const t = await getServerTranslator(locale as Locale, "admin");

    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="text-lg font-semibold">{t("accessDenied.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("accessDenied.description")}
        </p>
      </div>
    );
  }

  return children;
}
