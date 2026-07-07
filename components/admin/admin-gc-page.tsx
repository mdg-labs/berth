// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangleIcon, CopyIcon, HardDriveIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { anchoredToastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";

type GcStatusResponse = {
  status: {
    registryDataPath: string;
    storageBytes: number | null;
    storageHuman: string;
    gcCommand: string;
    warnings: string[];
  };
};

export function AdminGcPage() {
  const t = useTranslations("admin.gc");
  const tUsers = useTranslations("admin.users");
  const copyRef = useRef<HTMLButtonElement>(null);

  const statusQuery = useQuery({
    queryKey: ["admin-gc-status"],
    queryFn: () => apiFetch<GcStatusResponse>("/api/admin/gc/status"),
  });

  function copyCommand() {
    const command = statusQuery.data?.status.gcCommand;
    if (!command) {
      return;
    }

    void navigator.clipboard.writeText(command);
    anchoredToastManager.add({
      type: "success",
      title: t("toast.copied"),
      description: command,
      positionerProps: {
        anchor: copyRef.current,
        side: "top",
        align: "center",
      },
    });
  }

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

      {statusQuery.data?.status.warnings.map((warning) => (
        <Alert key={warning} variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>{t("warningTitle")}</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      {statusQuery.isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : null}

      {statusQuery.data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDriveIcon className="size-5" />
                {t("storage.title")}
              </CardTitle>
              <CardDescription>
                {t.rich("storage.description", {
                  path: () => (
                    <code className="text-foreground">
                      {statusQuery.data.status.registryDataPath}
                    </code>
                  ),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">
                {statusQuery.data.status.storageHuman}
              </p>
              {statusQuery.data.status.storageBytes !== null ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("storage.bytes", {
                    count: statusQuery.data.status.storageBytes.toLocaleString(),
                  })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("run.title")}</CardTitle>
              <CardDescription>{t("run.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                readOnly
                value={statusQuery.data.status.gcCommand}
                className="min-h-24 font-mono text-xs"
              />
              <Button ref={copyRef} type="button" onClick={copyCommand}>
                <CopyIcon className="size-4" />
                {t("run.copyButton")}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
