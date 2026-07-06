// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { useRef } from "react";

import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
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
};

type UsersResponse = {
  users: AdminUserRow[];
};

export function AdminUsersPage() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch<UsersResponse>("/api/admin/users"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage local accounts and system roles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/admin/gc" />}>
            Garbage collection
          </Button>
          <Button type="button" onClick={() => dialogRef.current?.showModal()}>
            <PlusIcon />
            Create user
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

      {usersQuery.data ? (
        <AdminUsersTable users={usersQuery.data.users} />
      ) : null}

      <CreateUserDialog
        dialogRef={dialogRef}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        }}
      />
    </div>
  );
}
