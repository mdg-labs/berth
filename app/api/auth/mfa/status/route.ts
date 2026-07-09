// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getMfaPendingStateFromCookie } from "@/lib/mfa/pending";

export async function GET(request: NextRequest) {
  const pending = getMfaPendingStateFromCookie(request.headers.get("cookie"));

  return NextResponse.json({
    required: pending !== null,
  });
}
