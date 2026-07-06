// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useAuthUser } from "@/components/providers/auth-guard";
import { apiFetch } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toastManager } from "@/components/ui/toast";

type ReactivateResponse = {
  user: AuthUser;
};

export function ReactivateAccountCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useAuthUser();
  const user = data?.user;

  const reactivateMutation = useMutation({
    mutationFn: () =>
      apiFetch<ReactivateResponse>("/api/account/reactivate", {
        method: "POST",
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      toastManager.add({
        type: "success",
        title: "Account reactivated",
        description: "Your account has been restored.",
      });
      router.replace("/projects");
    },
    onError: () => {
      toastManager.add({
        type: "error",
        title: "Reactivation failed",
        description: "Could not restore your account.",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    },
  });

  if (!user?.pendingDeletion) {
    return null;
  }

  const purgeDate = user.purgesAt
    ? new Date(user.purgesAt).toLocaleString()
    : "soon";

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Reactivate your account?</CardTitle>
        <CardDescription>
          This account is scheduled for deletion on {purgeDate}. You can restore
          it now or sign out and leave the deletion in place.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          onClick={() => void reactivateMutation.mutate()}
          disabled={reactivateMutation.isPending}
          data-loading={reactivateMutation.isPending ? "" : undefined}
        >
          Reactivate account
        </Button>
        <Button
          variant="outline"
          onClick={() => void logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}
