// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "registry-portal";

export const INTEGRATION_BASE_URL =
  process.env.INTEGRATION_BASE_URL ?? "http://localhost:8080";

export const INTEGRATION_ADMIN_EMAIL =
  process.env.INTEGRATION_ADMIN_EMAIL ?? "admin@localhost";

export const INTEGRATION_ADMIN_PASSWORD =
  process.env.INTEGRATION_ADMIN_PASSWORD ?? "test-admin-password";

export function csrfHeaders(clientIp = "203.0.113.50"): HeadersInit {
  return {
    "Content-Type": "application/json",
    [CSRF_HEADER]: CSRF_VALUE,
    "X-Forwarded-For": clientIp,
  };
}

export function extractSetCookie(
  response: Response,
  cookieName: string,
): string | null {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""].filter(Boolean);

  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const [name, ...valueParts] = pair?.split("=") ?? [];
    if (name === cookieName) {
      const value = valueParts.join("=");
      return value ? decodeURIComponent(value) : "";
    }
  }

  return null;
}

export function cookieHeader(
  cookieName: string,
  cookieValue: string,
): HeadersInit {
  return {
    Cookie: `${cookieName}=${encodeURIComponent(cookieValue)}`,
  };
}

export async function isIntegrationTargetReady(): Promise<boolean> {
  try {
    const response = await fetch(`${INTEGRATION_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function hasAuthRoutes(): Promise<boolean> {
  try {
    const response = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(2_000),
    });
    return response.status !== 404;
  } catch {
    return false;
  }
}

export async function canLoginWithConfiguredCredentials(): Promise<boolean> {
  try {
    const response = await fetch(`${INTEGRATION_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: csrfHeaders("203.0.113.51"),
      body: JSON.stringify({
        email: INTEGRATION_ADMIN_EMAIL,
        password: INTEGRATION_ADMIN_PASSWORD,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
