// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RepositoryAuditSectionProps = {
  repositoryId: string;
};

export function RepositoryAuditSection({
  repositoryId,
}: RepositoryAuditSectionProps) {
  const t = useTranslations("audit");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repositoryTitle")}</CardTitle>
        <CardDescription>{t("repositoryDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AuditLogTable
          apiPath={`/api/repositories/${repositoryId}/audit`}
          showClientIp={false}
          queryKeyPrefix={`repository-audit-${repositoryId}`}
        />
      </CardContent>
    </Card>
  );
}
