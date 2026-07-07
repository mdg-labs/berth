// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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

type ImageDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageName: string;
  tagCount: number;
  resourceKind?: "repository" | "image";
  isPending?: boolean;
  onConfirm: () => void;
};

export function ImageDeleteDialog({
  open,
  onOpenChange,
  imageName,
  tagCount,
  resourceKind = "repository",
  isPending = false,
  onConfirm,
}: ImageDeleteDialogProps) {
  const t = useTranslations("delete.imageDelete");
  const tCommon = useTranslations("common.actions");
  const [phrase, setPhrase] = useState("");
  const expectedPhrase = t("confirmPhrase", { name: imageName });
  const phraseMatches = phrase.trim() === expectedPhrase;
  const kindLabel = t(`kind.${resourceKind}`);

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
          <DialogTitle>
            {t("title", { kind: kindLabel, name: imageName })}
          </DialogTitle>
          <DialogDescription>
            {t("description", {
              count: tagCount,
              kind: kindLabel,
              phrase: expectedPhrase,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 px-6">
          <Label htmlFor="repo-delete-phrase">{t("phraseLabel")}</Label>
          <Input
            id="repo-delete-phrase"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder={expectedPhrase}
            autoComplete="off"
          />
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
            {t("confirmButton", { kind: kindLabel })}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
