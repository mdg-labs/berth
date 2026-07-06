// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { InfoIcon } from "lucide-react";

import { GC_INFO_MESSAGE } from "@/components/delete/constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type GcInfoAlertProps = {
  onDismiss?: () => void;
};

export function GcInfoAlert({ onDismiss }: GcInfoAlertProps) {
  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>Garbage collection required</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{GC_INFO_MESSAGE}</span>
        {onDismiss ? (
          <button
            type="button"
            className="text-sm font-medium underline-offset-4 hover:underline"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
