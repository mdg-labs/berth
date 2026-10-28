// Copyright (c) 2026 Michael David Guggenbichler (MDG Labs), licensed under Apache-2.0 — see LICENSE

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@localhost";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "test-admin-password";

async function requestPullToken(
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

async function createRepository(page: Page, name: string): Promise<void> {
  await page.goto("/repositories");
  await page.getByRole("button", { name: "New repository" }).click();
  await page.locator("#repository-name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator(`a[href="/r/${name}"]`)).toBeVisible();
}

test.describe("host machine accounts", () => {
  test("create, edit the repository list, rotate", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const repoA = `e2eha${suffix}`.slice(0, 20);
    const repoB = `e2ehb${suffix}`.slice(0, 20);
    const hostName = `deploy-${suffix}`;
    const username = `host+${hostName}`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/repositories$/);

    await createRepository(page, repoA);
    await createRepository(page, repoB);

    await page.goto("/admin/machine-accounts");
    await page.getByRole("button", { name: "Create host account" }).click();
    const dialog = page.getByRole("dialog", { name: "Create host account" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Pull only:")).toBeVisible();

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

    await dialog.getByLabel("Name", { exact: true }).fill("Not A Slug!");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      dialog.getByText("Use 2 to 63 lowercase letters, digits and hyphens"),
    ).toBeVisible();
    await expect(dialog.getByText("Select at least one repository.")).toBeVisible();

    await dialog.getByLabel("Name", { exact: true }).fill(hostName);
    await dialog.getByLabel("Description (optional)").fill("E2E deploy host");
    await dialog.getByRole("checkbox", { name: repoA, exact: true }).check();
    await dialog.getByRole("checkbox", { name: repoB, exact: true }).check();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();

    const created = page.getByRole("dialog", { name: "Host account created" });
    await expect(created).toBeVisible();
    await expect(created.getByText("You won't see this secret again")).toBeVisible();
    const secret = await created.getByLabel("Secret", { exact: true }).inputValue();
    expect(secret).toMatch(/^bm_/);
    await expect(created.getByLabel("Login command", { exact: true })).toHaveValue(
      `echo '${secret}' | docker login ${new URL(BASE_URL).host} -u '${username}' --password-stdin`,
    );

    expect((await requestPullToken(repoA, username, secret)).status).toBe(200);
    expect((await requestPullToken(repoB, username, secret)).status).toBe(200);

    await created.getByRole("button", { name: "Done" }).click();
    await expect(created).toBeHidden();

    const row = page.getByRole("row", { name: new RegExp(hostName) });
    await expect(row).toContainText(repoA);
    await expect(row).toContainText(repoB);
    await expect(row).toContainText("Pull");
    await expect(row).not.toContainText("Push");

    await page.getByRole("button", { name: "Create host account" }).click();
    await dialog.getByLabel("Name", { exact: true }).fill(hostName);
    await dialog.getByRole("checkbox", { name: repoA, exact: true }).check();
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      dialog.getByText("This name is already used by another host account."),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page
      .getByRole("button", { name: `Edit host machine account ${hostName}` })
      .click();
    const edit = page.getByRole("dialog", { name: `Edit ${hostName}` });
    await expect(edit).toBeVisible();
    await edit.getByRole("checkbox", { name: repoA, exact: true }).uncheck();
    await edit.getByRole("checkbox", { name: repoB, exact: true }).uncheck();
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit.getByText("Select at least one repository.")).toBeVisible();
    await edit.getByRole("checkbox", { name: repoA, exact: true }).check();
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();

    await expect(row).toContainText(repoA);
    await expect(row).not.toContainText(repoB);
    expect((await requestPullToken(repoA, username, secret)).status).toBe(200);
    expect((await requestPullToken(repoB, username, secret)).status).toBe(403);

    await page
      .getByRole("button", { name: `Rotate secret of machine account ${hostName}` })
      .click();
    const rotate = page.getByRole("dialog", { name: `Rotate secret of ${hostName}` });
    await expect(rotate).toBeVisible();
    await rotate.getByRole("button", { name: "Rotate secret", exact: true }).click();
    const rotated = page.getByRole("dialog", { name: "Secret rotated" });
    await expect(rotated).toBeVisible();
    const newSecret = await rotated
      .getByLabel("Secret", { exact: true })
      .inputValue();
    expect(newSecret).toMatch(/^bm_/);
    expect(newSecret).not.toBe(secret);
    await rotated.getByRole("button", { name: "Done" }).click();
    await expect(rotated).toBeHidden();

    expect((await requestPullToken(repoA, username, secret)).status).toBe(401);
    expect((await requestPullToken(repoA, username, newSecret)).status).toBe(200);
    expect((await requestPullToken(repoB, username, newSecret)).status).toBe(403);

    await page
      .getByRole("button", { name: `Delete machine account ${hostName}` })
      .click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(confirm).toBeHidden();
    await expect(row).toBeHidden();
    expect((await requestPullToken(repoA, username, newSecret)).status).toBe(401);
  });
});
