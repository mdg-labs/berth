// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useState } from "react";

import {
  BULK_DELETE_CONFIRM_PHRASE,
  BULK_DELETE_CONFIRM_THRESHOLD,
} from "@/components/delete/constants";
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
  const [phrase, setPhrase] = useState("");
  const requiresTypedPhrase = tagNames.length > BULK_DELETE_CONFIRM_THRESHOLD;
  const phraseMatches =
    !requiresTypedPhrase ||
    phrase.trim().toLowerCase() === BULK_DELETE_CONFIRM_PHRASE;

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
            Delete {tagNames.length} tag{tagNames.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            {requiresTypedPhrase
              ? `You are about to delete ${tagNames.length} tags. Type "${BULK_DELETE_CONFIRM_PHRASE}" to confirm.`
              : `This removes ${tagNames.length} tag reference${tagNames.length === 1 ? "" : "s"} from the image.`}
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
              <Label htmlFor="bulk-delete-phrase">Confirmation phrase</Label>
              <Input
                id="bulk-delete-phrase"
                value={phrase}
                onChange={(event) => setPhrase(event.target.value)}
                placeholder={BULK_DELETE_CONFIRM_PHRASE}
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={isPending || !phraseMatches}
            onClick={onConfirm}
          >
            Delete tags
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
