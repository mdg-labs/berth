// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useState } from "react";

import { imageDeleteConfirmPhrase } from "@/components/delete/constants";
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
  const [phrase, setPhrase] = useState("");
  const expectedPhrase = imageDeleteConfirmPhrase(imageName);
  const phraseMatches = phrase.trim() === expectedPhrase;
  const resourceLabel = resourceKind === "image" ? "image" : "repository";

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
            Delete {resourceLabel} {imageName}?
          </DialogTitle>
          <DialogDescription>
            This deletes all {tagCount} tag{tagCount === 1 ? "" : "s"} and
            manifests in this {resourceLabel}. Type{" "}
            <span className="font-mono text-foreground">{expectedPhrase}</span>{" "}
            to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 px-6">
          <Label htmlFor="repo-delete-phrase">Confirmation phrase</Label>
          <Input
            id="repo-delete-phrase"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder={expectedPhrase}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={isPending || !phraseMatches}
            onClick={onConfirm}
          >
            Delete {resourceLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
