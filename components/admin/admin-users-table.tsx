// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { AdminUserRow } from "./admin-users-page";

type AdminUsersTableProps = {
  users: AdminUserRow[];
};

export function AdminUsersTable({ users }: AdminUsersTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Auth</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.systemRole === "admin" ? "default" : "secondary"}>
                  {user.systemRole}
                </Badge>
              </TableCell>
              <TableCell>
                {user.hasPassword ? (
                  user.mustChangePassword ? (
                    <Badge variant="secondary">Password reset required</Badge>
                  ) : (
                    <Badge variant="secondary">Local</Badge>
                  )
                ) : (
                  <Badge variant="secondary">OIDC</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
