// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("SMTP is not configured");
    this.name = "EmailNotConfiguredError";
  }
}

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};
