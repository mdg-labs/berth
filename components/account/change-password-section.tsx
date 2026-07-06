// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch, ApiError } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";

type ChangePasswordSectionProps = {
  requireCurrentPassword?: boolean;
  embedded?: boolean;
  onSuccess?: (user: AuthUser) => void;
};

type ChangePasswordResponse = {
  user: AuthUser;
};

export function ChangePasswordSection({
  requireCurrentPassword = true,
  embedded = false,
  onSuccess,
}: ChangePasswordSectionProps) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { currentPassword?: string; newPassword: string }) =>
      apiFetch<ChangePasswordResponse>("/api/auth/change-password", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["auth", "me"], data);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toastManager.add({
        type: "success",
        title: "Password updated",
        description: "Your password has been changed.",
      });
      onSuccess?.(data.user);
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : "Password change failed";
      toastManager.add({
        type: "error",
        title: "Password change failed",
        description: message,
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toastManager.add({
        type: "error",
        title: "Passwords do not match",
        description: "Confirm password must match the new password.",
      });
      return;
    }

    mutation.mutate({
      currentPassword: currentPassword || undefined,
      newPassword,
    });
  }

  const form = (
        <Form className="space-y-4" onSubmit={handleSubmit}>
          {requireCurrentPassword ? (
            <Field>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            disabled={mutation.isPending}
            data-loading={mutation.isPending ? "" : undefined}
          >
            {mutation.isPending ? <Spinner /> : null}
            Update password
          </Button>
        </Form>
  );

  if (embedded) {
    return form;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Update your account password.</CardDescription>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
