// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { PublicShell } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/api/client";
import { buildPullCommand, imagePathSegments } from "@/lib/catalog/format";
import type { PublicImageTagsResponse } from "@/lib/public/image-tags";

type PublicImageDetailPageProps = {
  repositoryName: string;
  imageName: string;
};

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

function buildTagsApiPath(repositoryName: string, imageName: string): string {
  return `/api/public/images/${encodeURIComponent(repositoryName)}/${imagePathSegments(imageName)}/tags`;
}

function useRegistryHost(): string {
  return typeof window !== "undefined" ? window.location.host : "localhost:8080";
}

function CopyPullButton({
  command,
  label,
}: {
  command: string;
  label: string;
}) {
  const t = useTranslations("public.detail");

  function copyPullCommand() {
    void navigator.clipboard.writeText(command);
    toastManager.add({
      type: "success",
      title: t("toast.copyPullCommand.title"),
      description: command,
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={copyPullCommand}>
      <CopyIcon />
      {label}
    </Button>
  );
}

export function PublicImageDetailPage({
  repositoryName,
  imageName,
}: PublicImageDetailPageProps) {
  const tDetail = useTranslations("public.detail");
  const qualifiedName = `${repositoryName}/${imageName}`;

  const tagsQuery = useQuery({
    queryKey: ["public-image-tags", repositoryName, imageName],
    queryFn: () =>
      apiFetch<PublicImageTagsResponse>(
        buildTagsApiPath(repositoryName, imageName),
      ),
    refetchInterval: 30_000,
  });

  const host = useRegistryHost();
  const data = tagsQuery.data;
  const recommendedCommand = data
    ? buildPullCommand(
        host,
        data.repository,
        data.name,
        data.recommendedPullTag,
      )
    : "";

  const isLoading = tagsQuery.isLoading;
  const error = tagsQuery.error;
  const isNotFound = error instanceof ApiError && error.status === 404;

  return (
    <PublicShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            render={<Link href="/" />}
          >
            <ArrowLeftIcon />
            {tDetail("back")}
          </Button>

          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {qualifiedName}
            </h1>
            {data ? (
              <p className="text-sm text-muted-foreground">
                {tDetail("pullCount", { count: data.pullCount })}
              </p>
            ) : null}
          </div>
        </div>

        {isLoading ? <DetailSkeleton /> : null}

        {error && !isNotFound ? (
          <ErrorAlert
            error={error}
            fallbackKey="generic"
            message={error instanceof Error ? undefined : tDetail("loadError")}
            onRetry={() => void tagsQuery.refetch()}
          />
        ) : null}

        {isNotFound ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {tDetail("notFound")}
          </div>
        ) : null}

        {data ? (
          <>
            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{tDetail("pullLatest")}</CardTitle>
                  <CardDescription>
                    {tDetail("pullLatestDescription", {
                      tag: data.recommendedPullTag,
                    })}
                  </CardDescription>
                </div>
                <CopyPullButton
                  command={recommendedCommand}
                  label={tDetail("copyPullCommand")}
                />
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs">
                  {recommendedCommand}
                </pre>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">
                {tDetail("tags")}
              </h2>
              <div className="overflow-hidden rounded-lg border bg-background">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tDetail("columns.tag")}</TableHead>
                        <TableHead className="w-40 text-right">
                          {tDetail("columns.pull")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tags.map((tag) => {
                        const command = buildPullCommand(
                          host,
                          data.repository,
                          data.name,
                          tag,
                        );
                        return (
                          <TableRow key={tag}>
                            <TableCell className="font-mono text-sm">
                              {tag}
                            </TableCell>
                            <TableCell className="text-right">
                              <CopyPullButton
                                command={command}
                                label={tDetail("copyPullCommand")}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </PublicShell>
  );
}
