// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ErrorAlert } from "@/components/catalog/error-alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";

type SettingsResponse = {
  settings: {
    patMaxValidityDays: number | null;
    patAllowNeverExpire: boolean;
    updatedAt: string;
  };
};

export function AdminSettingsPage() {
  const t = useTranslations("admin.settings");
  const tErrors = useTranslations("errorsApi");
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => apiFetch<SettingsResponse>("/api/admin/settings"),
  });

  const [maxValidityDays, setMaxValidityDays] = useState("");
  const [allowNeverExpire, setAllowNeverExpire] = useState(true);

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      const { patMaxValidityDays, patAllowNeverExpire } =
        settingsQuery.data.settings;
      setMaxValidityDays(
        patMaxValidityDays === null ? "" : String(patMaxValidityDays),
      );
      setAllowNeverExpire(patAllowNeverExpire);
    }
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<SettingsResponse>("/api/admin/settings", {
        method: "PATCH",
        body: {
          patMaxValidityDays: maxValidityDays.trim()
            ? Number.parseInt(maxValidityDays, 10)
            : null,
          patAllowNeverExpire: allowNeverExpire,
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-settings"], data);
      toastManager.add({
        type: "success",
        title: t("toast.successTitle"),
        description: t("toast.successDescription"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.errorTitle"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button variant="outline" render={<Link href="/admin" />}>
          {t("backToUsers")}
        </Button>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : settingsQuery.isError ? (
        <ErrorAlert error={settingsQuery.error} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("pat.title")}</CardTitle>
            <CardDescription>{t("pat.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              <Field>
                <FieldLabel htmlFor="pat-max-validity">{t("pat.maxValidityDays")}</FieldLabel>
                <Input
                  id="pat-max-validity"
                  type="number"
                  min={1}
                  placeholder={t("pat.maxValidityDaysPlaceholder")}
                  value={maxValidityDays}
                  onChange={(event) => setMaxValidityDays(event.target.value)}
                />
                <FieldDescription>{t("pat.maxValidityDaysHint")}</FieldDescription>
              </Field>
              <Field>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <FieldLabel htmlFor="pat-allow-never-expire">
                      {t("pat.allowNeverExpire")}
                    </FieldLabel>
                    <FieldDescription>
                      {t("pat.allowNeverExpireHint")}
                    </FieldDescription>
                  </div>
                  <Switch
                    id="pat-allow-never-expire"
                    checked={allowNeverExpire}
                    onCheckedChange={setAllowNeverExpire}
                  />
                </div>
              </Field>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-loading={mutation.isPending ? "" : undefined}
              >
                {mutation.isPending ? <Spinner /> : null}
                {t("saveChanges")}
              </Button>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
