// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

// Arcs bulge to ~x=170; keep a little right padding so bowls are not clipped.
const VIEWBOX_WIDTH = 174;
const VIEWBOX_HEIGHT = 204;

export function BerthIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      overflow="visible"
      className={cn(
        "block aspect-[174/204] w-auto shrink-0 overflow-visible",
        className,
      )}
      {...props}
    >
      <path
        d="M 30 0 L 120 0 A 50 50 0 0 1 120 100 L 30 100 Z"
        fill="#6FA8DC"
      />
      <path
        d="M 30 104 L 120 104 A 50 50 0 0 1 120 204 L 30 204 Z"
        fill="#9FC5E8"
      />
      <rect x="0" y="0" width="30" height="204" rx="4" fill="#153356" />
    </svg>
  );
}
