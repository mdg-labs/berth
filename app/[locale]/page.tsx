// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { Metadata } from "next";

import { PublicCatalogPage } from "@/components/public/public-catalog-page";

export const metadata: Metadata = {
  title: "Berth — Public images",
  description: "Browse publicly available container images on this registry.",
};

export default function HomePage() {
  return <PublicCatalogPage />;
}
