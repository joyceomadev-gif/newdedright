/**
 * End-to-end test: change scoring_scheme + cumulative_method in
 * Administration → Settings, then verify the Gradebook recalculates
 * immediately (cumulative/grade columns appear or disappear).
 *
 * SKIPPED by default. To run locally:
 *   1. bun add -d @playwright/test && bunx playwright install chromium
 *   2. Set env: E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD (admin user)
 *   3. Seed at least one class + subject + a few CA/exam scores
 *   4. Remove `.skip` below and run: bunx playwright test
 *
 * Cannot run inside the restricted build sandbox (no Playwright browsers,
 * no seeded admin auth state).
 */
// @ts-nocheck — guarded by .skip; @playwright/test is not installed by default
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe.skip("Gradebook recalculates on settings change", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/dashboard|administration|academics/);
  });

  test("switching to display_only hides cumulative/grade in Gradebook", async ({ page }) => {
    // 1) Open Administration → Settings, set scheme = weighted, save.
    await page.goto(`${BASE}/administration`);
    await page.getByRole("tab", { name: /settings/i }).click();
    await page.getByLabel(/scoring scheme/i).click();
    await page.getByRole("option", { name: /weighted/i }).click();
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(/settings saved/i)).toBeVisible();

    // 2) Visit Gradebook, pick first class + subject, expect cumulative column.
    await page.goto(`${BASE}/academics`);
    await page.getByRole("tab", { name: /gradebook/i }).click();
    await page.getByLabel(/class/i).click();
    await page.getByRole("option").first().click();
    await page.getByLabel(/subject/i).click();
    await page.getByRole("option").first().click();
    await expect(page.getByRole("columnheader", { name: /cumulative/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /grade/i })).toBeVisible();

    // 3) Switch to display_only in another tab, save, return to Gradebook.
    await page.goto(`${BASE}/administration`);
    await page.getByRole("tab", { name: /settings/i }).click();
    await page.getByLabel(/scoring scheme/i).click();
    await page.getByRole("option", { name: /display only/i }).click();
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(/settings saved/i)).toBeVisible();

    await page.goto(`${BASE}/academics`);
    await page.getByRole("tab", { name: /gradebook/i }).click();
    // Cumulative + Grade columns should be gone, raw "/" parts should appear.
    await expect(page.getByRole("columnheader", { name: /cumulative/i })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /grade/i })).toHaveCount(0);
  });

  test("switching cumulative_method updates the cumulative value live", async ({ page }) => {
    await page.goto(`${BASE}/administration`);
    await page.getByRole("tab", { name: /settings/i }).click();
    await page.getByLabel(/cumulative method/i).click();
    await page.getByRole("option", { name: /average of terms/i }).click();
    await page.getByRole("button", { name: /save/i }).click();

    await page.goto(`${BASE}/academics`);
    await page.getByRole("tab", { name: /gradebook/i }).click();
    const avgValue = await page.locator("tbody tr").first().locator("td").nth(-2).textContent();

    await page.goto(`${BASE}/administration`);
    await page.getByRole("tab", { name: /settings/i }).click();
    await page.getByLabel(/cumulative method/i).click();
    await page.getByRole("option", { name: /sum of terms/i }).click();
    await page.getByRole("button", { name: /save/i }).click();

    await page.goto(`${BASE}/academics`);
    await page.getByRole("tab", { name: /gradebook/i }).click();
    const sumValue = await page.locator("tbody tr").first().locator("td").nth(-2).textContent();
    expect(sumValue).not.toBe(avgValue);
  });
});
