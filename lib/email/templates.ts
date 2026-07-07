// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { getAppUrl } from "@/lib/oidc/config";

import type { EmailMessage } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function passwordResetEmail(input: {
  to: string;
  resetUrl: string;
}): EmailMessage {
  const resetUrl = input.resetUrl;
  return {
    to: input.to,
    subject: "Reset your Berth password",
    text: [
      "You requested a password reset for your Berth account.",
      "",
      `Reset your password: ${resetUrl}`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>You requested a password reset for your Berth account.</p>",
      `<p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>`,
      "<p>If you did not request this, you can ignore this email.</p>",
    ].join(""),
  };
}

export function userInviteEmail(input: {
  to: string;
  inviteeName: string;
  inviteUrl: string;
}): EmailMessage {
  const inviteUrl = input.inviteUrl;
  const inviteeName = escapeHtml(input.inviteeName);
  return {
    to: input.to,
    subject: "You are invited to Berth",
    text: [
      `Hello ${input.inviteeName},`,
      "",
      "You have been invited to join this Berth registry.",
      "",
      `Accept your invite: ${inviteUrl}`,
      "",
      "This link expires after a few days.",
    ].join("\n"),
    html: [
      `<p>Hello ${inviteeName},</p>`,
      "<p>You have been invited to join this Berth registry.</p>",
      `<p><a href="${escapeHtml(inviteUrl)}">Accept your invite</a></p>`,
      "<p>This link expires after a few days.</p>",
    ].join(""),
  };
}

export function repositoryInviteEmail(input: {
  to: string;
  repositoryName: string;
  role: string;
  inviterName: string;
  loginUrl: string;
}): EmailMessage {
  const repositoryName = escapeHtml(input.repositoryName);
  const inviterName = escapeHtml(input.inviterName);
  const role = escapeHtml(input.role);
  const loginUrl = input.loginUrl;
  return {
    to: input.to,
    subject: `Invitation to repository ${input.repositoryName} on Berth`,
    text: [
      `${input.inviterName} invited you to the repository "${input.repositoryName}" as ${input.role}.`,
      "",
      "Sign in to Berth to accept the invitation:",
      loginUrl,
      "",
      "If you do not have an account yet, ask your administrator for a Berth invite first.",
    ].join("\n"),
    html: [
      `<p>${inviterName} invited you to the repository <strong>${repositoryName}</strong> as <strong>${role}</strong>.</p>`,
      "<p>Sign in to Berth to accept the invitation.</p>",
      `<p><a href="${escapeHtml(loginUrl)}">Sign in to Berth</a></p>`,
      "<p>If you do not have an account yet, ask your administrator for a Berth invite first.</p>",
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
