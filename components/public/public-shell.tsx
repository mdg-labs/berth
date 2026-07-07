// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import Link from "next/link";

import { Button } from "@/components/ui/button";

type PublicShellProps = {
  children: React.ReactNode;
};

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link
            href="/"
            className="font-heading text-lg font-semibold tracking-tight transition-colors hover:text-primary"
          >
            Berth
          </Link>
          <Button variant="outline" size="sm" render={<Link href="/login" />}>
            Sign in
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        {children}
      </main>
    </div>
  );
}
