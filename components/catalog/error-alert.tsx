// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatApiError } from "@/lib/i18n/api-error";
import { useTranslations } from "next-intl";

type ErrorAlertProps = {
  title?: string;
  error?: unknown;
  message?: string;
  fallbackKey?: string;
  onRetry?: () => void;
};

export function ErrorAlert({
  title,
  error,
  message,
  fallbackKey = "generic",
  onRetry,
}: ErrorAlertProps) {
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors.api");

  const displayTitle = title ?? tCommon("error.title");
  const displayMessage =
    error !== undefined
      ? formatApiError(tErrors, error, fallbackKey)
      : (message ?? formatApiError(tErrors, undefined, fallbackKey));

  return (
    <Alert variant="error">
      <AlertTitle>{displayTitle}</AlertTitle>
      <AlertDescription>{displayMessage}</AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {tCommon("actions.retry")}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
