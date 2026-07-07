// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { apiFetch } from "@/lib/api/client";
import { imagePathSegments } from "@/lib/catalog/format";
import { formatApiError } from "@/lib/i18n/api-error";
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
  const t = useTranslations("settings");
  const tImage = useTranslations("settings.imageSettings");
  const tErrors = useTranslations("errors.api");
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
        title: tImage("toast.success"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: tImage("toast.error"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  if (repositoryQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (repositoryQuery.isError || !repositoryQuery.data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        {t("image.notFound")}
      </div>
    );
  }

  if (!canAccessSettings) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          {t("image.forbidden", { name: imageName })}
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
          {t("backToTags")}
        </Button>
      </div>
    );
  }

  const settings = settingsQuery.data?.settings;
  const effectiveLabel = settings?.effectiveAnonymousPull
    ? tImage("effectiveAllow")
    : tImage("effectiveDeny");

  const tagsHref = `/r/${encodeURIComponent(repositoryName)}/i/${imagePathSegments(imageName)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{imageName}</h1>
          <p className="text-sm text-muted-foreground">
            {t("image.subtitle", { repository: repositoryName })}
          </p>
        </div>
        <Button variant="outline" render={<Link href={tagsHref} />}>
          <ArrowLeftIcon className="size-4" />
          {t("backToTags")}
        </Button>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : null}

      {settingsQuery.isError ? (
        <ErrorAlert
          title={t("image.loadError")}
          error={settingsQuery.error}
          fallbackKey="request_failed"
          onRetry={() => void settingsQuery.refetch()}
        />
      ) : null}

      {canManage && settings ? (
        <Card>
          <CardHeader>
            <CardTitle>{tImage("title")}</CardTitle>
            <CardDescription>{tImage("description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{tImage("repositoryDefault")}</span>
              <Badge variant="secondary">
                {settings.repositoryAnonymousPullDefault
                  ? tImage("allowDefault")
                  : tImage("denyDefault")}
              </Badge>
              <span className="text-muted-foreground">{tImage("effective")}</span>
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
                <FieldsetLegend>{tImage("override")}</FieldsetLegend>
                <RadioGroup
                  value={anonymousPull}
                  onValueChange={(value) =>
                    setAnonymousPull(value as AnonymousPullOverride)
                  }
                >
                  <Label className="flex items-start gap-2">
                    <Radio value="inherit" className="mt-0.5" />
                    <span>
                      <span className="font-medium">{tImage("inherit.label")}</span>
                      <p className="text-muted-foreground text-xs">
                        {tImage("inherit.description")}
                      </p>
                    </span>
                  </Label>
                  <Label className="flex items-start gap-2">
                    <Radio value="allow" className="mt-0.5" />
                    <span>
                      <span className="font-medium">{tImage("allow.label")}</span>
                      <p className="text-muted-foreground text-xs">
                        {tImage("allow.description")}
                      </p>
                    </span>
                  </Label>
                  <Label className="flex items-start gap-2">
                    <Radio value="deny" className="mt-0.5" />
                    <span>
                      <span className="font-medium">{tImage("deny.label")}</span>
                      <p className="text-muted-foreground text-xs">
                        {tImage("deny.description")}
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
                {tImage("save")}
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
