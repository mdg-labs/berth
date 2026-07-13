// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { expect, test } from "@playwright/test";

import { pushHelloTag } from "./helpers/registry-push";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@localhost";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "test-admin-password";

function repositoryCatalogLink(
  page: import("@playwright/test").Page,
  repositoryName: string,
) {
  return page.locator(`a[href="/r/${repositoryName}"]`);
}

test.describe("portal happy path", () => {
  test("login → create repository → push → browse → delete tag", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const repositoryName = `e2e${suffix}`.slice(0, 20);
    const imageName = "hello";
    const tagName = "1.0";

    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/repositories$/);
    await expect(
      page.getByRole("heading", { name: "Repositories" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "New repository" }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.locator("#repository-name").fill(repositoryName);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(repositoryCatalogLink(page, repositoryName)).toBeVisible();

    await pushHelloTag(repositoryName, imageName, tagName, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const imageTitle = `${repositoryName}/${imageName}`;

    await repositoryCatalogLink(page, repositoryName).click();
    await expect(page.getByRole("heading", { name: repositoryName })).toBeVisible();

    await expect(page.getByRole("link", { name: imageTitle })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole("link", { name: imageTitle }).click();

    await expect(page.getByRole("link", { name: tagName })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole("link", { name: tagName }).click();

    await expect(
      page.getByRole("heading", { name: new RegExp(tagName) }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Delete tag/i }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete tag" })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/r/${repositoryName}/i/${imageName}`),
    );
    await expect(page.getByRole("link", { name: tagName })).toHaveCount(0);
  });
});

test.describe("command palette", () => {
  test("opens with keyboard shortcut and navigates to repositories", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/repositories$/);

    await page.keyboard.press("Control+K");
    await expect(
      page.getByRole("combobox", { name: "Jump to repository or image…" }),
    ).toBeVisible();
    await page.getByRole("listbox").getByRole("option").first().click();
    await expect(page).toHaveURL(/\/r\//);
  });
});
