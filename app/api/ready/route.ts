// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { isRegistryReachable } from "@/lib/registry/health";

export async function GET() {
  let database = false;
  let registry = false;

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    database = true;
  } catch {
    database = false;
  }

  registry = await isRegistryReachable();

  const ready = database && registry;
  const status = ready ? "ready" : "not_ready";

  return NextResponse.json(
    {
      status,
      checks: {
        database,
        registry,
      },
    },
    { status: ready ? 200 : 503 },
  );
}
