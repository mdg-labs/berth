// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api/client";
import type { ProjectSummary } from "@/lib/api/types";
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

type ProjectsResponse = {
  projects: ProjectSummary[];
};

type CreateProjectResponse = {
  project: ProjectSummary;
};

function ProjectListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<ProjectsResponse>("/api/projects"),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; isPublic: boolean }) =>
      apiFetch<CreateProjectResponse>("/api/projects", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData<ProjectsResponse>(["projects"], (current) => ({
        projects: [...(current?.projects ?? []), data.project].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      }));
      toastManager.add({
        type: "success",
        title: "Project created",
        description: `${data.project.name} is ready.`,
      });
      setName("");
      setIsPublic(false);
      dialogRef.current?.close();
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : "Failed to create project";
      toastManager.add({
        type: "error",
        title: "Create project failed",
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
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage registry projects.
          </p>
        </div>
        <Button type="button" className="shrink-0" onClick={openDialog}>
          <PlusIcon />
          New project
        </Button>
      </div>

      {projectsQuery.isLoading ? <ProjectListSkeleton /> : null}

      {projectsQuery.isError ? (
        <ErrorAlert
          title="Failed to load projects"
          message={
            projectsQuery.error instanceof Error
              ? projectsQuery.error.message
              : "Something went wrong"
          }
          onRetry={() => void projectsQuery.refetch()}
        />
      ) : null}

      {!projectsQuery.isLoading &&
      !projectsQuery.isError &&
      projectsQuery.data?.projects.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Create your first project to start pushing images.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {projectsQuery.data && projectsQuery.data.projects.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {projectsQuery.data.projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-4 px-4 py-4"
            >
              <Link
                href={`/p/${project.name}`}
                className="min-w-0 flex-1 transition-colors hover:text-primary"
              >
                <p className="font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {project.repositoryCount}{" "}
                  {project.repositoryCount === 1 ? "repository" : "repositories"}
                  {" · "}
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </Link>
              <div className="flex items-center gap-2">
                {project.isPublic ? <Badge variant="secondary">Public</Badge> : null}
                {project.role ? <Badge>{project.role}</Badge> : null}
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
            <h2 id="create-project-title" className="text-lg font-semibold">
              Create project
            </h2>
            <p className="text-sm text-muted-foreground">
              Use a DNS-like slug (lowercase letters, numbers, hyphens).
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="project-name" className="text-sm font-medium">
              Project name
            </label>
            <input
              id="project-name"
              name="name"
              required
              autoFocus
              aria-labelledby="create-project-title"
              pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*"
              minLength={2}
              maxLength={63}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-project"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
            />
            Public project (anonymous pull)
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
