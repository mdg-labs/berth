// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PackageIcon } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { useProjectByName, useProjectsList } from "@/lib/hooks/use-project";
import { apiFetch } from "@/lib/api/client";
import type { CatalogResponse } from "@/lib/registry/client/types";
import { repoPathSegments } from "@/lib/catalog/format";

type CommandPaletteProps = {
  currentProject?: string;
};

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  group: string;
};

export function CommandPalette({ currentProject }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const projectsQuery = useProjectsList();
  const projectQuery = useProjectByName(currentProject ?? "");

  const catalogQuery = useQuery({
    queryKey: ["catalog", projectQuery.data?.id],
    queryFn: () =>
      apiFetch<CatalogResponse>(
        `/api/projects/${projectQuery.data!.id}/catalog`,
      ),
    enabled: Boolean(currentProject && projectQuery.data?.id),
    staleTime: 30_000,
  });

  const items = useMemo<PaletteItem[]>(() => {
    const palette: PaletteItem[] = [];

    for (const project of projectsQuery.data?.projects ?? []) {
      palette.push({
        id: `project:${project.id}`,
        label: project.name,
        href: `/p/${project.name}`,
        group: "Projects",
      });
    }

    if (currentProject && catalogQuery.data) {
      for (const repo of catalogQuery.data.repositories) {
        palette.push({
          id: `repo:${currentProject}/${repo.name}`,
          label: repo.name,
          href: `/p/${currentProject}/r/${repoPathSegments(repo.name)}`,
          group: `Repositories in ${currentProject}`,
        });
      }
    }

    return palette;
  }, [catalogQuery.data, currentProject, projectsQuery.data?.projects]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs text-muted-foreground sm:hidden"
        aria-label="Open command palette"
        onClick={() => setOpen(true)}
      >
        Search
      </button>
      <button
        type="button"
        className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground sm:inline-flex"
        aria-label="Open command palette"
        onClick={() => setOpen(true)}
      >
        Search…
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup>
          <Command
            items={items}
            itemToStringValue={(item) => (item as PaletteItem).label}
            onValueChange={(value) => {
              const label =
                typeof value === "string"
                  ? value
                  : (value as PaletteItem | null)?.label;
              const selected = items.find((item) => item.label === label);
              if (!selected) {
                return;
              }
              setOpen(false);
              router.push(selected.href);
            }}
          >
            <CommandInput placeholder="Jump to project or repository…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                <CommandGroupLabel>Projects</CommandGroupLabel>
                {items
                  .filter((item) => item.group === "Projects")
                  .map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.label}
                      onClick={() => {
                        setOpen(false);
                        router.push(item.href);
                      }}
                    >
                      <PackageIcon className="size-4" />
                      {item.label}
                    </CommandItem>
                  ))}
              </CommandGroup>
              {currentProject ? (
                <CommandGroup>
                  <CommandGroupLabel>
                    Repositories in {currentProject}
                  </CommandGroupLabel>
                  {items
                    .filter((item) => item.group.startsWith("Repositories"))
                    .map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.label}
                        onClick={() => {
                          setOpen(false);
                          router.push(item.href);
                        }}
                      >
                        {item.label}
                      </CommandItem>
                    ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}
