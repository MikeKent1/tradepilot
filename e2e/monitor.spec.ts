import { test, expect } from '@playwright/test';
import fs from 'fs';

const auth = JSON.parse(fs.readFileSync('e2e/.auth.json', 'utf-8')) as {
  email: string;
  password: string;
  userId: string;
};

test.describe('E2E: Monitor — Live Market Feed & Risk Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('Welcome back');
    await page.locator('input[placeholder="you@example.com"]').fill(auth.email);
    await page.locator('input[placeholder="Enter your password"]').fill(auth.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('should navigate to monitor and verify key sections', async ({ page }) => {
    await page.getByRole('link', { name: /Monitor/i }).click();
    await expect(page).toHaveURL('/monitor', { timeout: 8_000 });

    // Header
    await expect(page.locator('h1')).toContainText('Monitor');

    // Market feed section with default symbols
    await expect(page.getByText('AAPL')).toBeVisible({ timeout: 10_000 });

    // Key stats should be visible
    await expect(page.getByText(/Polls/i)).toBeVisible({ timeout: 5_000 });

    console.log('✅ Monitor: Page loaded with market data');
  });

  test('should show circuit breaker status', async ({ page }) => {
    await page.getByRole('link', { name: /Monitor/i }).click();
    await expect(page).toHaveURL('/monitor', { timeout: 8_000 });

    // Circuit breaker status (Shield icon area)
    // The circuit breaker state should be visible
    await expect(page.getByText(/Circuit Breaker/i)).toBeVisible({ timeout: 8_000 });

    console.log('✅ Monitor: Circuit breaker visible');
  });

  test('should display risk metrics dashboard', async ({ page }) => {
    await page.getByRole('link', { name: /Monitor/i }).click();
    await expect(page).toHaveURL('/monitor', { timeout: 8_000 });

    // Risk metrics section
    await expect(page.getByText(/Risk Metrics/i)).toBeVisible({ timeout: 5_000 });

    // Key risk indicators (these come from RiskManager)
    await expect(page.getByText(/Max Drawdown/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Sharpe Ratio/i)).toBeVisible();
    await expect(page.getByText(/Volatility/i)).toBeVisible();

    console.log('✅ Monitor: Risk metrics dashboard verified');
  });

  test('should show Alpaca connection card', async ({ page }) => {
    await page.getByRole('link', { name: /Monitor/i }).click();
    await expect(page).toHaveURL('/monitor', { timeout: 8_000 });

    // Alpaca status card — either connected or disconnected
    const alpacaSection = page.getByText(/Alpaca/i);
    await expect(alpacaSection.first()).toBeVisible({ timeout: 8_000 });

    console.log('✅ Monitor: Alpaca status visible');
  });

  test('should verify quote cards for multiple symbols', async ({ page }) => {
    await page.getByRole('link', { name: /Monitor/i }).click();
    await expect(page).toHaveURL('/monitor', { timeout: 8_000 });

    // Wait for quotes to load — symbols like AAPL should appear in quote cards
    await expect(page.getByText('AAPL').first()).toBeVisible({ timeout: 12_000 });

    // Each quote card should show price and change
    await expect(page.getByText(/\$/).first()).toBeVisible({ timeout: 5_000 });

    console.log('✅ Monitor: Quote cards loaded');
  });
});