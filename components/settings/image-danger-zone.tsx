// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GcInfoAlert } from "@/components/delete/gc-info-alert";
import { ImageDeleteDialog } from "@/components/delete/image-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import type { TagsListResponse } from "@/lib/registry/client/types";

type ImageDangerZoneProps = {
  repositoryId: string;
  repositoryName: string;
  imageName: string;
};

function encodeRepoPath(imageName: string): string {
  return imageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function ImageDangerZone({
  repositoryId,
  repositoryName,
  imageName,
}: ImageDangerZoneProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showGcInfo, setShowGcInfo] = useState(false);

  const tagsQuery = useQuery({
    queryKey: ["tags", repositoryId, imageName, "count"],
    queryFn: () =>
      apiFetch<TagsListResponse>(
        `/api/repositories/${repositoryId}/images/${encodeRepoPath(imageName)}/tags?pageSize=1`,
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ deletedTags: string[] }>(
        `/api/repositories/${repositoryId}/images/${encodeRepoPath(imageName)}`,
        { method: "DELETE" },
      ),
    onSuccess: (result) => {
      setDeleteOpen(false);
      setShowGcInfo(true);
      void queryClient.invalidateQueries({ queryKey: ["catalog", repositoryId] });
      toastManager.add({
        type: "success",
        title: "Image deleted",
        description: `Removed ${result.deletedTags.length} tag${result.deletedTags.length === 1 ? "" : "s"}.`,
      });
      router.push(`/r/${encodeURIComponent(repositoryName)}`);
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Image delete failed",
        description: error instanceof Error ? error.message : "Request failed",
      });
    },
  });

  const tagCount = tagsQuery.data?.total ?? 0;

  return (
    <>
      {showGcInfo ? <GcInfoAlert onDismiss={() => setShowGcInfo(false)} /> : null}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>
            Permanently delete this image and all of its tags from the registry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tagsQuery.isLoading ? (
            <Skeleton className="h-9 w-32 rounded-lg" />
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={tagCount === 0}
              onClick={() => setDeleteOpen(true)}
            >
              Delete image
            </Button>
          )}
        </CardContent>
      </Card>

      <ImageDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        imageName={imageName}
        tagCount={tagCount}
        resourceKind="image"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
