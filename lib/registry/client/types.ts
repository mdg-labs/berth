// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

export type CatalogRepository = {
  name: string;
  tagCount: number;
};

export type CatalogResponse = {
  repositories: CatalogRepository[];
};

export type TagSummary = {
  name: string;
  digest: string;
  size: number;
  pushedAt: string | null;
};

export type TagsListResponse = {
  tags: TagSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type PlatformInfo = {
  os: string;
  architecture: string;
  variant?: string;
  digest: string;
  size: number;
};

export type HistoryEntry = {
  created: string;
  createdBy: string;
  comment: string;
  emptyLayer: boolean;
};

export type TagDetail = {
  name: string;
  digest: string;
  mediaType: string;
  size: number;
  pushedAt: string | null;
  platforms: PlatformInfo[];
  history: HistoryEntry[];
  labels: Record<string, string>;
};

export type SiblingTag = {
  name: string;
};

export type SiblingsResponse = {
  siblings: SiblingTag[];
};
