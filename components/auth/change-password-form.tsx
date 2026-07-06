// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch, ApiError } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";

type ChangePasswordResponse = {
  user: AuthUser;
};

export function ChangePasswordForm() {
  const router = useRouter();
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
      toastManager.add({
        type: "success",
        title: "Password updated",
        description: "Your password has been changed.",
      });
      router.replace("/projects");
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

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Change your password
        </h1>
        <p className="text-sm text-muted-foreground">
          You must set a new password before continuing.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="current-password" className="text-sm font-medium">
            Current password
          </label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="new-password" className="text-sm font-medium">
            New password
          </label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-medium">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={mutation.isPending}
          data-loading={mutation.isPending ? "" : undefined}
        >
          {mutation.isPending ? <Spinner /> : null}
          Update password
        </Button>
      </form>
    </div>
  );
}
