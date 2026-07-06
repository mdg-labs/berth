// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation } from "@tanstack/react-query";
import { type RefObject, useState } from "react";

import type { AdminUserRow } from "@/components/admin/admin-users-page";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, ApiError } from "@/lib/api/client";
import { toastManager } from "@/components/ui/toast";

type CreateUserDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onCreated: () => void;
};

type CreateUserResponse = {
  user: AdminUserRow;
};

export function CreateUserDialog({ dialogRef, onCreated }: CreateUserDialogProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [systemRole, setSystemRole] = useState<"admin" | "user">("user");

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreateUserResponse>("/api/admin/users", {
        method: "POST",
        body: {
          email,
          name,
          password: password.trim() || undefined,
          systemRole,
        },
      }),
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: "User created",
        description: password.trim()
          ? `${email} can sign in with the provided password.`
          : `${email} must change password on first login.`,
      });
      setEmail("");
      setName("");
      setPassword("");
      setSystemRole("user");
      dialogRef.current?.close();
      onCreated();
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to create user",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-lg rounded-xl border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/40 open:flex open:flex-col"
    >
      <Form
        className="space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Create local user</h2>
          <p className="text-sm text-muted-foreground">
            Leave password empty to auto-generate one and require a change on
            first login.
          </p>
        </div>

        <Fieldset className="space-y-4">
          <FieldsetLegend className="sr-only">User details</FieldsetLegend>
          <Field>
            <FieldLabel htmlFor="create-user-email">Email</FieldLabel>
            <Input
              id="create-user-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-user-name">Name</FieldLabel>
            <Input
              id="create-user-name"
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-user-password">Password</FieldLabel>
            <Input
              id="create-user-password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldDescription>Optional — auto-generated when blank.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>System role</FieldLabel>
            <RadioGroup
              value={systemRole}
              onValueChange={(value) => setSystemRole(value as "admin" | "user")}
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

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            data-loading={createMutation.isPending ? "" : undefined}
          >
            {createMutation.isPending ? <Spinner /> : null}
            Create user
          </Button>
        </div>
      </Form>
    </dialog>
  );
}
