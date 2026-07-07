// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { useAuthUser } from "@/components/providers/auth-guard";
import { DeleteTagDialog } from "@/components/delete/delete-tag-dialog";
import { GcInfoAlert } from "@/components/delete/gc-info-alert";
import { canDeleteRegistryContent } from "@/components/delete/permissions";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTab } from "@/components/ui/tabs";
import { anchoredToastManager, toastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import {
  buildPullCommand,
  formatBytes,
  formatDigest,
  imagePathSegments,
} from "@/lib/catalog/format";
import { formatApiError } from "@/lib/i18n/api-error";
import { useRepositoryByName } from "@/lib/hooks/use-repository";
import type { SiblingsResponse, TagDetail } from "@/lib/registry/client/types";

type TagDetailPageProps = {
  repositoryName: string;
  imageName: string;
  tag: string;
};

type TagDetailResponse = {
  tag: TagDetail;
};

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

function encodeRepoPath(imageName: string): string {
  return imageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function TagDetailPage({ repositoryName, imageName, tag }: TagDetailPageProps) {
  const t = useTranslations("tags");
  const tDetail = useTranslations("tags.detail");
  const tErrors = useTranslations("errorsApi");
  const router = useRouter();
  const queryClient = useQueryClient();
  const authQuery = useAuthUser();
  const repositoryQuery = useRepositoryByName(repositoryName);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showGcInfo, setShowGcInfo] = useState(false);

  const encodedRepo = encodeRepoPath(imageName);
  const encodedTag = encodeURIComponent(tag);

  const detailQuery = useQuery({
    queryKey: ["tag-detail", repositoryQuery.data?.id, imageName, tag],
    queryFn: () =>
      apiFetch<TagDetailResponse>(
        `/api/repositories/${repositoryQuery.data!.id}/images/${encodedRepo}/tags/${encodedTag}`,
      ),
    enabled: Boolean(repositoryQuery.data?.id),
    refetchInterval: 30_000,
  });

  const siblingsQuery = useQuery({
    queryKey: ["tag-siblings", repositoryQuery.data?.id, imageName, tag],
    queryFn: () =>
      apiFetch<SiblingsResponse>(
        `/api/repositories/${repositoryQuery.data!.id}/images/${encodedRepo}/tags/${encodedTag}/siblings`,
      ),
    enabled: Boolean(repositoryQuery.data?.id && detailQuery.data),
  });

  const canDelete = canDeleteRegistryContent(
    authQuery.data?.user.systemRole ?? "user",
    repositoryQuery.data?.role ?? null,
  );

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: boolean }>(
        `/api/repositories/${repositoryQuery.data!.id}/images/${encodedRepo}/tags/${encodedTag}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setDeleteOpen(false);
      setShowGcInfo(true);
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      toastManager.add({
        type: "success",
        title: t("toast.deleteSuccess.title"),
        description: t("toast.deleteSuccess.description", { tag }),
      });
      router.push(`/r/${repositoryName}/i/${imagePathSegments(imageName)}`);
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.deleteError.title"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const pullCommand = buildPullCommand(
    typeof window !== "undefined" ? window.location.origin : "localhost:8080",
    repositoryName,
    imageName,
    tag,
  );

  function copyPullCommand() {
    void navigator.clipboard.writeText(pullCommand);
    anchoredToastManager.add({
      type: "success",
      title: t("toast.copyPullCommand.title"),
      description: pullCommand,
      positionerProps: {
        anchor: copyButtonRef.current,
        side: "top",
        align: "center",
      },
    });
  }

  const isLoading = repositoryQuery.isLoading || detailQuery.isLoading;
  const error = repositoryQuery.error ?? detailQuery.error;
  const detail = detailQuery.data?.tag;
  const siblings = siblingsQuery.data?.siblings.map((entry) => entry.name) ?? [];
  const empty = tDetail("platforms.empty");

  return (
    <div className="space-y-6">
      {isLoading ? <DetailSkeleton /> : null}

      {error ? (
        <ErrorAlert
          error={error}
          fallbackKey="generic"
          message={error instanceof Error ? undefined : tDetail("loadError")}
          onRetry={() => {
            void repositoryQuery.refetch();
            void detailQuery.refetch();
          }}
        />
      ) : null}

      {showGcInfo ? <GcInfoAlert onDismiss={() => setShowGcInfo(false)} /> : null}

      {detail ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
              <p className="text-sm text-muted-foreground">
                {repositoryName}/{imageName}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button ref={copyButtonRef} variant="outline" onClick={copyPullCommand}>
                <CopyIcon />
                {tDetail("copyPullCommand")}
              </Button>
              {canDelete ? (
                <Button
                  variant="destructive-outline"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2Icon />
                  {tDetail("deleteTag")}
                </Button>
              ) : null}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{tDetail("manifest")}</CardTitle>
              <CardDescription>{detail.mediaType}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{formatDigest(detail.digest)}</Badge>
                <Badge variant="secondary">{formatBytes(detail.size)}</Badge>
              </div>
              {detail.pushedAt ? (
                <p className="text-muted-foreground">
                  {tDetail("created", {
                    date: new Date(detail.pushedAt).toLocaleString(),
                  })}
                </p>
              ) : null}
              <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs">
                {pullCommand}
              </pre>
            </CardContent>
          </Card>

          <Tabs defaultValue="platforms">
            <TabsList>
              <TabsTab value="platforms">{tDetail("tabs.platforms")}</TabsTab>
              <TabsTab value="history">{tDetail("tabs.history")}</TabsTab>
              <TabsTab value="siblings">{tDetail("tabs.siblings")}</TabsTab>
            </TabsList>

            <TabsContent value="platforms" className="mt-4">
              {detail.platforms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tDetail("platforms.singlePlatform")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tDetail("platforms.os")}</TableHead>
                      <TableHead>{tDetail("platforms.architecture")}</TableHead>
                      <TableHead>{tDetail("platforms.variant")}</TableHead>
                      <TableHead>{tDetail("platforms.digest")}</TableHead>
                      <TableHead>{tDetail("platforms.size")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.platforms.map((platform) => (
                      <TableRow key={platform.digest}>
                        <TableCell>{platform.os}</TableCell>
                        <TableCell>{platform.architecture}</TableCell>
                        <TableCell>{platform.variant ?? empty}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDigest(platform.digest)}
                        </TableCell>
                        <TableCell>{formatBytes(platform.size)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {detail.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tDetail("history.empty")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tDetail("history.created")}</TableHead>
                      <TableHead>{tDetail("history.by")}</TableHead>
                      <TableHead>{tDetail("history.comment")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.history.map((entry, index) => (
                      <TableRow key={`${entry.created}-${index}`}>
                        <TableCell>
                          {entry.created
                            ? new Date(entry.created).toLocaleString()
                            : empty}
                        </TableCell>
                        <TableCell>{entry.createdBy || empty}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {entry.comment ||
                            (entry.emptyLayer ? tDetail("history.emptyLayer") : empty)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="siblings" className="mt-4">
              {siblings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tDetail("siblings.empty")}
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {siblings.map((sibling) => (
                    <li key={sibling} className="px-4 py-3 text-sm">
                      {sibling}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>

          <DeleteTagDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            tagName={tag}
            siblings={siblings}
            isPending={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate()}
          />
        </>
      ) : null}
    </div>
  );
}
