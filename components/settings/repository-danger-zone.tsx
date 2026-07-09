// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
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
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CSRF_HEADER, CSRF_VALUE } from "@/lib/csrf/constants";
import { formatApiError } from "@/lib/i18n/api-error";
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
  const t = useTranslations("settings.repositoryDanger");
  const tCommon = useTranslations("common.actions");
  const tErrors = useTranslations("errorsApi");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [force, setForce] = useState(false);
  const [conflict, setConflict] = useState<DeleteConflict | null>(null);
  const expectedPhrase = t("confirmPhrase", { name: repositoryName });

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
        throw new Error(body.error?.message ?? "conflict");
      }
    },
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: t("toast.success"),
        description: t("toast.successDescription", { name: repositoryName }),
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
        title: t("toast.error"),
        description: formatApiError(tErrors, error, "request_failed"),
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

  function copyConfirmPhrase() {
    void navigator.clipboard.writeText(expectedPhrase);
    toastManager.add({
      type: "success",
      title: t("dialog.copiedPhrase"),
      description: expectedPhrase,
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          {t("deleteButton")}
        </Button>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{t("dialog.title", { name: repositoryName })}</DialogTitle>
              <DialogDescription>
                {conflict
                  ? t("dialog.conflict", { images: conflict.images.join(", ") })
                  : t("dialog.blocked")}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-4">
              <Field>
                <FieldLabel htmlFor="repository-delete-phrase">
                  {t("dialog.confirmLabel", { phrase: expectedPhrase })}
                </FieldLabel>
                <div className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 font-mono text-sm">
                  <span className="min-w-0 flex-1 truncate">{expectedPhrase}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("dialog.copyPhrase")}
                    onClick={copyConfirmPhrase}
                  >
                    <CopyIcon />
                  </Button>
                </div>
                <Input
                  id="repository-delete-phrase"
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  placeholder={expectedPhrase}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <Label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={force}
                    onCheckedChange={(checked) => setForce(checked === true)}
                  />
                  {t("dialog.forceLabel")}
                </Label>
                {force ? (
                  <FieldDescription>{t("dialog.forceDescription")}</FieldDescription>
                ) : null}
              </Field>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>
                {tCommon("cancel")}
              </DialogClose>
              <Button
                variant="destructive"
                disabled={!phraseMatches || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ force })}
              >
                {force ? t("dialog.forceButton") : t("deleteButton")}
              </Button>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      </CardContent>
    </Card>
  );
}
