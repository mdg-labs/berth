// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Berth",
  description: "Self-hosted OCI artifact registry with Harbor-class identity, projects, and RBAC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
