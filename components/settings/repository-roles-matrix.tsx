// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RBAC_MATRIX, RBAC_MATRIX_COLUMNS } from "@/lib/rbac/matrix";

export function RepositoryRolesMatrix() {
  const t = useTranslations("settings.rolesMatrix");
  const tRoles = useTranslations("roles.repository");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background">
                {t("columns.role")}
              </TableHead>
              {RBAC_MATRIX_COLUMNS.map((column) => (
                <TableHead key={column} className="text-center">
                  {t(`columns.${column}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {RBAC_MATRIX.map((row) => (
              <TableRow key={row.role}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium">
                  {tRoles(row.role)}
                </TableCell>
                {RBAC_MATRIX_COLUMNS.map((column) => {
                  const allowed = row[column];

                  return (
                    <TableCell key={column} className="text-center">
                      {allowed ? (
                        <span className="inline-flex items-center justify-center text-foreground">
                          <CheckIcon className="size-4" aria-hidden="true" />
                          <span className="sr-only">{t("allowed")}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center text-muted-foreground/60">
                          <MinusIcon className="size-4" aria-hidden="true" />
                          <span className="sr-only">{t("denied")}</span>
                        </span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">{t("systemAdminNote")}</p>
      </CardContent>
    </Card>
  );
}
