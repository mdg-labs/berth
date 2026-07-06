// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import { getDefaultTheme } from "@/lib/theme/config";
import { cn } from "@/lib/utils";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const interHeading = Inter({
  subsets: ["latin"],
  variable: "--font-heading",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Berth",
  description:
    "Self-hosted OCI artifact registry with Harbor-class identity, projects, and RBAC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const defaultTheme = getDefaultTheme();

  return (
    <html
      lang="en"
      className={cn(
        "font-sans",
        inter.variable,
        interHeading.variable,
        geistMono.variable,
      )}
      data-theme-default={defaultTheme}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
