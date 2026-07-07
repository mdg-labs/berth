// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { MailIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { InviteUserDialog } from "@/components/admin/invite-user-dialog";
import { ErrorAlert } from "@/components/catalog/error-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  systemRole: "admin" | "user";
  hasPassword: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  status: "active" | "pending_deletion";
  deletedAt: string | null;
  purgesAt: string | null;
};

type UsersResponse = {
  users: AdminUserRow[];
  meta: { deleteGracePeriodDays: number };
};

export function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch<UsersResponse>("/api/admin/users"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/admin/gc" />}>
            {t("garbageCollection")}
          </Button>
          <Button type="button" onClick={() => setInviteOpen(true)}>
            <MailIcon />
            {t("inviteUser")}
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            {t("createUser")}
          </Button>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {usersQuery.isError ? (
        <ErrorAlert
          title={t("loadError")}
          error={usersQuery.error}
          onRetry={() => void usersQuery.refetch()}
        />
      ) : null}

      {usersQuery.data ? (
        <AdminUsersTable
          users={usersQuery.data.users}
          deleteGracePeriodDays={usersQuery.data.meta.deleteGracePeriodDays}
        />
      ) : null}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        }}
      />
      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => {
          void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        }}
      />
    </div>
  );
}
