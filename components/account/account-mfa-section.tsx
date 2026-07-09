// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { OTPField, OTPFieldInput } from "@/components/ui/otp-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";

type MfaStatusResponse = {
  enabled: boolean;
  pendingSetup: boolean;
};

type MfaSetupResponse = {
  qrDataUrl: string;
  secret: string;
  issuer: string;
  accountName: string;
};

type MfaConfirmResponse = {
  backupCodes: string[];
};

export function AccountMfaSection() {
  const queryClient = useQueryClient();
  const t = useTranslations("account.mfa");
  const tErrors = useTranslations("errorsApi");
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [backupCodesOpen, setBackupCodesOpen] = useState(false);
  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [displayedBackupCodes, setDisplayedBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenPassword, setRegenPassword] = useState("");
  const [regenCode, setRegenCode] = useState("");

  const statusQuery = useQuery({
    queryKey: ["account", "mfa"],
    queryFn: () => apiFetch<MfaStatusResponse>("/api/account/mfa"),
  });

  const setupMutation = useMutation({
    mutationFn: () =>
      apiFetch<MfaSetupResponse>("/api/account/mfa/setup", { method: "POST" }),
    onSuccess: (data) => {
      setSetupData(data);
      setConfirmCode("");
      setSetupOpen(true);
      void statusQuery.refetch();
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.setupErrorTitle"),
        description: formatApiError(tErrors, error, "generic"),
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (code: string) =>
      apiFetch<MfaConfirmResponse>("/api/account/mfa/confirm", {
        method: "POST",
        body: { code },
      }),
    onSuccess: (data) => {
      setSetupOpen(false);
      setSetupData(null);
      setConfirmCode("");
      setDisplayedBackupCodes(data.backupCodes);
      setBackupCodesOpen(true);
      void statusQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toastManager.add({
        type: "success",
        title: t("toast.enabledTitle"),
        description: t("toast.enabledDescription"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.confirmErrorTitle"),
        description: formatApiError(tErrors, error, "generic"),
      });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (input: { password: string; code: string }) =>
      apiFetch<{ ok: true }>("/api/account/mfa", {
        method: "DELETE",
        body: input,
      }),
    onSuccess: () => {
      setDisableOpen(false);
      setDisablePassword("");
      setDisableCode("");
      void statusQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toastManager.add({
        type: "success",
        title: t("toast.disabledTitle"),
        description: t("toast.disabledDescription"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.disableErrorTitle"),
        description: formatApiError(tErrors, error, "generic"),
      });
    },
  });

  const regenMutation = useMutation({
    mutationFn: (input: { password: string; code: string }) =>
      apiFetch<MfaConfirmResponse>("/api/account/mfa/backup-codes", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data) => {
      setDisplayedBackupCodes(data.backupCodes);
      setBackupCodesOpen(true);
      setRegenPassword("");
      setRegenCode("");
      toastManager.add({
        type: "success",
        title: t("toast.backupCodesTitle"),
        description: t("toast.backupCodesDescription"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.backupCodesErrorTitle"),
        description: formatApiError(tErrors, error, "generic"),
      });
    },
  });

  const enabled = statusQuery.data?.enabled ?? false;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheckIcon className="size-4" />
                {t("title")}
              </CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
            {statusQuery.isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <Badge variant={enabled ? "default" : "secondary"}>
                {enabled ? t("status.enabled") : t("status.disabled")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusQuery.error ? (
            <ErrorAlert
              title={t("loadErrorTitle")}
              error={statusQuery.error}
            />
          ) : null}

          {enabled ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRegenPassword("");
                  setRegenCode("");
                  setBackupCodesOpen(true);
                }}
              >
                {t("regenerateBackupCodes")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setDisablePassword("");
                  setDisableCode("");
                  setDisableOpen(true);
                }}
              >
                {t("disable")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              disabled={setupMutation.isPending || statusQuery.isLoading}
              data-loading={setupMutation.isPending ? "" : undefined}
              onClick={() => setupMutation.mutate()}
            >
              {setupMutation.isPending ? <Spinner /> : null}
              {t("enable")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("setup.title")}</DialogTitle>
            <DialogDescription>{t("setup.description")}</DialogDescription>
          </DialogHeader>
          {setupData ? (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border bg-background p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupData.qrDataUrl}
                  alt={t("setup.qrAlt")}
                  className="size-44"
                />
              </div>
              <Field>
                <FieldLabel>{t("setup.manualSecret")}</FieldLabel>
                <Input readOnly value={setupData.secret} className="font-mono" />
                <FieldDescription>
                  {t("setup.manualHint", {
                    issuer: setupData.issuer,
                    account: setupData.accountName,
                  })}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("setup.confirmCode")}</FieldLabel>
                <OTPField
                  aria-label={t("setup.confirmCode")}
                  length={6}
                  value={confirmCode}
                  onValueChange={setConfirmCode}
                >
                  {Array.from({ length: 6 }).map((_, index) => (
                    <OTPFieldInput
                      key={index}
                      aria-label={
                        index === 0
                          ? undefined
                          : t("setup.codeSlot", { index: index + 1 })
                      }
                    />
                  ))}
                </OTPField>
              </Field>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSetupOpen(false)}>
              {t("setup.cancel")}
            </Button>
            <Button
              type="button"
              disabled={confirmMutation.isPending || confirmCode.length !== 6}
              data-loading={confirmMutation.isPending ? "" : undefined}
              onClick={() => confirmMutation.mutate(confirmCode)}
            >
              {confirmMutation.isPending ? <Spinner /> : null}
              {t("setup.confirm")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("disableDialog.title")}</DialogTitle>
            <DialogDescription>{t("disableDialog.description")}</DialogDescription>
          </DialogHeader>
          <Form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              disableMutation.mutate({
                password: disablePassword,
                code: disableCode,
              });
            }}
          >
            <Field>
              <FieldLabel htmlFor="disable-password">
                {t("disableDialog.password")}
              </FieldLabel>
              <Input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>{t("disableDialog.code")}</FieldLabel>
              <OTPField
                aria-label={t("disableDialog.code")}
                length={6}
                value={disableCode}
                onValueChange={setDisableCode}
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <OTPFieldInput
                    key={index}
                    aria-label={
                      index === 0
                        ? undefined
                        : t("setup.codeSlot", { index: index + 1 })
                    }
                  />
                ))}
              </OTPField>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>
                {t("disableDialog.cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={disableMutation.isPending || disableCode.length !== 6}
                data-loading={disableMutation.isPending ? "" : undefined}
              >
                {disableMutation.isPending ? <Spinner /> : null}
                {t("disableDialog.submit")}
              </Button>
            </DialogFooter>
          </Form>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={backupCodesOpen}
        onOpenChange={(open) => {
          setBackupCodesOpen(open);
          if (!open) {
            setDisplayedBackupCodes([]);
            setRegenPassword("");
            setRegenCode("");
          }
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("backupCodes.title")}</DialogTitle>
            <DialogDescription>{t("backupCodes.description")}</DialogDescription>
          </DialogHeader>
          {displayedBackupCodes.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-4 font-mono text-sm">
              {displayedBackupCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
          ) : (
            <Form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                regenMutation.mutate({
                  password: regenPassword,
                  code: regenCode,
                });
              }}
            >
              <Field>
                <FieldLabel htmlFor="regen-password">
                  {t("backupCodes.password")}
                </FieldLabel>
                <Input
                  id="regen-password"
                  type="password"
                  autoComplete="current-password"
                  value={regenPassword}
                  onChange={(event) => setRegenPassword(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("backupCodes.code")}</FieldLabel>
                <OTPField
                  aria-label={t("backupCodes.code")}
                  length={6}
                  value={regenCode}
                  onValueChange={setRegenCode}
                >
                  {Array.from({ length: 6 }).map((_, index) => (
                    <OTPFieldInput
                      key={index}
                      aria-label={
                        index === 0
                          ? undefined
                          : t("setup.codeSlot", { index: index + 1 })
                      }
                    />
                  ))}
                </OTPField>
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBackupCodesOpen(false)}
                >
                  {t("backupCodes.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={regenMutation.isPending || regenCode.length !== 6}
                  data-loading={regenMutation.isPending ? "" : undefined}
                >
                  {regenMutation.isPending ? <Spinner /> : null}
                  {t("backupCodes.submit")}
                </Button>
              </DialogFooter>
            </Form>
          )}
          {displayedBackupCodes.length > 0 ? (
            <DialogFooter>
              <Button type="button" onClick={() => setBackupCodesOpen(false)}>
                {t("backupCodes.done")}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogPopup>
      </Dialog>
    </>
  );
}
