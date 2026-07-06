// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";

import { PENDING_INVITE_UNVERIFIED_MESSAGE } from "@/components/settings/constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldLabel,
} from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectButton,
  SelectItem,
  SelectPopup,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, ApiError } from "@/lib/api/client";
import type { ProjectRole } from "@/lib/rbac/types";
import { toastManager } from "@/components/ui/toast";

type MemberListEntry =
  | {
      type: "user";
      userId: string;
      email: string;
      name: string;
      role: ProjectRole;
      joinedAt: string;
    }
  | {
      type: "invite";
      inviteId: string;
      email: string;
      role: ProjectRole;
      invitedAt: string;
    };

type MembersResponse = {
  members: MemberListEntry[];
};

const ROLE_OPTIONS: ProjectRole[] = [
  "guest",
  "developer",
  "maintainer",
  "admin",
];

type ProjectMembersSectionProps = {
  projectId: string;
};

export function ProjectMembersSection({ projectId }: ProjectMembersSectionProps) {
  const queryClient = useQueryClient();
  const emailId = useId();
  const roleId = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("developer");

  const membersQuery = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () =>
      apiFetch<MembersResponse>(`/api/projects/${projectId}/members`),
  });

  const addMutation = useMutation({
    mutationFn: (input: { email: string; role: ProjectRole }) =>
      apiFetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      setEmail("");
      toastManager.add({
        type: "success",
        title: "Member added",
        description: "The member or invite was created.",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to add member",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: ProjectRole }) =>
      apiFetch(`/api/projects/${projectId}/members/${input.userId}`, {
        method: "PATCH",
        body: { role: input.role },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toastManager.add({
        type: "success",
        title: "Role updated",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to update role",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toastManager.add({
        type: "success",
        title: "Member removed",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to remove member",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  const removeInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch(`/api/projects/${projectId}/invites/${inviteId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toastManager.add({
        type: "success",
        title: "Invite removed",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to remove invite",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  const pendingInvites =
    membersQuery.data?.members.filter((entry) => entry.type === "invite") ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Add collaborators by email and assign project roles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {pendingInvites.length > 0 ? (
          <Alert variant="warning">
            <AlertTitle>Pending invites need attention</AlertTitle>
            <AlertDescription>{PENDING_INVITE_UNVERIFIED_MESSAGE}</AlertDescription>
          </Alert>
        ) : null}

        <Form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            addMutation.mutate({ email, role });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor={emailId}>Email</FieldLabel>
              <Input
                id={emailId}
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={roleId}>Role</FieldLabel>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as ProjectRole)}
              >
                <SelectButton id={roleId} className="min-w-36">
                  <SelectValue />
                </SelectButton>
                <SelectPopup>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Button
              type="submit"
              disabled={addMutation.isPending}
              data-loading={addMutation.isPending ? "" : undefined}
            >
              {addMutation.isPending ? <Spinner /> : <PlusIcon />}
              Add member
            </Button>
          </div>
        </Form>

        {membersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading members…</p>
        ) : null}

        {membersQuery.data?.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : null}

        <ul className="divide-y rounded-lg border">
          {membersQuery.data?.members.map((entry) => (
            <li
              key={entry.type === "user" ? entry.userId : entry.inviteId}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{entry.email}</p>
                {entry.type === "user" ? (
                  <p className="text-xs text-muted-foreground">{entry.name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Pending invite since{" "}
                    {new Date(entry.invitedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {entry.type === "invite" ? (
                  <Badge variant="secondary">Pending</Badge>
                ) : null}
                {entry.type === "user" ? (
                  <Select
                    value={entry.role}
                    onValueChange={(value) =>
                      roleMutation.mutate({
                        userId: entry.userId,
                        role: value as ProjectRole,
                      })
                    }
                  >
                    <SelectButton className="min-w-32" size="sm">
                      <SelectValue />
                    </SelectButton>
                    <SelectPopup>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                ) : (
                  <Badge>{entry.role}</Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${entry.email}`}
                  onClick={() => {
                    if (entry.type === "user") {
                      removeUserMutation.mutate(entry.userId);
                      return;
                    }
                    removeInviteMutation.mutate(entry.inviteId);
                  }}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
