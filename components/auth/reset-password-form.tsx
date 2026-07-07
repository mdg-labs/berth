// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, ApiError } from "@/lib/api/client";
import { toastManager } from "@/components/ui/toast";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const validationQuery = useQuery({
    queryKey: ["reset-password", token],
    queryFn: () =>
      apiFetch<{ email: string }>(
        `/api/auth/reset-password?token=${encodeURIComponent(token)}`,
      ),
    enabled: Boolean(token),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/api/auth/reset-password", {
        method: "POST",
        body: { token, password },
      }),
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: "Password updated",
        description: "You can now sign in with your new password.",
      });
      router.replace("/login");
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Reset failed",
        description:
          error instanceof ApiError ? error.message : "Something went wrong",
      });
    },
  });

  if (!token) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6 text-center shadow-xs">
        <p className="text-sm text-muted-foreground">Invalid reset link.</p>
        <Button render={<Link href="/forgot-password" />}>Request a new link</Button>
      </div>
    );
  }

  if (validationQuery.isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-xs">
        <Spinner />
      </div>
    );
  }

  if (validationQuery.isError) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6 text-center shadow-xs">
        <p className="text-sm text-muted-foreground">
          This reset link is invalid or has expired.
        </p>
        <Button render={<Link href="/forgot-password" />}>Request a new link</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 shadow-xs">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          Set a new password for {validationQuery.data?.email}.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirmPassword) {
            toastManager.add({
              type: "error",
              title: "Passwords do not match",
            });
            return;
          }
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <label htmlFor="reset-password" className="text-sm font-medium">
            New password
          </label>
          <input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="reset-password-confirm" className="text-sm font-medium">
            Confirm password
          </label>
          <input
            id="reset-password-confirm"
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
