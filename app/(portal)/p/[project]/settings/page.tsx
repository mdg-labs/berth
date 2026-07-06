// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { ProjectSettingsPage } from "@/components/settings/project-settings-page";

type PageProps = {
  params: Promise<{ project: string }>;
};

export default async function SettingsRoute({ params }: PageProps) {
  const { project } = await params;
  return <ProjectSettingsPage projectName={decodeURIComponent(project)} />;
}
