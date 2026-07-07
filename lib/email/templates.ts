// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { getServerTranslator } from "@/lib/i18n/server-translator";
import { getAppUrl } from "@/lib/oidc/config";

import type { EmailMessage } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function passwordResetEmail(input: {
  to: string;
  resetUrl: string;
  locale?: Locale;
}): Promise<EmailMessage> {
  const locale = input.locale ?? defaultLocale;
  const t = await getServerTranslator(locale, "emails");
  const resetUrl = input.resetUrl;

  return {
    to: input.to,
    subject: t("passwordReset.subject"),
    text: [
      t("passwordReset.intro"),
      "",
      `${t("passwordReset.action")}: ${resetUrl}`,
      "",
      t("passwordReset.ignore"),
    ].join("\n"),
    html: [
      `<p>${t("passwordReset.intro")}</p>`,
      `<p><a href="${escapeHtml(resetUrl)}">${t("passwordReset.action")}</a></p>`,
      `<p>${t("passwordReset.ignore")}</p>`,
    ].join(""),
  };
}

export async function userInviteEmail(input: {
  to: string;
  inviteeName: string;
  inviteUrl: string;
  locale?: Locale;
}): Promise<EmailMessage> {
  const locale = input.locale ?? defaultLocale;
  const t = await getServerTranslator(locale, "emails");
  const inviteUrl = input.inviteUrl;
  const inviteeName = escapeHtml(input.inviteeName);

  return {
    to: input.to,
    subject: t("userInvite.subject"),
    text: [
      t("userInvite.greeting", { name: input.inviteeName }),
      "",
      t("userInvite.body"),
      "",
      `${t("userInvite.action")}: ${inviteUrl}`,
      "",
      t("userInvite.expiry"),
    ].join("\n"),
    html: [
      `<p>${t("userInvite.greeting", { name: inviteeName })}</p>`,
      `<p>${t("userInvite.body")}</p>`,
      `<p><a href="${escapeHtml(inviteUrl)}">${t("userInvite.action")}</a></p>`,
      `<p>${t("userInvite.expiry")}</p>`,
    ].join(""),
  };
}

export async function repositoryInviteEmail(input: {
  to: string;
  repositoryName: string;
  role: string;
  inviterName: string;
  loginUrl: string;
  locale?: Locale;
}): Promise<EmailMessage> {
  const locale = input.locale ?? defaultLocale;
  const t = await getServerTranslator(locale, "emails");
  const repositoryName = escapeHtml(input.repositoryName);
  const inviterName = escapeHtml(input.inviterName);
  const role = escapeHtml(input.role);
  const loginUrl = input.loginUrl;

  return {
    to: input.to,
    subject: t("repositoryInvite.subject", {
      repositoryName: input.repositoryName,
    }),
    text: [
      t("repositoryInvite.intro", {
        inviterName: input.inviterName,
        repositoryName: input.repositoryName,
        role: input.role,
      }),
      "",
      t("repositoryInvite.signIn"),
      loginUrl,
      "",
      t("repositoryInvite.noAccount"),
    ].join("\n"),
    html: [
      `<p>${t("repositoryInvite.introHtml", {
        inviterName,
        repositoryName,
        role,
      })}</p>`,
      `<p>${t("repositoryInvite.signIn")}</p>`,
      `<p><a href="${escapeHtml(loginUrl)}">${t("repositoryInvite.action")}</a></p>`,
      `<p>${t("repositoryInvite.noAccount")}</p>`,
    ].join(""),
  };
}

export function buildPasswordResetUrl(token: string): string {
  const url = new URL("/reset-password", getAppUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildUserInviteUrl(token: string): string {
  const url = new URL("/accept-invite", getAppUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildLoginUrl(): string {
  return new URL("/login", getAppUrl()).toString();
}
