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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
    mutationFn: (anonymousPullDefault: boolean) =>
      apiFetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        body: { anonymousPullDefault },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toastManager.add({
        type: "success",
        title: "Default visibility updated",
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
        <CardTitle>Default anonymous pull</CardTitle>
        <CardDescription>
          Applies to all repositories unless overridden on an individual image
          settings page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Field className="flex-1">
            <FieldLabel htmlFor={switchId}>Allow anonymous pull</FieldLabel>
            <FieldDescription>
              When enabled, unauthenticated clients can pull repositories that
              inherit this project default.
            </FieldDescription>
          </Field>
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
