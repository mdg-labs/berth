// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

import {
  getEmailFrom,
  getSmtpHost,
  getSmtpPassword,
  getSmtpPort,
  getSmtpUser,
  isEmailConfigured,
  isSmtpSecure,
} from "./config";
import { EmailNotConfiguredError, type EmailMessage } from "./types";

export type EmailDeliveryStatus = "sent" | "not_configured" | "failed";

export type TrySendEmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "failed" };

export function toEmailDeliveryStatus(result: TrySendEmailResult): EmailDeliveryStatus {
  if (result.sent) {
    return "sent";
  }

  return result.reason === "not_configured" ? "not_configured" : "failed";
}

let transport: Mail | null = null;

function getTransport(): Mail {
  if (!isEmailConfigured()) {
    throw new EmailNotConfiguredError();
  }

  if (!transport) {
    const host = getSmtpHost();
    if (!host) {
      throw new EmailNotConfiguredError();
    }

    transport = nodemailer.createTransport({
      host,
      port: getSmtpPort(),
      secure: isSmtpSecure(),
      auth:
        getSmtpUser() && getSmtpPassword()
          ? {
              user: getSmtpUser(),
              pass: getSmtpPassword(),
            }
          : undefined,
    });
  }

  return transport;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const mailer = getTransport();
  await mailer.sendMail({
    from: getEmailFrom(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export async function trySendEmail(
  message: EmailMessage,
): Promise<TrySendEmailResult> {
  if (!isEmailConfigured()) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    await sendEmail(message);
    return { sent: true };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { sent: false, reason: "failed" };
  }
}
