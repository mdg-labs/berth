// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { Suspense } from "react";

import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { Spinner } from "@/components/ui/spinner";

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center rounded-xl border bg-card p-6 shadow-xs">
          <Spinner />
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
