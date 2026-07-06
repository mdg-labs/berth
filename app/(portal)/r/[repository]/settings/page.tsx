// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { RepositorySettingsPage } from "@/components/settings/repository-settings-page";

type PageProps = {
  params: Promise<{ repository: string }>;
};

export default async function SettingsRoute({ params }: PageProps) {
  const { repository } = await params;
  return <RepositorySettingsPage repositoryName={decodeURIComponent(repository)} />;
}
