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
import { useRepositoryByName, useRepositoriesList } from "@/lib/hooks/use-repository";
import { apiFetch } from "@/lib/api/client";
import type { CatalogResponse } from "@/lib/registry/client/types";
import { imagePathSegments } from "@/lib/catalog/format";

type CommandPaletteProps = {
  currentRepository?: string;
};

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  group: string;
};

export function CommandPalette({ currentRepository }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const repositoriesQuery = useRepositoriesList();
  const repositoryQuery = useRepositoryByName(currentRepository ?? "");

  const catalogQuery = useQuery({
    queryKey: ["catalog", repositoryQuery.data?.id],
    queryFn: () =>
      apiFetch<CatalogResponse>(
        `/api/repositories/${repositoryQuery.data!.id}/catalog`,
      ),
    enabled: Boolean(currentRepository && repositoryQuery.data?.id),
    staleTime: 30_000,
  });

  const items = useMemo<PaletteItem[]>(() => {
    const palette: PaletteItem[] = [];

    for (const repository of repositoriesQuery.data?.repositories ?? []) {
      palette.push({
        id: `repository:${repository.id}`,
        label: repository.name,
        href: `/r/${repository.name}`,
        group: "Repositories",
      });
    }

    if (currentRepository && catalogQuery.data) {
      for (const image of catalogQuery.data.images) {
        palette.push({
          id: `image:${currentRepository}/${image.name}`,
          label: image.name,
          href: `/r/${currentRepository}/i/${imagePathSegments(image.name)}`,
          group: `Images in ${currentRepository}`,
        });
      }
    }

    return palette;
  }, [catalogQuery.data, currentRepository, repositoriesQuery.data?.repositories]);

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
            <CommandInput placeholder="Jump to repository or image…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                <CommandGroupLabel>Repositories</CommandGroupLabel>
                {items
                  .filter((item) => item.group === "Repositories")
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
              {currentRepository ? (
                <CommandGroup>
                  <CommandGroupLabel>
                    Images in {currentRepository}
                  </CommandGroupLabel>
                  {items
                    .filter((item) => item.group.startsWith("Images"))
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
