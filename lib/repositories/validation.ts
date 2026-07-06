// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

const REPOSITORY_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isValidRepositoryName(name: string): boolean {
  return (
    name.length >= 2 &&
    name.length <= 63 &&
    REPOSITORY_NAME_PATTERN.test(name)
  );
}

export function normalizeRepositoryName(name: string): string {
  return name.trim().toLowerCase();
}
