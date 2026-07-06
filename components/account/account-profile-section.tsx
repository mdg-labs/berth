// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useAuthUser } from "@/components/providers/auth-guard";
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

type AccountResponse = {
  user: AuthUser;
};

export function AccountProfileSection() {
  const queryClient = useQueryClient();
  const { data } = useAuthUser();
  const user = data?.user;

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: () => {
      const body: {
        name?: string;
        email?: string;
        currentPassword?: string;
      } = {};

      if (name !== user!.name) {
        body.name = name;
      }

      if (email !== user!.email) {
        body.email = email;
        body.currentPassword = currentPassword;
      }

      return apiFetch<AccountResponse>("/api/account", {
        method: "PATCH",
        body,
      });
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["auth", "me"], response);
      setCurrentPassword("");
      toastManager.add({
        type: "success",
        title: "Profile updated",
        description: "Your account details were saved.",
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Update failed",
        description:
          error instanceof ApiError ? error.message : "Request failed",
      });
    },
  });

  if (!user) {
    return null;
  }

  const readOnly = !user.hasPassword;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          {readOnly
            ? "Your account is managed by your identity provider."
            : "Update your display name and email address."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (readOnly) {
              return;
            }

            const nameChanged = name !== user.name;
            const emailChanged = email !== user.email;
            if (!nameChanged && !emailChanged) {
              return;
            }

            mutation.mutate();
          }}
        >
          <Field>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              value={name}
              disabled={readOnly}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input
              id="profile-email"
              type="email"
              value={email}
              disabled={readOnly}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          {!readOnly && email !== user.email ? (
            <Field>
              <FieldLabel htmlFor="profile-current-password">
                Current password
              </FieldLabel>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <FieldDescription>
                Required when changing your email address.
              </FieldDescription>
            </Field>
          ) : null}
          {!readOnly ? (
            <Button
              type="submit"
              disabled={mutation.isPending}
              data-loading={mutation.isPending ? "" : undefined}
            >
              {mutation.isPending ? <Spinner /> : null}
              Save changes
            </Button>
          ) : null}
        </Form>
      </CardContent>
    </Card>
  );
}
