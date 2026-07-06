// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isValidProjectName(name: string): boolean {
  return (
    name.length >= 2 &&
    name.length <= 63 &&
    PROJECT_NAME_PATTERN.test(name)
  );
}

export function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase();
}
