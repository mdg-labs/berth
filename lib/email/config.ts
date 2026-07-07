// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export function getSmtpHost(): string | undefined {
  return process.env.SMTP_HOST?.trim() || undefined;
}

export function getSmtpPort(): number {
  const parsed = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  return Number.isFinite(parsed) ? parsed : 587;
}

export function getSmtpUser(): string | undefined {
  return process.env.SMTP_USER?.trim() || undefined;
}

export function getSmtpPassword(): string | undefined {
  return process.env.SMTP_PASSWORD?.trim() || undefined;
}

export function isSmtpSecure(): boolean {
  return process.env.SMTP_SECURE === "true";
}

export function getEmailFromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "noreply@localhost";
}

export function getEmailFromName(): string {
  return process.env.EMAIL_FROM_NAME?.trim() || "Berth";
}

export function getPasswordResetTtlHours(): number {
  const parsed = Number.parseInt(process.env.PASSWORD_RESET_TTL_HOURS ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function getUserInviteTtlHours(): number {
  const parsed = Number.parseInt(process.env.USER_INVITE_TTL_HOURS ?? "72", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 72;
}

export function isEmailConfigured(): boolean {
  return Boolean(getSmtpHost());
}

export function getEmailFrom(): string {
  const name = getEmailFromName();
  const address = getEmailFromAddress();
  return `${name} <${address}>`;
}
