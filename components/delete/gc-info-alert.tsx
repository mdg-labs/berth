// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type GcInfoAlertProps = {
  onDismiss?: () => void;
};

export function GcInfoAlert({ onDismiss }: GcInfoAlertProps) {
  const t = useTranslations("delete.gcInfo");

  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("message")}</span>
        {onDismiss ? (
          <button
            type="button"
            className="text-sm font-medium underline-offset-4 hover:underline"
            onClick={onDismiss}
          >
            {t("dismiss")}
          </button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
