// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

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
          <AlertDialogTitle>Delete tag {tagName}?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasSiblings ? (
              <>
                This tag shares digest{" "}
                <span className="font-medium text-foreground">
                  {siblings.length} other tag{siblings.length === 1 ? "" : "s"}
                </span>
                : {siblings.join(", ")}. Deleting this tag removes only the{" "}
                <span className="font-medium text-foreground">{tagName}</span>{" "}
                reference; sibling tags remain until they are deleted separately.
              </>
            ) : (
              "This removes the tag reference from the repository. The action cannot be undone."
            )}
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
            <span>I understand sibling tags will remain.</span>
          </label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            Cancel
          </AlertDialogClose>
          <Button
            variant="destructive"
            disabled={isPending || (hasSiblings && !acknowledged)}
            onClick={onConfirm}
          >
            Delete tag
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
