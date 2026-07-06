// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("@/lib/db/migrate");
    const { ensureBootstrapAdmin } = await import("@/lib/bootstrap/admin");

    await runMigrations();
    await ensureBootstrapAdmin();
  }
}
