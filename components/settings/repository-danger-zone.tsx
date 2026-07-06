// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CSRF_HEADER, CSRF_VALUE } from "@/lib/csrf/constants";
import { toastManager } from "@/components/ui/toast";

type RepositoryDangerZoneProps = {
  repositoryId: string;
  repositoryName: string;
};

type DeleteConflict = {
  images: string[];
};

export function RepositoryDangerZone({
  repositoryId,
  repositoryName,
}: RepositoryDangerZoneProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [force, setForce] = useState(false);
  const [conflict, setConflict] = useState<DeleteConflict | null>(null);
  const expectedPhrase = `delete ${repositoryName}`;

  const deleteMutation = useMutation({
    mutationFn: async (options: { force: boolean }) => {
      const response = await fetch(
        `/api/repositories/${repositoryId}?force=${options.force ? "true" : "false"}`,
        {
          method: "DELETE",
          headers: {
            [CSRF_HEADER]: CSRF_VALUE,
          },
          credentials: "same-origin",
        },
      );

      if (response.status === 409) {
        const body = (await response.json()) as {
          error?: { images?: string[]; message?: string };
        };
        const images = body.error?.images ?? [];
        throw Object.assign(new Error("conflict"), { images });
      }

      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? "Delete failed");
      }
    },
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: "Repository deleted",
        description: `${repositoryName} was removed.`,
      });
      router.replace("/repositories");
    },
    onError: (error) => {
      const images = (error as Error & { images?: string[] }).images;
      if (images && images.length > 0) {
        setConflict({ images });
        setForce(true);
        return;
      }

      toastManager.add({
        type: "error",
        title: "Failed to delete repository",
        description: error instanceof Error ? error.message : "Request failed",
      });
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPhrase("");
      setForce(false);
      setConflict(null);
    }
    setOpen(next);
  }

  const phraseMatches = phrase.trim() === expectedPhrase;

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
        <CardDescription>
          Permanently delete this repository and its metadata.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          Delete repository
        </Button>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Delete {repositoryName}?</DialogTitle>
              <DialogDescription>
                {conflict
                  ? `This repository still has images: ${conflict.images.join(", ")}. Enable force delete to remove them first.`
                  : "Deletion is blocked while non-empty images remain unless you force-delete."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6">
              <Field>
                <FieldLabel htmlFor="repository-delete-phrase">
                  Type{" "}
                  <span className="font-mono text-foreground">
                    {expectedPhrase}
                  </span>{" "}
                  to confirm
                </FieldLabel>
                <Input
                  id="repository-delete-phrase"
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={force}
                  onCheckedChange={(checked) => setForce(checked === true)}
                />
                Force delete (cascade-delete all images)
              </Label>
              {force ? (
                <FieldDescription>
                  Force delete removes every image and manifest in this
                  repository before deleting the repository record.
                </FieldDescription>
              ) : null}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
              <Button
                variant="destructive"
                disabled={!phraseMatches || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ force })}
              >
                {force ? "Force delete repository" : "Delete repository"}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </CardContent>
    </Card>
  );
}
