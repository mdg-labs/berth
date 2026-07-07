// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { BULK_DELETE_CONFIRM_THRESHOLD } from "@/components/delete/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BulkDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagNames: string[];
  isPending?: boolean;
  onConfirm: () => void;
};

export function BulkDeleteDialog({
  open,
  onOpenChange,
  tagNames,
  isPending = false,
  onConfirm,
}: BulkDeleteDialogProps) {
  const t = useTranslations("delete.bulkDelete");
  const tCommon = useTranslations("common.actions");
  const [phrase, setPhrase] = useState("");
  const confirmPhrase = t("confirmPhrase");
  const requiresTypedPhrase = tagNames.length > BULK_DELETE_CONFIRM_THRESHOLD;
  const phraseMatches =
    !requiresTypedPhrase ||
    phrase.trim().toLowerCase() === confirmPhrase.toLowerCase();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPhrase("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("title", { count: tagNames.length })}</DialogTitle>
          <DialogDescription>
            {requiresTypedPhrase
              ? t("typedConfirm", {
                  count: tagNames.length,
                  phrase: confirmPhrase,
                })
              : t("simpleConfirm", { count: tagNames.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6">
          <ul className="max-h-32 overflow-auto rounded-lg border p-3 text-sm">
            {tagNames.map((name) => (
              <li key={name} className="truncate font-mono">
                {name}
              </li>
            ))}
          </ul>
          {requiresTypedPhrase ? (
            <div className="space-y-2">
              <Label htmlFor="bulk-delete-phrase">{t("phraseLabel")}</Label>
              <Input
                id="bulk-delete-phrase"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder={confirmPhrase}
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {tCommon("cancel")}
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending || !phraseMatches}
            onClick={onConfirm}
          >
            {t("confirmButton")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
