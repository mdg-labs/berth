// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useState } from "react";

import { repositoryDeleteConfirmPhrase } from "@/components/delete/constants";
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

type RepositoryDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoName: string;
  tagCount: number;
  isPending?: boolean;
  onConfirm: () => void;
};

export function RepositoryDeleteDialog({
  open,
  onOpenChange,
  repoName,
  tagCount,
  isPending = false,
  onConfirm,
}: RepositoryDeleteDialogProps) {
  const [phrase, setPhrase] = useState("");
  const expectedPhrase = repositoryDeleteConfirmPhrase(repoName);
  const phraseMatches = phrase.trim() === expectedPhrase;

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
          <DialogTitle>Delete repository {repoName}?</DialogTitle>
          <DialogDescription>
            This deletes all {tagCount} tag{tagCount === 1 ? "" : "s"} and
            manifests in this repository. Type{" "}
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
            Delete repository
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
