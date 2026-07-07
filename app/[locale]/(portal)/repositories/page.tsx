// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api/client";
import type { RepositorySummary } from "@/lib/api/types";
import { ErrorAlert } from "@/components/catalog/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";

type RepositoriesResponse = {
  repositories: RepositorySummary[];
};

type CreateRepositoryResponse = {
  repository: RepositorySummary;
};

function RepositoryListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function RepositoriesPage() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const repositoriesQuery = useQuery({
    queryKey: ["repositories"],
    queryFn: () => apiFetch<RepositoriesResponse>("/api/repositories"),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; isPublic: boolean }) =>
      apiFetch<CreateRepositoryResponse>("/api/repositories", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData<RepositoriesResponse>(["repositories"], (current) => ({
        repositories: [...(current?.repositories ?? []), data.repository].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      }));
      toastManager.add({
        type: "success",
        title: "Repository created",
        description: `${data.repository.name} is ready.`,
      });
      setName("");
      setIsPublic(false);
      dialogRef.current?.close();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : "Failed to create repository";
      toastManager.add({
        type: "error",
        title: "Create repository failed",
        description: message,
      });
    },
  });

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({ name, isPublic });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage registry repositories.
          </p>
        </div>
        <Button type="button" className="shrink-0" onClick={openDialog}>
          <PlusIcon />
          New repository
        </Button>
      </div>

      {repositoriesQuery.isLoading ? <RepositoryListSkeleton /> : null}

      {repositoriesQuery.isError ? (
        <ErrorAlert
          title="Failed to load repositories"
          message={
            repositoriesQuery.error instanceof Error
              ? repositoriesQuery.error.message
              : "Something went wrong"
          }
          onRetry={() => void repositoriesQuery.refetch()}
        />
      ) : null}

      {!repositoriesQuery.isLoading &&
      !repositoriesQuery.isError &&
      repositoriesQuery.data?.repositories.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No repositories yet</EmptyTitle>
            <EmptyDescription>
              Create your first repository to start pushing images.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {repositoriesQuery.data && repositoriesQuery.data.repositories.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {repositoriesQuery.data.repositories.map((repository) => (
            <li
              key={repository.id}
              className="flex items-center justify-between gap-4 px-4 py-4"
            >
              <Link
                href={`/r/${repository.name}`}
                className="min-w-0 flex-1 transition-colors hover:text-primary"
              >
                <p className="font-medium">{repository.name}</p>
                <p className="text-xs text-muted-foreground">
                  {repository.imageCount}{" "}
                  {repository.imageCount === 1 ? "image" : "images"}
                  {" · "}
                  Created {new Date(repository.createdAt).toLocaleDateString()}
                </p>
              </Link>
              <div className="flex items-center gap-2">
                {repository.isPublic ? <Badge variant="secondary">Public</Badge> : null}
                {repository.role ? <Badge>{repository.role}</Badge> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialogRef}
        className="fixed inset-x-3 top-[10vh] m-0 w-auto max-w-md rounded-xl border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/40 open:flex open:flex-col sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2"
        onClose={() => {
          setName("");
          setIsPublic(false);
        }}
      >
        <form className="space-y-4 p-6" onSubmit={handleCreate}>
          <div className="space-y-1">
            <h2 id="create-repository-title" className="text-lg font-semibold">
              Create repository
            </h2>
            <p className="text-sm text-muted-foreground">
              Use a DNS-like slug (lowercase letters, numbers, hyphens).
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="repository-name" className="text-sm font-medium">
              Repository name
            </label>
            <input
              id="repository-name"
              name="name"
              required
              autoFocus
              aria-labelledby="create-repository-title"
              pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*"
              minLength={2}
              maxLength={63}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-repository"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            Public repository (anonymous pull)
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-loading={createMutation.isPending ? "" : undefined}
            >
              {createMutation.isPending ? <Spinner /> : null}
              Create
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
