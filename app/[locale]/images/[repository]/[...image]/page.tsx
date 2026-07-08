// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PublicImageDetailPage } from "@/components/public/public-image-detail-page";

type PageProps = {
  params: Promise<{ repository: string; image: string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { repository, image } = await params;
  const repositoryName = decodeURIComponent(repository);
  const imageName = image.map(decodeURIComponent).join("/");
  const t = await getTranslations("metadata");

  return {
    title: t("publicImageDetail.title", {
      image: `${repositoryName}/${imageName}`,
    }),
    description: t("publicImageDetail.description", {
      image: `${repositoryName}/${imageName}`,
    }),
  };
}

export default async function PublicImagePage({ params }: PageProps) {
  const { repository, image } = await params;
  const repositoryName = decodeURIComponent(repository);
  const imageName = image.map(decodeURIComponent).join("/");

  return (
    <PublicImageDetailPage
      repositoryName={repositoryName}
      imageName={imageName}
    />
  );
}
