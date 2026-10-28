// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MachineAccountExpiryPolicy = {
  patMaxValidityDays: number | null;
  patAllowNeverExpire: boolean;
};

export type ExpiryChoice = { mode: "never" | "custom"; date: string };

function effectiveChoice(
  choice: ExpiryChoice,
  policy: MachineAccountExpiryPolicy | undefined,
): ExpiryChoice {
  return choice.mode === "never" && policy?.patAllowNeverExpire === false
    ? { ...choice, mode: "custom" }
    : choice;
}

export function initialExpiryChoice(
  policy: MachineAccountExpiryPolicy | undefined,
): ExpiryChoice {
  return {
    mode: policy && !policy.patAllowNeverExpire ? "custom" : "never",
    date: "",
  };
}

function utcDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function expiryDateBounds(policy: MachineAccountExpiryPolicy | undefined): {
  min: string;
  max: string | undefined;
} {
  const now = Date.now();
  return {
    min: utcDate(now),
    max:
      policy && policy.patMaxValidityDays !== null
        ? utcDate(now + policy.patMaxValidityDays * DAY_MS)
        : undefined,
  };
}

export function isExpiryChoiceValid(
  rawChoice: ExpiryChoice,
  policy: MachineAccountExpiryPolicy | undefined,
): boolean {
  const choice = effectiveChoice(rawChoice, policy);
  if (choice.mode === "never") {
    return true;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choice.date)) {
    return false;
  }
  const { min, max } = expiryDateBounds(policy);
  return choice.date >= min && (max === undefined || choice.date <= max);
}

// End of the chosen UTC day, held below the policy ceiling so a date on the
// last allowed day is not rejected by a few hours.
export function expiryChoiceToTimestamp(
  rawChoice: ExpiryChoice,
  policy: MachineAccountExpiryPolicy | undefined,
): string | null {
  const choice = effectiveChoice(rawChoice, policy);
  if (choice.mode === "never") {
    return null;
  }
  let timestamp = new Date(`${choice.date}T23:59:59.999Z`).getTime();
  if (policy && policy.patMaxValidityDays !== null) {
    timestamp = Math.min(
      timestamp,
      Date.now() + policy.patMaxValidityDays * DAY_MS - 60_000,
    );
  }
  return new Date(timestamp).toISOString();
}

type MachineAccountExpiryFieldProps = {
  choice: ExpiryChoice;
  onChange: (choice: ExpiryChoice) => void;
  policy: MachineAccountExpiryPolicy | undefined;
  showError: boolean;
};

export function MachineAccountExpiryField({
  choice: rawChoice,
  onChange,
  policy,
  showError,
}: MachineAccountExpiryFieldProps) {
  const t = useTranslations("settings.machineAccounts.expiry");
  const { min, max } = expiryDateBounds(policy);
  const allowNever = policy?.patAllowNeverExpire !== false;
  const choice = effectiveChoice(rawChoice, policy);

  return (
    <Field invalid={showError && !isExpiryChoiceValid(choice, policy)}>
      <FieldLabel>{t("label")}</FieldLabel>
      <RadioGroup
        value={choice.mode}
        onValueChange={(value) =>
          onChange({ ...choice, mode: value as ExpiryChoice["mode"] })
        }
      >
        {allowNever ? (
          <Label className="flex items-center gap-2">
            <Radio value="never" />
            {t("never")}
          </Label>
        ) : null}
        <Label className="flex items-center gap-2">
          <Radio value="custom" />
          {t("custom")}
        </Label>
      </RadioGroup>
      {choice.mode === "custom" ? (
        <Input
          className="mt-2"
          type="date"
          aria-label={t("date")}
          min={min}
          max={max}
          value={choice.date}
          onChange={(event) => onChange({ ...choice, date: event.target.value })}
        />
      ) : null}
      <FieldError match={showError && !isExpiryChoiceValid(choice, policy)}>
        {t("invalid")}
      </FieldError>
      {policy?.patMaxValidityDays ? (
        <FieldDescription>
          {t("maxValidityHint", { days: policy.patMaxValidityDays })}
        </FieldDescription>
      ) : null}
    </Field>
  );
}
