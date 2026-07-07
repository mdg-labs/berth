// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, ApiError } from "@/lib/api/client";
import { toastManager } from "@/components/ui/toast";

type InviteUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
};

type InviteResponse = {
  invite: {
    id: string;
    email: string;
    name: string;
  };
  emailSent: boolean;
};

function resetFormState(
  setEmail: (value: string) => void,
  setName: (value: string) => void,
  setSystemRole: (value: "admin" | "user") => void,
) {
  setEmail("");
  setName("");
  setSystemRole("user");
}

export function InviteUserDialog({
  open,
  onOpenChange,
  onInvited,
}: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [systemRole, setSystemRole] = useState<"admin" | "user">("user");

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiFetch<InviteResponse>("/api/admin/invites", {
        method: "POST",
        body: {
          email,
          name,
          systemRole,
        },
      }),
    onSuccess: (data) => {
      toastManager.add({
        type: "success",
        title: "Invite sent",
        description: data.emailSent
          ? `${email} will receive an invite email shortly.`
          : `${email} was invited, but SMTP is not configured.`,
      });
      resetFormState(setEmail, setName, setSystemRole);
      onOpenChange(false);
      onInvited();
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to send invite",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next && !inviteMutation.isPending) {
      resetFormState(setEmail, setName, setSystemRole);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            Send an email invitation to join this Berth instance.
          </DialogDescription>
        </DialogHeader>
        <Form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            inviteMutation.mutate();
          }}
        >
          <div className="space-y-4 px-6 pb-2">
            <Fieldset className="space-y-4">
              <FieldsetLegend className="sr-only">Invite details</FieldsetLegend>
              <Field>
                <FieldLabel htmlFor="invite-user-email">Email</FieldLabel>
                <Input
                  id="invite-user-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-user-name">Name</FieldLabel>
                <Input
                  id="invite-user-name"
                  name="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>System role</FieldLabel>
                <RadioGroup
                  value={systemRole}
                  onValueChange={(value) =>
                    setSystemRole(value as "admin" | "user")
                  }
                  className="gap-2"
                >
                  <Label className="flex items-center gap-2 font-normal">
                    <Radio value="user" />
                    User
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <Radio value="admin" />
                    Admin
                  </Label>
                </RadioGroup>
              </Field>
            </Fieldset>
          </div>
          <DialogFooter variant="bare">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              data-loading={inviteMutation.isPending ? "" : undefined}
            >
              {inviteMutation.isPending ? <Spinner /> : null}
              Send invite
            </Button>
          </DialogFooter>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}
