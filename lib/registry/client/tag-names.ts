// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { registryJson, RegistryUpstreamError } from "./fetch";

type TagsPage = {
  tags?: string[];
};

export async function fetchAllTagNames(
  fullName: string,
  token: string,
): Promise<string[]> {
  try {
    const body = await registryJson<TagsPage>(
      `/v2/${fullName}/tags/list?n=1000`,
      token,
    );
    return body.tags ?? [];
  } catch (error) {
    if (error instanceof RegistryUpstreamError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function countTagNames(
  fullName: string,
  token: string,
): Promise<number> {
  try {
    const tags = await fetchAllTagNames(fullName, token);
    return tags.length;
  } catch {
    return 0;
  }
}
