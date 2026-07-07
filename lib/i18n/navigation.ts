// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { createNavigation } from "next-intl/navigation";

import { routing } from "./config";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
