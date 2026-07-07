// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DeleteTagDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagName: string;
  siblings: string[];
  isPending?: boolean;
  onConfirm: () => void;
};

export function DeleteTagDialog({
  open,
  onOpenChange,
  tagName,
  siblings,
  isPending = false,
  onConfirm,
}: DeleteTagDialogProps) {
  const t = useTranslations("delete.tagDelete");
  const tCommon = useTranslations("common.actions");
  const [acknowledged, setAcknowledged] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setAcknowledged(false);
    }
    onOpenChange(next);
  }

  const hasSiblings = siblings.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name: tagName })}</AlertDialogTitle>
          <AlertDialogDescription>
            {hasSiblings
              ? t("withSiblings", {
                  siblingCount: siblings.length,
                  siblings: siblings.join(", "),
                  name: tagName,
                })
              : t("simple")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasSiblings ? (
          <label className="flex items-start gap-2 px-6 pb-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{t("acknowledge")}</span>
          </label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            {tCommon("cancel")}
          </AlertDialogClose>
          <Button
            variant="destructive"
            disabled={isPending || (hasSiblings && !acknowledged)}
            onClick={onConfirm}
          >
            {t("confirmButton")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
