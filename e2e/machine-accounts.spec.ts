// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@localhost";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "test-admin-password";

async function requestRegistryToken(
  repositoryName: string,
  username: string,
  secret: string,
): Promise<Response> {
  const scope = `repository:${repositoryName}/hello:pull`;
  return fetch(
    `${BASE_URL}/api/auth/token?service=registry&scope=${encodeURIComponent(scope)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${secret}`).toString("base64")}`,
      },
    },
  );
}

test.describe("repository machine accounts", () => {
  test("create in settings, log in with the secret, delete", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const repositoryName = `e2ema${suffix}`.slice(0, 20);
    const accountName = "ci-pull";
    const username = `${repositoryName}+${accountName}`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/repositories$/);

    await page.getByRole("button", { name: "New repository" }).click();
    await page.locator("#repository-name").fill(repositoryName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.locator(`a[href="/r/${repositoryName}"]`)).toBeVisible();

    await page.goto(`/r/${repositoryName}/settings`);
    await page.getByRole("tab", { name: "Access" }).click();
    await expect(
      page.getByLabel("Access").getByText("Machine accounts", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("No machine accounts yet")).toBeVisible();

    await page.getByRole("button", { name: "Create machine account" }).click();
    const dialog = page.getByRole("dialog", { name: "Create machine account" });
    await expect(dialog).toBeVisible();

    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished)),
    );
    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      ),
    ).toEqual([]);

    await dialog.getByLabel("Name").fill("Not A Slug!");
    await dialog.getByRole("checkbox", { name: "Pull" }).uncheck();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      dialog.getByText("Use 2 to 63 lowercase letters, digits and hyphens"),
    ).toBeVisible();
    await expect(
      dialog.getByText("Select at least one permission."),
    ).toBeVisible();

    await dialog.getByLabel("Name").fill(accountName);
    await dialog.getByLabel("Description (optional)").fill("E2E pull account");
    await dialog.getByRole("checkbox", { name: "Pull" }).check();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    const created = page.getByRole("dialog", { name: "Machine account created" });
    await expect(created).toBeVisible();
    await expect(created.getByText("You won't see this secret again")).toBeVisible();
    const secret = await created.getByLabel("Secret", { exact: true }).inputValue();
    expect(secret).toMatch(/^bm_/);
    await expect(created.getByLabel("Login command", { exact: true })).toHaveValue(
      `echo '${secret}' | docker login ${new URL(BASE_URL).host} -u '${username}' --password-stdin`,
    );

    const token = await requestRegistryToken(repositoryName, username, secret);
    expect(token.status).toBe(200);
    expect(((await token.json()) as { token?: string }).token).toBeTruthy();

    await created.getByRole("button", { name: "Done" }).click();
    await expect(created).toBeHidden();

    const row = page.getByRole("row", { name: new RegExp(accountName) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(username);
    await expect(row).toContainText("E2E pull account");
    await expect(row).toContainText("Pull");
    await expect(row).not.toContainText("Push");

    await page.getByRole("button", { name: "Create machine account" }).click();
    await dialog.getByLabel("Name").fill(accountName);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      dialog.getByText("This name is already used by another machine account"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page
      .getByRole("button", { name: `Delete machine account ${accountName}` })
      .click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(accountName);
    await confirm.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("No machine accounts yet")).toBeVisible();
    const afterDelete = await requestRegistryToken(
      repositoryName,
      username,
      secret,
    );
    expect(afterDelete.status).toBe(401);
  });
});
