import { test, expect } from '@playwright/test';
import fs from 'fs';

// Read credentials written by global-setup.ts
const auth = JSON.parse(fs.readFileSync('e2e/.auth.json', 'utf-8')) as {
  email: string;
  password: string;
  userId: string;
};

test.describe('E2E: Login → Dashboard → Create Strategy', () => {
  test('full user journey from login to strategy creation', async ({ page }) => {
    // ─── 1. LOGIN ────────────────────────────────────────
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('Welcome back');

    await page.locator('input[placeholder="you@example.com"]').fill(auth.email);
    await page.locator('input[placeholder="••••••••"]').fill(auth.password);
    await page.locator('button[type="submit"]').click();

    // ─── 2. DASHBOARD (redirect after login) ─────────────
    await expect(page).toHaveURL('/', { timeout: 10_000 });
    await expect(
      page.locator('text=Dashboard').or(page.locator('text=Strategy Lab'))
    ).toBeVisible({ timeout: 5_000 });

    // ─── 3. NAVIGATE TO STRATEGIES ───────────────────────
    await page.locator('a[href="/strategies"]').first().click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });
    await expect(
      page.locator('h1, h2').filter({ hasText: /Strategies|strategy/i })
    ).toBeVisible({ timeout: 5_000 });

    // ─── 4. CREATE STRATEGY ──────────────────────────────
    await page
      .locator('button:has-text("Create")')
      .or(page.locator('button:has-text("New")'))
      .first()
      .click();

    const nameInput = page
      .locator(
        'input[placeholder*="Strategy"], input[placeholder*="Name"], input[placeholder*="name"]'
      )
      .first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill('E2E Scalping Bot');

    const descInput = page.locator('textarea, input[placeholder*="Desc"]').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill('Automated E2E test strategy');
    }

    await page
      .locator('button:has-text("Save")')
      .or(page.locator('button:has-text("Create")'))
      .last()
      .click();

    await expect(page.locator('text=E2E Scalping Bot')).toBeVisible({
      timeout: 8_000,
    });

    console.log(
      `✅ E2E passed: Login → Dashboard → Create Strategy for ${auth.email}`
    );
  });
});