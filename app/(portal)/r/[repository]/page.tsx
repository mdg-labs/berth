// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { CatalogPage } from "@/components/catalog/catalog-page";

type PageProps = {
  params: Promise<{ repository: string }>;
};

export default async function RepositoryCatalogPage({ params }: PageProps) {
  const { repository } = await params;
  return <CatalogPage repositoryName={decodeURIComponent(repository)} />;
}
