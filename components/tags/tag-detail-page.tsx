// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useRef } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
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
import { anchoredToastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import {
  buildPullCommand,
  formatBytes,
  formatDigest,
} from "@/lib/catalog/format";
import { useProjectByName } from "@/lib/hooks/use-project";
import type { SiblingsResponse, TagDetail } from "@/lib/registry/client/types";

type TagDetailPageProps = {
  projectName: string;
  repoName: string;
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

export function TagDetailPage({ projectName, repoName, tag }: TagDetailPageProps) {
  const projectQuery = useProjectByName(projectName);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  const encodedRepo = repoName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const encodedTag = encodeURIComponent(tag);

  const detailQuery = useQuery({
    queryKey: ["tag-detail", projectQuery.data?.id, repoName, tag],
    queryFn: () =>
      apiFetch<TagDetailResponse>(
        `/api/projects/${projectQuery.data!.id}/repos/${encodedRepo}/tags/${encodedTag}`,
      ),
    enabled: Boolean(projectQuery.data?.id),
    refetchInterval: 30_000,
  });

  const siblingsQuery = useQuery({
    queryKey: ["tag-siblings", projectQuery.data?.id, repoName, tag],
    queryFn: () =>
      apiFetch<SiblingsResponse>(
        `/api/projects/${projectQuery.data!.id}/repos/${encodedRepo}/tags/${encodedTag}/siblings`,
      ),
    enabled: Boolean(projectQuery.data?.id && detailQuery.data),
  });

  const pullCommand = buildPullCommand(
    typeof window !== "undefined" ? window.location.origin : "localhost:8080",
    projectName,
    repoName,
    tag,
  );

  function copyPullCommand() {
    void navigator.clipboard.writeText(pullCommand);
    anchoredToastManager.add({
      type: "success",
      title: "Copied pull command",
      description: pullCommand,
      positionerProps: {
        anchor: copyButtonRef.current,
        side: "top",
        align: "center",
      },
    });
  }

  const isLoading = projectQuery.isLoading || detailQuery.isLoading;
  const error = projectQuery.error ?? detailQuery.error;
  const detail = detailQuery.data?.tag;

  return (
    <div className="space-y-6">
      {isLoading ? <DetailSkeleton /> : null}

      {error ? (
        <ErrorAlert
          message={error instanceof Error ? error.message : "Failed to load tag"}
          onRetry={() => {
            void projectQuery.refetch();
            void detailQuery.refetch();
          }}
        />
      ) : null}

      {detail ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
              <p className="text-sm text-muted-foreground">
                {projectName}/{repoName}
              </p>
            </div>
            <Button ref={copyButtonRef} variant="outline" onClick={copyPullCommand}>
              <CopyIcon />
              Copy pull command
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Manifest</CardTitle>
              <CardDescription>{detail.mediaType}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{formatDigest(detail.digest)}</Badge>
                <Badge variant="secondary">{formatBytes(detail.size)}</Badge>
              </div>
              {detail.pushedAt ? (
                <p className="text-muted-foreground">
                  Created {new Date(detail.pushedAt).toLocaleString()}
                </p>
              ) : null}
              <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs">
                {pullCommand}
              </pre>
            </CardContent>
          </Card>

          <Tabs defaultValue="platforms">
            <TabsList>
              <TabsTab value="platforms">Platforms</TabsTab>
              <TabsTab value="history">History</TabsTab>
              <TabsTab value="siblings">Siblings</TabsTab>
            </TabsList>

            <TabsContent value="platforms" className="mt-4">
              {detail.platforms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Single-platform image (no manifest list).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Architecture</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Digest</TableHead>
                      <TableHead>Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.platforms.map((platform) => (
                      <TableRow key={platform.digest}>
                        <TableCell>{platform.os}</TableCell>
                        <TableCell>{platform.architecture}</TableCell>
                        <TableCell>{platform.variant ?? "—"}</TableCell>
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
                <p className="text-sm text-muted-foreground">No history available.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Comment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.history.map((entry, index) => (
                      <TableRow key={`${entry.created}-${index}`}>
                        <TableCell>
                          {entry.created
                            ? new Date(entry.created).toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell>{entry.createdBy || "—"}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {entry.comment || (entry.emptyLayer ? "(empty layer)" : "—")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="siblings" className="mt-4">
              {(siblingsQuery.data?.siblings.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other tags share this digest.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {siblingsQuery.data!.siblings.map((sibling) => (
                    <li key={sibling.name} className="px-4 py-3 text-sm">
                      {sibling.name}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
