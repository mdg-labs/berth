// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuthUser } from "@/components/providers/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { apiFetch, ApiError } from "@/lib/api/client";
import { repoPathSegments } from "@/lib/catalog/format";
import { useProjectByName } from "@/lib/hooks/use-project";
import type {
  AnonymousPullOverride,
  RepositorySettings,
} from "@/lib/repositories/types";

type RepositorySettingsPageProps = {
  projectName: string;
  repoName: string;
};

type SettingsResponse = {
  settings: RepositorySettings;
};

function useSyncedState<T>(value: T) {
  const [state, setState] = useState(value);

  useEffect(() => {
    setState(value);
  }, [value]);

  return [state, setState] as const;
}

export function RepositorySettingsPage({
  projectName,
  repoName,
}: RepositorySettingsPageProps) {
  const queryClient = useQueryClient();
  const { data: authData } = useAuthUser();
  const projectQuery = useProjectByName(projectName);

  const canManage =
    authData?.user.systemRole === "admin" || projectQuery.data?.role === "admin";

  const settingsQuery = useQuery({
    queryKey: ["repository-settings", projectQuery.data?.id, repoName],
    queryFn: () =>
      apiFetch<SettingsResponse>(
        `/api/projects/${projectQuery.data!.id}/repos/${repoPathSegments(repoName)}/settings`,
      ),
    enabled: Boolean(projectQuery.data?.id && canManage),
  });

  const [anonymousPull, setAnonymousPull] = useSyncedState(
    settingsQuery.data?.settings.anonymousPull ?? "inherit",
  );

  const mutation = useMutation({
    mutationFn: (next: AnonymousPullOverride) =>
      apiFetch<SettingsResponse>(
        `/api/projects/${projectQuery.data!.id}/repos/${repoPathSegments(repoName)}/settings`,
        {
          method: "PATCH",
          body: { anonymousPull: next },
        },
      ),
    onSuccess: (response) => {
      queryClient.setQueryData(
        ["repository-settings", projectQuery.data?.id, repoName],
        response,
      );
      void queryClient.invalidateQueries({
        queryKey: ["catalog", projectQuery.data?.id],
      });
      toastManager.add({
        type: "success",
        title: "Repository settings updated",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Update failed",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  if (projectQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        Project not found or you do not have access.
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Only project admins can manage settings for {repoName}.
        </div>
        <Button
          variant="outline"
          render={
            <Link
              href={`/p/${encodeURIComponent(projectName)}/r/${repoPathSegments(repoName)}`}
            />
          }
        >
          Back to tags
        </Button>
      </div>
    );
  }

  const settings = settingsQuery.data?.settings;
  const effectiveLabel = settings?.effectiveAnonymousPull
    ? "Anonymous pull allowed"
    : "Anonymous pull denied";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{repoName}</h1>
          <p className="text-sm text-muted-foreground">
            Repository settings in {projectName}
          </p>
        </div>
        <Button
          variant="outline"
          render={
            <Link
              href={`/p/${encodeURIComponent(projectName)}/r/${repoPathSegments(repoName)}`}
            />
          }
        >
          <SettingsIcon className="size-4" />
          Back to tags
        </Button>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : null}

      {settings ? (
        <Card>
          <CardHeader>
            <CardTitle>Anonymous pull</CardTitle>
            <CardDescription>
              Override the project default for this repository. Members with
              access can always pull when authenticated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Project default:</span>
              <Badge variant="secondary">
                {settings.projectAnonymousPullDefault
                  ? "Allow anonymous pull"
                  : "Deny anonymous pull"}
              </Badge>
              <span className="text-muted-foreground">Effective:</span>
              <Badge
                variant={
                  settings.effectiveAnonymousPull ? "default" : "destructive"
                }
              >
                {effectiveLabel}
              </Badge>
            </div>

            <Form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(anonymousPull);
              }}
            >
              <Fieldset>
                <FieldsetLegend>Override</FieldsetLegend>
                <RadioGroup
                  value={anonymousPull}
                  onValueChange={(value) =>
                    setAnonymousPull(value as AnonymousPullOverride)
                  }
                >
                  <Label className="flex items-start gap-2">
                    <Radio value="inherit" className="mt-0.5" />
                    <span>
                      <span className="font-medium">Inherit project default</span>
                      <p className="text-muted-foreground text-xs">
                        Use the project-wide anonymous pull setting.
                      </p>
                    </span>
                  </Label>
                  <Label className="flex items-start gap-2">
                    <Radio value="allow" className="mt-0.5" />
                    <span>
                      <span className="font-medium">Allow anonymous pull</span>
                      <p className="text-muted-foreground text-xs">
                        Unauthenticated clients can pull this repository.
                      </p>
                    </span>
                  </Label>
                  <Label className="flex items-start gap-2">
                    <Radio value="deny" className="mt-0.5" />
                    <span>
                      <span className="font-medium">Deny anonymous pull</span>
                      <p className="text-muted-foreground text-xs">
                        Require authentication even when the project is public.
                      </p>
                    </span>
                  </Label>
                </RadioGroup>
              </Fieldset>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-loading={mutation.isPending ? "" : undefined}
              >
                {mutation.isPending ? <Spinner /> : null}
                Save changes
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
