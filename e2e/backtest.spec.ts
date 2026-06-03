import { test, expect } from '@playwright/test';
import fs from 'fs';

const auth = JSON.parse(fs.readFileSync('e2e/.auth.json', 'utf-8')) as {
  email: string;
  password: string;
  userId: string;
};

test.describe('E2E: Backtest — Run backtest on a strategy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('Welcome back');
    await page.locator('input[placeholder="you@example.com"]').fill(auth.email);
    await page.locator('input[placeholder="Enter your password"]').fill(auth.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('should navigate to strategy detail and see backtest section', async ({ page }) => {
    // Navigate to Strategies
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    // Use existing strategy or create one
    const strategyLink = page.locator('a[href*="/strategies/"]').first();
    if (!(await strategyLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // Create quick strategy
      await page.getByRole('button', { name: /New Strategy/i }).click();
      const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill('Backtest Test Strategy');
      const descInput = page.locator('textarea');
      await descInput.fill('For E2E backtest');
      await page.getByRole('button', { name: /Create Strategy/i }).last().click();
      await expect(page.locator('text=Backtest Test Strategy')).toBeVisible({ timeout: 8_000 });
      await page.locator('text=Backtest Test Strategy').click();
    } else {
      await strategyLink.click();
    }

    // Strategy detail should show backtest section or "Run Backtest" button
    await expect(page.getByText(/Backtest/i)).toBeVisible({ timeout: 8_000 });

    console.log('✅ Backtest: Strategy detail shows backtest section');
  });

  test('should run a backtest and see results', async ({ page }) => {
    // Navigate to first strategy
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    const strategyLink = page.locator('a[href*="/strategies/"]').first();
    if (!(await strategyLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await page.getByRole('button', { name: /New Strategy/i }).click();
      const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill('Run Backtest Strategy');
      const descInput = page.locator('textarea');
      await descInput.fill('Run backtest E2E');
      await page.getByRole('button', { name: /Create Strategy/i }).last().click();
      await expect(page.locator('text=Run Backtest Strategy')).toBeVisible({ timeout: 8_000 });
      await page.locator('text=Run Backtest Strategy').click();
    } else {
      await strategyLink.click();
    }

    // Find and click "Run Backtest" button
    const runBacktestBtn = page.getByRole('button', { name: /Run Backtest/i });
    await expect(runBacktestBtn).toBeVisible({ timeout: 5_000 });
    await runBacktestBtn.click();

    // Wait for backtest results — should show metrics
    await expect(page.getByText(/Total Trades|Win Rate|Total P&L|Sharpe/i)).toBeVisible({
      timeout: 15_000,
    });

    console.log('✅ Backtest: Results displayed');
  });

  test('should see equity curve chart after backtest', async ({ page }) => {
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    const strategyLink = page.locator('a[href*="/strategies/"]').first();
    if (!(await strategyLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await page.getByRole('button', { name: /New Strategy/i }).click();
      const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill('Chart Backtest Strategy');
      const descInput = page.locator('textarea');
      await descInput.fill('Chart E2E');
      await page.getByRole('button', { name: /Create Strategy/i }).last().click();
      await expect(page.locator('text=Chart Backtest Strategy')).toBeVisible({ timeout: 8_000 });
      await page.locator('text=Chart Backtest Strategy').click();
    } else {
      await strategyLink.click();
    }

    // Run backtest
    const runBacktestBtn = page.getByRole('button', { name: /Run Backtest/i });
    await expect(runBacktestBtn).toBeVisible({ timeout: 5_000 });
    await runBacktestBtn.click();

    // Wait for equity curve chart
    await expect(page.locator('.recharts-responsive-container, [data-testid="equity-curve"]')).toBeVisible({
      timeout: 15_000,
    });

    console.log('✅ Backtest: Equity curve chart displayed');
  });

  test('should display trade list after backtest', async ({ page }) => {
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    const strategyLink = page.locator('a[href*="/strategies/"]').first();
    if (!(await strategyLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await page.getByRole('button', { name: /New Strategy/i }).click();
      const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill('Trade List Strategy');
      const descInput = page.locator('textarea');
      await descInput.fill('Trade list E2E');
      await page.getByRole('button', { name: /Create Strategy/i }).last().click();
      await expect(page.locator('text=Trade List Strategy')).toBeVisible({ timeout: 8_000 });
      await page.locator('text=Trade List Strategy').click();
    } else {
      await strategyLink.click();
    }

    // Run backtest
    await page.getByRole('button', { name: /Run Backtest/i }).click();

    // Wait for trade list table
    await expect(page.getByText(/Trade List|Trades|History/i)).toBeVisible({ timeout: 15_000 });

    // Should see trade entries with symbols
    await expect(page.locator('td, .trade-row').first()).toBeVisible({ timeout: 8_000 });

    console.log('✅ Backtest: Trade list displayed');
  });
});