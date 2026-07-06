// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { apiFetch } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";

type MeResponse = {
  user: AuthUser;
};

export function useAuthUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<MeResponse>("/api/auth/me"),
    retry: false,
  });
}

export function AuthGuard({
  children,
  requirePasswordChange = false,
}: {
  children: React.ReactNode;
  requirePasswordChange?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, error, isLoading } = useAuthUser();
  const onReactivatePage = pathname === "/reactivate-account";

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (error || !data?.user) {
      router.replace("/login");
      return;
    }

    if (requirePasswordChange) {
      if (!data.user.mustChangePassword) {
        router.replace("/projects");
      }
      return;
    }

    if (data.user.mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    if (onReactivatePage) {
      if (!data.user.pendingDeletion) {
        router.replace("/projects");
      }
      return;
    }

    if (data.user.pendingDeletion) {
      router.replace("/reactivate-account");
    }
  }, [
    data,
    error,
    isLoading,
    onReactivatePage,
    requirePasswordChange,
    router,
  ]);

  if (isLoading || error || !data?.user) {
    return null;
  }

  if (requirePasswordChange && !data.user.mustChangePassword) {
    return null;
  }

  if (!requirePasswordChange && data.user.mustChangePassword) {
    return null;
  }

  if (onReactivatePage) {
    if (!data.user.pendingDeletion) {
      return null;
    }
    return <>{children}</>;
  }

  if (data.user.pendingDeletion) {
    return null;
  }

  return <>{children}</>;
}
