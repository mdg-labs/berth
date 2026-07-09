// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { HTMLAttributes } from "react";

import { BerthIcon } from "@/components/brand/berth-icon";
import { cn } from "@/lib/utils";

const sizeClasses = {
  md: {
    icon: "h-7",
    text: "text-lg",
    gap: "gap-x-2",
    textInset: "-ml-0.5",
    textOffset: "translate-y-1.5",
  },
  lg: {
    icon: "h-10 md:h-12",
    text: "text-3xl md:text-4xl",
    gap: "gap-x-2.5 md:gap-x-3",
    textInset: "-ml-1 md:-ml-1.5",
    textOffset: "translate-y-1 md:translate-y-1.5",
  },
} as const;

const berthErthClassName =
  "font-heading font-medium leading-none tracking-tight text-[#153356] dark:text-[#9FC5E8]";

function berthErthClasses(size: keyof typeof sizeClasses): string {
  const sizes = sizeClasses[size];
  return cn("block", berthErthClassName, sizes.text, sizes.textInset, sizes.textOffset);
}

type BerthWordmarkProps = HTMLAttributes<HTMLSpanElement> & {
  size?: keyof typeof sizeClasses;
  label?: string;
};

export function BerthWordmark({
  className,
  size = "md",
  label = "Berth",
  ...props
}: BerthWordmarkProps) {
  const sizes = sizeClasses[size];

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex items-end overflow-visible",
        sizes.gap,
        className,
      )}
      {...props}
    >
      <span className="inline-flex shrink-0 overflow-visible">
        <BerthIcon className={sizes.icon} />
      </span>
      <span className={berthErthClasses(size)}>erth</span>
    </span>
  );
}
