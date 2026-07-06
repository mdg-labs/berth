// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import { test } from "@playwright/test";

/**
 * OIDC login E2E is skipped in CI — no IdP container in compose.ci.yml.
 * See DECISIONS.md Phase 10 for rationale.
 */
test.describe("OIDC login", () => {
  test.skip(
    !process.env.E2E_OIDC_ENABLED,
    "OIDC IdP not configured in CI compose stack",
  );

  test("redirects to IdP and returns with session", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with OIDC" }).click();
    // IdP-specific assertions would go here when E2E_OIDC_ENABLED is set.
  });
});
