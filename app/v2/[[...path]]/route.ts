// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { NextRequest } from "next/server";

import { proxyRegistryRequest } from "@/lib/registry/proxy/forward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

async function handle(request: NextRequest): Promise<Response> {
  return proxyRegistryRequest(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function HEAD(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function PUT(request: NextRequest) {
  return handle(request);
}

export async function PATCH(request: NextRequest) {
  return handle(request);
}

export async function DELETE(request: NextRequest) {
  return handle(request);
}
