// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MACHINE_ACCOUNT_MAX_REPOSITORIES } from "@/lib/machine-accounts/config";

export type HostAccountRepositoryOption = { id: string; name: string };

export type HostAccountRepositoryError = "required" | "tooMany" | null;

export function hostAccountRepositoryError(
  selectedIds: string[],
): HostAccountRepositoryError {
  if (selectedIds.length === 0) {
    return "required";
  }
  return selectedIds.length > MACHINE_ACCOUNT_MAX_REPOSITORIES ? "tooMany" : null;
}

type HostAccountRepositoryPickerProps = {
  repositories: HostAccountRepositoryOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  showError: boolean;
};

export function HostAccountRepositoryPicker({
  repositories,
  selectedIds,
  onChange,
  showError,
}: HostAccountRepositoryPickerProps) {
  const t = useTranslations("admin.machineAccounts.hostForm");
  const filterId = useId();
  const [filter, setFilter] = useState("");
  const error = showError ? hostAccountRepositoryError(selectedIds) : null;
  const needle = filter.trim().toLowerCase();
  const visible = repositories.filter(
    (repository) =>
      needle === "" ||
      repository.name.toLowerCase().includes(needle) ||
      selectedIds.includes(repository.id),
  );

  return (
    <Fieldset className="flex flex-col gap-2">
      <FieldsetLegend className="font-medium text-base/4.5 sm:text-sm/4">
        {t("repositories")}
      </FieldsetLegend>
      <Input
        id={filterId}
        type="search"
        value={filter}
        aria-label={t("filterRepositories")}
        placeholder={t("filterRepositories")}
        autoComplete="off"
        onChange={(event) => setFilter(event.target.value)}
      />
      <div
        className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3"
        tabIndex={-1}
      >
        {visible.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noRepositories")}</p>
        ) : (
          visible.map((repository) => (
            <Label
              key={repository.id}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={selectedIds.includes(repository.id)}
                aria-invalid={error !== null || undefined}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...selectedIds, repository.id]
                      : selectedIds.filter((id) => id !== repository.id),
                  )
                }
              />
              {repository.name}
            </Label>
          ))
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {t("selectedCount", { count: selectedIds.length })}
      </p>
      {error ? (
        <p role="alert" className="text-destructive-foreground text-xs">
          {error === "required"
            ? t("errors.repositoriesRequired")
            : t("errors.repositoriesTooMany", {
                max: MACHINE_ACCOUNT_MAX_REPOSITORIES,
              })}
        </p>
      ) : null}
    </Fieldset>
  );
}
