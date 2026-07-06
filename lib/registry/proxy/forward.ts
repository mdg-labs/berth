// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRegistryInternalUrl } from "@/lib/registry/health";
import { getRegistryProxyTimeoutMs } from "@/lib/registry/proxy/config";
import { getPublicOrigin } from "@/lib/registry/proxy/public-url";
import { rewriteResponseHeaderValue } from "@/lib/registry/proxy/rewrite";
import { getTokenService } from "@/lib/token/config";
import {
  extractBearerToken,
  verifyRegistryBearerToken,
} from "@/lib/token/verify";

const REQUEST_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "upgrade",
]);

const RESPONSE_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "upgrade",
]);

function buildRegistryUrl(request: NextRequest): string {
  const base = getRegistryInternalUrl().replace(/\/$/, "");
  return `${base}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function copyRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || REQUEST_HOP_BY_HOP_HEADERS.has(lower)) {
      return;
    }
    headers.set(key, value);
  });

  return headers;
}

function copyResponseHeaders(
  upstream: Response,
  publicOrigin: string,
): Headers {
  const responseHeaders = new Headers();

  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (RESPONSE_HOP_BY_HOP_HEADERS.has(lower)) {
      return;
    }

    responseHeaders.set(
      key,
      rewriteResponseHeaderValue(key, value, publicOrigin),
    );
  });

  return responseHeaders;
}

async function validateBearerIfPresent(
  request: NextRequest,
): Promise<NextResponse | null> {
  const bearer = extractBearerToken(request.headers.get("authorization"));
  if (!bearer) {
    return null;
  }

  const verified = await verifyRegistryBearerToken(bearer);
  if (verified.ok) {
    return null;
  }

  const service = getTokenService();
  const realm = `${getPublicOrigin(request)}/api/auth/token`;

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Bearer realm="${realm}",service="${service}"`,
    },
  });
}

export async function proxyRegistryRequest(
  request: NextRequest,
): Promise<NextResponse> {
  const authFailure = await validateBearerIfPresent(request);
  if (authFailure) {
    return authFailure;
  }

  const url = buildRegistryUrl(request);
  const headers = copyRequestHeaders(request);
  const publicOrigin = getPublicOrigin(request);
  const timeoutMs = getRegistryProxyTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: controller.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const upstream = await fetch(url, init);
    const responseHeaders = copyResponseHeaders(upstream, publicOrigin);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new NextResponse("Registry proxy timeout", { status: 504 });
    }

    return new NextResponse("Registry upstream unavailable", { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
