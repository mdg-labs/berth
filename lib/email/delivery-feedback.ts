// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { EmailDeliveryStatus } from "./send";

type EmailDeliveryToastCopy = Record<
  EmailDeliveryStatus,
  { title: string; description: string }
>;

export function emailDeliveryToast(
  status: EmailDeliveryStatus,
  copy: EmailDeliveryToastCopy,
): {
  type: "success" | "warning" | "error";
  title: string;
  description: string;
} {
  const type =
    status === "sent"
      ? "success"
      : status === "not_configured"
        ? "warning"
        : "error";

  return {
    type,
    title: copy[status].title,
    description: copy[status].description,
  };
}
