// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@/components/ui/autocomplete";
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
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthUser } from "@/components/providers/auth-guard";
import { apiFetch } from "@/lib/api/client";
import { formatApiError } from "@/lib/i18n/api-error";
import { Link } from "@/lib/i18n/navigation";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import type { RepositoryRole } from "@/lib/rbac/types";
import { toastManager } from "@/components/ui/toast";

type MemberListEntry =
  | {
      type: "user";
      userId: string;
      email: string;
      name: string;
      role: RepositoryRole;
      joinedAt: string;
      accountStatus: "active" | "pending_deletion";
    }
  | {
      type: "invite";
      inviteId: string;
      email: string;
      role: RepositoryRole;
      invitedAt: string;
    };

type MembersResponse = {
  members: MemberListEntry[];
};

type MemberCandidate = {
  id: string;
  email: string;
  name: string;
};

type MemberCandidatesResponse = {
  users: MemberCandidate[];
};

const ROLE_OPTIONS: RepositoryRole[] = [
  "guest",
  "developer",
  "maintainer",
  "admin",
];

type RepositoryMembersSectionProps = {
  repositoryId: string;
};

export function RepositoryMembersSection({ repositoryId }: RepositoryMembersSectionProps) {
  const t = useTranslations("settings.members");
  const tRoles = useTranslations("roles.repository");
  const tErrors = useTranslations("errorsApi");
  const queryClient = useQueryClient();
  const { data: authData } = useAuthUser();
  const userSearchId = useId();
  const roleId = useId();
  const [searchValue, setSearchValue] = useState("");
  const [selectedUser, setSelectedUser] = useState<MemberCandidate | null>(null);
  const [role, setRole] = useState<RepositoryRole>("developer");
  const debouncedSearch = useDebouncedValue(searchValue, 300);
  const isSystemAdmin = authData?.user.systemRole === "admin";

  const membersQuery = useQuery({
    queryKey: ["repository-members", repositoryId],
    queryFn: () =>
      apiFetch<MembersResponse>(`/api/repositories/${repositoryId}/members`),
  });

  const candidatesQuery = useQuery({
    queryKey: ["member-candidates", repositoryId, debouncedSearch],
    queryFn: () =>
      apiFetch<MemberCandidatesResponse>(
        `/api/repositories/${repositoryId}/member-candidates?q=${encodeURIComponent(debouncedSearch)}`,
      ),
    enabled: debouncedSearch.trim().length >= 2,
  });

  const candidates = candidatesQuery.data?.users ?? [];

  const addMutation = useMutation({
    mutationFn: (input: { userId: string; role: RepositoryRole }) =>
      apiFetch<{ member: { type: string } }>(
        `/api/repositories/${repositoryId}/members`,
        {
          method: "POST",
          body: input,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repository-members", repositoryId] });
      void queryClient.invalidateQueries({ queryKey: ["member-candidates", repositoryId] });
      setSearchValue("");
      setSelectedUser(null);
      toastManager.add({
        type: "success",
        title: t("toast.added"),
        description: t("toast.memberAdded"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.addError"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: RepositoryRole }) =>
      apiFetch(`/api/repositories/${repositoryId}/members/${input.userId}`, {
        method: "PATCH",
        body: { role: input.role },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repository-members", repositoryId] });
      toastManager.add({
        type: "success",
        title: t("toast.roleUpdated"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.roleError"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/repositories/${repositoryId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repository-members", repositoryId] });
      toastManager.add({
        type: "success",
        title: t("toast.removed"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.removeError"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const removeInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch(`/api/repositories/${repositoryId}/invites/${inviteId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repository-members", repositoryId] });
      toastManager.add({
        type: "success",
        title: t("toast.inviteRemoved"),
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: t("toast.inviteRemoveError"),
        description: formatApiError(tErrors, error, "request_failed"),
      });
    },
  });

  const pendingInvites =
    membersQuery.data?.members.filter((entry) => entry.type === "invite") ?? [];

  function handleSelectUser(user: MemberCandidate) {
    setSelectedUser(user);
    setSearchValue(user.email);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {pendingInvites.length > 0 ? (
          <Alert variant="warning">
            <AlertTitle>{t("pendingAlert.title")}</AlertTitle>
            <AlertDescription>{t("pendingAlert.description")}</AlertDescription>
          </Alert>
        ) : null}

        <Form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedUser) {
              toastManager.add({
                type: "error",
                title: t("toast.addError"),
                description: t("selectUserRequired"),
              });
              return;
            }
            addMutation.mutate({ userId: selectedUser.id, role });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor={userSearchId}>{t("userLabel")}</FieldLabel>
              <Autocomplete
                items={candidates}
                mode="none"
                value={searchValue}
                onValueChange={(value) => {
                  setSearchValue(value);
                  if (selectedUser && value !== selectedUser.email) {
                    setSelectedUser(null);
                  }
                }}
                itemToStringValue={(user) => user.email}
                openOnInputClick
              >
                <AutocompleteInput
                  id={userSearchId}
                  name="userSearch"
                  required
                  placeholder={t("userPlaceholder")}
                  showClear
                  startAddon={<SearchIcon aria-hidden="true" />}
                />
                <AutocompletePopup>
                  <AutocompleteEmpty>
                    {debouncedSearch.trim().length < 2
                      ? t("searchMinLength")
                      : candidatesQuery.isFetching
                        ? t("searching")
                        : t("noUsersFound")}
                  </AutocompleteEmpty>
                  {debouncedSearch.trim().length >= 2 &&
                  !candidatesQuery.isFetching &&
                  candidates.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {isSystemAdmin
                        ? t.rich("createUserHint", {
                            adminLink: (chunks) => (
                              <Link href="/admin" className="text-primary underline">
                                {chunks}
                              </Link>
                            ),
                          })
                        : t("createUserHintNoAccess")}
                    </p>
                  ) : null}
                  <AutocompleteList>
                    {(user) => (
                      <AutocompleteItem
                        key={user.id}
                        value={user}
                        onClick={() => handleSelectUser(user)}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{user.email}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.name}
                          </p>
                        </div>
                      </AutocompleteItem>
                    )}
                  </AutocompleteList>
                </AutocompletePopup>
              </Autocomplete>
            </Field>
            <Field>
              <FieldLabel htmlFor={roleId}>{t("roleLabel")}</FieldLabel>
              <Select
                value={role}
                onValueChange={(value) => {
                  if (value) {
                    setRole(value as RepositoryRole);
                  }
                }}
              >
                <SelectTrigger id={roleId} className="min-w-36">
                  <SelectValue>{tRoles(role)}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {tRoles(option)}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Button
              type="submit"
              disabled={addMutation.isPending || !selectedUser}
              data-loading={addMutation.isPending ? "" : undefined}
            >
              {addMutation.isPending ? <Spinner /> : <PlusIcon />}
              {t("addMember")}
            </Button>
          </div>
        </Form>

        {membersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : null}

        {membersQuery.data?.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}

        {membersQuery.data && membersQuery.data.members.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.email")}</TableHead>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.role")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("table.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.data.members.map((entry) => (
                <TableRow
                  key={entry.type === "user" ? entry.userId : entry.inviteId}
                >
                  <TableCell className="font-medium">{entry.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.type === "user" ? entry.name : "—"}
                  </TableCell>
                  <TableCell>
                    {entry.type === "user" ? (
                      <Select
                        value={entry.role}
                        onValueChange={(value) => {
                          if (!value) {
                            return;
                          }
                          roleMutation.mutate({
                            userId: entry.userId,
                            role: value as RepositoryRole,
                          });
                        }}
                      >
                        <SelectTrigger className="min-w-28" size="sm">
                          <SelectValue>{tRoles(entry.role)}</SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                          {ROLE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {tRoles(option)}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    ) : (
                      <Badge variant="outline">{tRoles(entry.role)}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.type === "invite" ? (
                      <Badge
                        variant="secondary"
                        title={t("pendingSince", {
                          date: new Date(entry.invitedAt).toLocaleDateString(),
                        })}
                      >
                        {t("pending")}
                      </Badge>
                    ) : entry.accountStatus === "pending_deletion" ? (
                      <Badge
                        variant="destructive"
                        title={t("joinedSince", {
                          date: new Date(entry.joinedAt).toLocaleDateString(),
                        })}
                      >
                        {t("accountDeleting")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        title={t("joinedSince", {
                          date: new Date(entry.joinedAt).toLocaleDateString(),
                        })}
                      >
                        {t("active")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("removeMember", { email: entry.email })}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
