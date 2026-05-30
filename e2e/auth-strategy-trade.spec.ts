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
    await page.locator('input[placeholder="Enter your password"]').fill(auth.password);
    await page.locator('button[type="submit"]').click();

    // ─── 2. DASHBOARD (redirect after login) ─────────────
    await expect(page).toHaveURL('/', { timeout: 10_000 });
    // Just verify we see the sidebar navigation (Dashboard link)
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 5_000 });

    // ─── 3. NAVIGATE TO STRATEGIES ───────────────────────
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    // ─── 4. CREATE STRATEGY ──────────────────────────────
    // Click "New Strategy" button (page heading area)
    await page.getByRole('button', { name: /New Strategy/i }).click();

    // Modal: fill strategy name (placeholder: "e.g. Golden Cross Scalper")
    const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill('E2E Scalping Bot');

    // Fill description
    const descInput = page.locator('textarea');
    await descInput.fill('Automated E2E test strategy');

    // Click "Create Strategy" button inside the modal (the last one on the page)
    await page.getByRole('button', { name: /Create Strategy/i }).last().click();

    // Verify strategy appears in list
    await expect(page.locator('text=E2E Scalping Bot')).toBeVisible({
      timeout: 8_000,
    });

    console.log(
      `✅ E2E passed: Login → Dashboard → Create Strategy for ${auth.email}`
    );
  });
});