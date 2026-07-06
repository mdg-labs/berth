// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { apiFetch, ApiError } from "@/lib/api/client";
import type { ProjectSummary } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage registry projects.
          </p>
        </div>
        <Button type="button" onClick={openDialog}>
          <PlusIcon />
          New project
        </Button>
      </div>

      {projectsQuery.isLoading ? <ProjectListSkeleton /> : null}

      {projectsQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-foreground">
          Failed to load projects.
        </div>
      ) : null}

      {projectsQuery.data?.projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No projects yet. Create your first project to get started.
          </p>
        </div>
      ) : null}

      {projectsQuery.data && projectsQuery.data.projects.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {projectsQuery.data.projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-4 px-4 py-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </div>
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
        className="w-full max-w-md rounded-xl border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/40 open:flex open:flex-col"
      >
        <form className="space-y-4 p-6" onSubmit={handleCreate}>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Create project</h2>
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
