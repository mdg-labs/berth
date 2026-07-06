// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch, ApiError } from "@/lib/api/client";
import { toastManager } from "@/components/ui/toast";

type ProjectVisibilitySectionProps = {
  projectId: string;
  isPublic: boolean;
};

export function ProjectVisibilitySection({
  projectId,
  isPublic,
}: ProjectVisibilitySectionProps) {
  const queryClient = useQueryClient();
  const switchId = useId();

  const visibilityMutation = useMutation({
    mutationFn: (nextPublic: boolean) =>
      apiFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: { isPublic: nextPublic },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toastManager.add({
        type: "success",
        title: "Visibility updated",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to update visibility",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visibility</CardTitle>
        <CardDescription>
          Public projects allow anonymous pull access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={switchId}>Public project</Label>
            <FieldDescription>
              When enabled, unauthenticated clients can pull images from this
              project.
            </FieldDescription>
          </div>
          <Switch
            id={switchId}
            checked={isPublic}
            disabled={visibilityMutation.isPending}
            onCheckedChange={(checked) => visibilityMutation.mutate(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
