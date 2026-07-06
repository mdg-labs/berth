// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { ProjectSummary } from "@/lib/api/types";

type ProjectsResponse = {
  projects: ProjectSummary[];
};

export function useProjectByName(projectName: string) {
  return useQuery({
    queryKey: ["projects", "by-name", projectName],
    queryFn: async () => {
      const data = await apiFetch<ProjectsResponse>("/api/projects");
      const project = data.projects.find((entry) => entry.name === projectName);
      if (!project) {
        throw new Error("Project not found");
      }
      return project;
    },
    staleTime: 30_000,
  });
}

export function useProjectsList() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<ProjectsResponse>("/api/projects"),
    staleTime: 30_000,
  });
}
