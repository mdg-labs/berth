// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { CatalogPage } from "@/components/catalog/catalog-page";

type PageProps = {
  params: Promise<{ project: string }>;
};

export default async function ProjectCatalogPage({ params }: PageProps) {
  const { project } = await params;
  return <CatalogPage projectName={decodeURIComponent(project)} />;
}
