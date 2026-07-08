// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import { Button } from "@/components/ui/button";

export function AdminAuditPage() {
  const t = useTranslations("audit");
  const tUsers = useTranslations("admin.users");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button variant="outline" render={<Link href="/admin" />}>
          {tUsers("backToUsers")}
        </Button>
      </div>

      <AuditLogTable apiPath="/api/admin/audit" showClientIp />
    </div>
  );
}
