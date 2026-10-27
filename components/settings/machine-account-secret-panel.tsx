// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { toastManager } from "@/components/ui/toast";

type MachineAccountSecretPanelProps = {
  secret: string;
  username: string;
};

export function MachineAccountSecretPanel({
  secret,
  username,
}: MachineAccountSecretPanelProps) {
  const t = useTranslations("settings.machineAccounts");
  const secretId = useId();
  const commandId = useId();
  const loginCommand = `echo '${secret}' | docker login ${window.location.host} -u '${username}' --password-stdin`;

  async function copyToClipboard(value: string, successTitle: string) {
    try {
      await navigator.clipboard.writeText(value);
      toastManager.add({ type: "success", title: successTitle });
    } catch {
      toastManager.add({
        type: "error",
        title: t("createdDialog.copyFailed"),
        description: t("createdDialog.copyFailedDescription"),
      });
    }
  }

  return (
    <>
      <Alert variant="warning">
        <AlertTitle>{t("createdDialog.warningTitle")}</AlertTitle>
        <AlertDescription>
          {t("createdDialog.warningDescription")}
        </AlertDescription>
      </Alert>
      <Field className="w-full">
        <FieldLabel htmlFor={secretId}>{t("createdDialog.secret")}</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={secretId}
            readOnly
            value={secret}
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("createdDialog.copySecret")}
              onClick={() =>
                void copyToClipboard(secret, t("createdDialog.secretCopied"))
              }
            >
              <CopyIcon />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field className="w-full">
        <FieldLabel htmlFor={commandId}>{t("createdDialog.command")}</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={commandId}
            readOnly
            value={loginCommand}
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("createdDialog.copyCommand")}
              onClick={() =>
                void copyToClipboard(
                  loginCommand,
                  t("createdDialog.commandCopied"),
                )
              }
            >
              <CopyIcon />
            </Button>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>
          {t("createdDialog.commandHint", { username })}
        </FieldDescription>
      </Field>
    </>
  );
}
