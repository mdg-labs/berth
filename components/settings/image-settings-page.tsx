// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { useAuthUser } from "@/components/providers/auth-guard";
import { canDeleteRegistryContent } from "@/components/delete/permissions";
import { ImageDangerZone } from "@/components/settings/image-danger-zone";
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
import { imagePathSegments } from "@/lib/catalog/format";
import { useRepositoryByName } from "@/lib/hooks/use-repository";
import type {
  AnonymousPullOverride,
  ImageSettings,
} from "@/lib/images/types";

type ImageSettingsPageProps = {
  repositoryName: string;
  imageName: string;
};

type SettingsResponse = {
  settings: ImageSettings;
};

function useSyncedState<T>(value: T) {
  const [state, setState] = useState(value);

  useEffect(() => {
    setState(value);
  }, [value]);

  return [state, setState] as const;
}

export function ImageSettingsPage({
  repositoryName,
  imageName,
}: ImageSettingsPageProps) {
  const queryClient = useQueryClient();
  const { data: authData } = useAuthUser();
  const repositoryQuery = useRepositoryByName(repositoryName);

  const canManage =
    authData?.user.systemRole === "admin" || repositoryQuery.data?.role === "admin";
  const canDelete = canDeleteRegistryContent(
    authData?.user.systemRole ?? "user",
    repositoryQuery.data?.role ?? null,
  );
  const canAccessSettings = canManage || canDelete;

  const settingsQuery = useQuery({
    queryKey: ["image-settings", repositoryQuery.data?.id, imageName],
    queryFn: () =>
      apiFetch<SettingsResponse>(
        `/api/repositories/${repositoryQuery.data!.id}/images/${imagePathSegments(imageName)}/settings`,
      ),
    enabled: Boolean(repositoryQuery.data?.id && canManage),
  });

  const [anonymousPull, setAnonymousPull] = useSyncedState(
    settingsQuery.data?.settings.anonymousPull ?? "inherit",
  );

  const mutation = useMutation({
    mutationFn: (next: AnonymousPullOverride) =>
      apiFetch<SettingsResponse>(
        `/api/repositories/${repositoryQuery.data!.id}/images/${imagePathSegments(imageName)}/settings`,
        {
          method: "PATCH",
          body: { anonymousPull: next },
        },
      ),
    onSuccess: (response) => {
      queryClient.setQueryData(
        ["image-settings", repositoryQuery.data?.id, imageName],
        response,
      );
      void queryClient.invalidateQueries({
        queryKey: ["catalog", repositoryQuery.data?.id],
      });
      toastManager.add({
        type: "success",
        title: "Image settings updated",
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

  if (repositoryQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (repositoryQuery.isError || !repositoryQuery.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        Repository not found or you do not have access.
      </div>
    );
  }

  if (!canAccessSettings) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          You do not have permission to manage settings for {imageName}.
        </div>
        <Button
          variant="outline"
          render={
            <Link
              href={`/r/${encodeURIComponent(repositoryName)}/i/${imagePathSegments(imageName)}`}
            />
          }
        >
          <ArrowLeftIcon className="size-4" />
          Back to tags
        </Button>
      </div>
    );
  }

  const settings = settingsQuery.data?.settings;
  const effectiveLabel = settings?.effectiveAnonymousPull
    ? "Anonymous pull allowed"
    : "Anonymous pull denied";

  const tagsHref = `/r/${encodeURIComponent(repositoryName)}/i/${imagePathSegments(imageName)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{imageName}</h1>
          <p className="text-sm text-muted-foreground">
            Image settings in {repositoryName}
          </p>
        </div>
        <Button variant="outline" render={<Link href={tagsHref} />}>
          <ArrowLeftIcon className="size-4" />
          Back to tags
        </Button>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : null}

      {settingsQuery.isError ? (
        <ErrorAlert
          title="Failed to load image settings"
          message={
            settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : "Request failed"
          }
          onRetry={() => void settingsQuery.refetch()}
        />
      ) : null}

      {canManage && settings ? (
        <Card>
          <CardHeader>
            <CardTitle>Anonymous pull</CardTitle>
            <CardDescription>
              Override the repository default for this image. Members with access
              can always pull when authenticated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Repository default:</span>
              <Badge variant="secondary">
                {settings.repositoryAnonymousPullDefault
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
                      <span className="font-medium">Inherit repository default</span>
                      <p className="text-muted-foreground text-xs">
                        Use the repository-wide anonymous pull setting.
                      </p>
                    </span>
                  </Label>
                  <Label className="flex items-start gap-2">
                    <Radio value="allow" className="mt-0.5" />
                    <span>
                      <span className="font-medium">Allow anonymous pull</span>
                      <p className="text-muted-foreground text-xs">
                        Unauthenticated clients can pull this image.
                      </p>
                    </span>
                  </Label>
                  <Label className="flex items-start gap-2">
                    <Radio value="deny" className="mt-0.5" />
                    <span>
                      <span className="font-medium">Deny anonymous pull</span>
                      <p className="text-muted-foreground text-xs">
                        Require authentication even when the repository is public.
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

      {canDelete && repositoryQuery.data ? (
        <ImageDangerZone
          repositoryId={repositoryQuery.data.id}
          repositoryName={repositoryName}
          imageName={imageName}
        />
      ) : null}
    </div>
  );
}
