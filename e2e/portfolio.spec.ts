import { test, expect } from '@playwright/test';
import fs from 'fs';

const auth = JSON.parse(fs.readFileSync('e2e/.auth.json', 'utf-8')) as {
  email: string;
  password: string;
  userId: string;
};

test.describe('E2E: Portfolio — Manage Funds & Positions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('Welcome back');
    await page.locator('input[placeholder="you@example.com"]').fill(auth.email);
    await page.locator('input[placeholder="Enter your password"]').fill(auth.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('should navigate to portfolio and verify key sections', async ({ page }) => {
    await page.getByRole('link', { name: 'Portfolio' }).click();
    await expect(page).toHaveURL('/portfolio', { timeout: 8_000 });

    // Header
    await expect(page.locator('h1')).toContainText('Portfolio');

    // KPI cards
    await expect(page.getByText('Portfolio Value')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Cash Balance')).toBeVisible();
    await expect(page.getByText('Invested')).toBeVisible();

    // Positions table
    await expect(page.getByText('Positions')).toBeVisible();

    // Manage Funds button
    await expect(page.getByRole('button', { name: /Manage Funds/i })).toBeVisible();
  });

  test('should open Manage Funds modal and perform deposit', async ({ page }) => {
    await page.getByRole('link', { name: 'Portfolio' }).click();
    await expect(page).toHaveURL('/portfolio', { timeout: 8_000 });

    // Open Manage Funds modal
    await page.getByRole('button', { name: /Manage Funds/i }).click();
    await expect(page.getByText(/Deposit \/ Withdraw/i)).toBeVisible({ timeout: 5_000 });

    // Switch to Deposit tab (if applicable)
    const depositTab = page.getByRole('button', { name: /Deposit/i });
    if (await depositTab.isVisible()) {
      await depositTab.click();
    }

    // Enter deposit amount
    const amountInput = page.locator('input[placeholder*="Amount"]').first();
    await expect(amountInput).toBeVisible({ timeout: 3_000 });
    await amountInput.fill('5000');

    // Submit deposit
    const submitButton = page.getByRole('button', { name: /Deposit/i }).last();
    await submitButton.click();

    // Modal should close after success
    await expect(page.getByText(/Deposit \/ Withdraw/i)).not.toBeVisible({ timeout: 8_000 });

    console.log('✅ Portfolio: Deposit completed');
  });

  test('should open Manage Funds modal and perform withdraw', async ({ page }) => {
    await page.getByRole('link', { name: 'Portfolio' }).click();
    await expect(page).toHaveURL('/portfolio', { timeout: 8_000 });

    // Open Manage Funds modal
    await page.getByRole('button', { name: /Manage Funds/i }).click();
    await expect(page.getByText(/Deposit \/ Withdraw/i)).toBeVisible({ timeout: 5_000 });

    // Switch to Withdraw tab
    const withdrawTab = page.getByRole('button', { name: /Withdraw/i });
    if (await withdrawTab.isVisible()) {
      await withdrawTab.click();
    }

    // Enter withdraw amount
    const amountInput = page.locator('input[placeholder*="Amount"]').first();
    await expect(amountInput).toBeVisible({ timeout: 3_000 });
    await amountInput.fill('250');

    // Submit withdraw
    const submitButton = page.getByRole('button', { name: /Withdraw/i }).last();
    await submitButton.click();

    // Modal should close after success
    await expect(page.getByText(/Deposit \/ Withdraw/i)).not.toBeVisible({ timeout: 8_000 });

    console.log('✅ Portfolio: Withdraw completed');
  });

  test('should verify performance chart and allocation pie', async ({ page }) => {
    await page.getByRole('link', { name: 'Portfolio' }).click();
    await expect(page).toHaveURL('/portfolio', { timeout: 8_000 });

    // Performance chart section
    await expect(page.getByText('Performance Over Time')).toBeVisible({ timeout: 5_000 });

    // Allocation section
    await expect(page.getByText('Allocation')).toBeVisible();

    // Recharts renders SVG
    await expect(page.locator('.recharts-area').first()).toBeVisible({ timeout: 5_000 });

    console.log('✅ Portfolio: Charts verified');
  });
});