// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { AdminUserDetailPage } from "@/components/admin/admin-user-detail-page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminUserDetailPage userId={id} />;
}
