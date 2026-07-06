// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRegistryInternalUrl } from "@/lib/registry/health";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

type RouteParams = {
  params: Promise<{ path?: string[] }>;
};

function buildRegistryUrl(request: NextRequest, pathSegments?: string[]): string {
  const base = getRegistryInternalUrl().replace(/\/$/, "");
  const suffix =
    pathSegments && pathSegments.length > 0
      ? `/${pathSegments.join("/")}`
      : "/";
  return `${base}/v2${suffix}${request.nextUrl.search}`;
}

async function proxyToRegistry(
  request: NextRequest,
  pathSegments?: string[],
): Promise<NextResponse> {
  const url = buildRegistryUrl(request, pathSegments);
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || HOP_BY_HOP_HEADERS.has(lower)) {
      return;
    }
    headers.set(key, value);
  });

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstream = await fetch(url, init);
  const responseHeaders = new Headers();

  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function handle(
  request: NextRequest,
  context: RouteParams,
): Promise<NextResponse> {
  const { path } = await context.params;
  return proxyToRegistry(request, path);
}

export async function GET(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}

export async function HEAD(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}

export async function PUT(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  return handle(request, context);
}
