// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PublicCatalogPage } from "@/components/public/public-catalog-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");

  return {
    title: t("publicCatalog.title"),
    description: t("publicCatalog.description"),
  };
}

export default function HomePage() {
  return <PublicCatalogPage />;
}
