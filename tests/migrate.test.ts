// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { afterEach, describe, expect, it, vi } from "vitest";

import { getMigrationsFolder, runMigrations } from "@/lib/db/migrate";

const { migrateMock, postgresMock, drizzleMock } = vi.hoisted(() => ({
  migrateMock: vi.fn().mockResolvedValue(undefined),
  postgresMock: vi.fn(),
  drizzleMock: vi.fn(),
}));

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
  migrate: migrateMock,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: drizzleMock,
}));

vi.mock("postgres", () => ({
  default: postgresMock,
}));

describe("runMigrations", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
  });

  it("getMigrationsFolder points at drizzle output", () => {
    expect(getMigrationsFolder()).toMatch(/drizzle$/);
  });

  it("throws when DATABASE_URL is missing", async () => {
    await expect(runMigrations()).rejects.toThrow("DATABASE_URL is required");
  });

  it("can be invoked repeatedly without error (idempotent entrypoint)", async () => {
    process.env.DATABASE_URL = "postgresql://berth:berth@localhost:5432/berth";
    const end = vi.fn().mockResolvedValue(undefined);
    postgresMock.mockReturnValue({ end });
    drizzleMock.mockReturnValue({});

    await runMigrations();
    await runMigrations();

    expect(migrateMock).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);
  });
});
