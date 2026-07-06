// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangleIcon, CopyIcon, HardDriveIcon } from "lucide-react";
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
      title: "Copied GC command",
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Garbage collection
          </h1>
          <p className="text-sm text-muted-foreground">
            Storage usage and operator runbook for registry GC.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/admin" />}>
          Back to users
        </Button>
      </div>

      {statusQuery.data?.status.warnings.map((warning) => (
        <Alert key={warning} variant="warning">
          <AlertTriangleIcon />
          <AlertTitle>Operator warning</AlertTitle>
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
                Storage usage
              </CardTitle>
              <CardDescription>
                Approximate size of the registry-data volume at{" "}
                <code className="text-foreground">
                  {statusQuery.data.status.registryDataPath}
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">
                {statusQuery.data.status.storageHuman}
              </p>
              {statusQuery.data.status.storageBytes !== null ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {statusQuery.data.status.storageBytes.toLocaleString()} bytes
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run garbage collection</CardTitle>
              <CardDescription>
                Stop or set the registry to read-only, then run this command on
                the host. There is no live trigger in the portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                readOnly
                value={statusQuery.data.status.gcCommand}
                className="min-h-24 font-mono text-xs"
              />
              <Button ref={copyRef} type="button" onClick={copyCommand}>
                <CopyIcon className="size-4" />
                Copy command
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
