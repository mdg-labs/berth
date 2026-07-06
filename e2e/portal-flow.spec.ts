// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { expect, test } from "@playwright/test";

import { pushHelloTag } from "./helpers/registry-push";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@localhost";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "test-admin-password";

test.describe("portal happy path", () => {
  test("login → create project → push → browse → delete tag", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const projectName = `e2e${suffix}`.slice(0, 20);
    const repoName = "hello";
    const tagName = "1.0";

    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/projects$/);
    await expect(
      page.getByRole("heading", { name: "Projects" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "New project" }).click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await page.locator("#project-name").fill(projectName);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByRole("link", { name: projectName })).toBeVisible();

    await pushHelloTag(projectName, repoName, tagName, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    await page.getByRole("link", { name: projectName }).click();
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    await expect(page.getByRole("link", { name: repoName })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole("link", { name: repoName }).click();

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
      new RegExp(`/p/${projectName}/r/${repoName}`),
    );
    await expect(page.getByRole("link", { name: tagName })).toHaveCount(0);
  });
});

test.describe("command palette", () => {
  test("opens with keyboard shortcut and navigates to projects", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await page.keyboard.press("Control+K");
    await expect(
      page.getByRole("combobox", { name: "Jump to project or repository…" }),
    ).toBeVisible();
    await page.getByRole("listbox").getByRole("option").first().click();
    await expect(page).toHaveURL(/\/p\//);
  });
});
