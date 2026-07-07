// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function getRateLimitConfig() {
  const maxAttempts = Number.parseInt(
    process.env.RATE_LIMIT_LOGIN_MAX_ATTEMPTS ?? "10",
    10,
  );
  const windowSeconds = Number.parseInt(
    process.env.RATE_LIMIT_WINDOW_SECONDS ?? "60",
    10,
  );

  return {
    maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : 10,
    windowSeconds: Number.isFinite(windowSeconds) ? windowSeconds : 60,
  };
}

export function consumeRateLimit(
  key: string,
  maxAttempts = getRateLimitConfig().maxAttempts,
  windowSeconds = getRateLimitConfig().windowSeconds,
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return true;
  }

  if (bucket.count >= maxAttempts) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export function checkLoginRateLimit(ip: string, email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return (
    consumeRateLimit(`login:ip:${ip}`) &&
    consumeRateLimit(`login:email:${normalizedEmail}`)
  );
}

export function checkForgotPasswordRateLimit(ip: string, email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return (
    consumeRateLimit(`forgot-password:ip:${ip}`) &&
    consumeRateLimit(`forgot-password:email:${normalizedEmail}`)
  );
}

export function resetRateLimits(): void {
  buckets.clear();
}
