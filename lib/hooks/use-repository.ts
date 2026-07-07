// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api/client";
import type { RepositorySummary } from "@/lib/api/types";

type RepositoriesResponse = {
  repositories: RepositorySummary[];
};

export function useRepositoryByName(repositoryName: string) {
  return useQuery({
    queryKey: ["repositories", "by-name", repositoryName],
    queryFn: async () => {
      const data = await apiFetch<RepositoriesResponse>("/api/repositories");
      const repository = data.repositories.find((entry) => entry.name === repositoryName);
      if (!repository) {
        throw new ApiError("not_found", "", 404);
      }
      return repository;
    },
    staleTime: 30_000,
  });
}

export function useRepositoriesList() {
  return useQuery({
    queryKey: ["repositories"],
    queryFn: () => apiFetch<RepositoriesResponse>("/api/repositories"),
    staleTime: 30_000,
  });
}
