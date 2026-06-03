import { test, expect } from '@playwright/test';
import fs from 'fs';

const auth = JSON.parse(fs.readFileSync('e2e/.auth.json', 'utf-8')) as {
  email: string;
  password: string;
  userId: string;
};

test.describe('E2E: Live Strategy Trading — Start, Monitor, Pause', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('Welcome back');
    await page.locator('input[placeholder="you@example.com"]').fill(auth.email);
    await page.locator('input[placeholder="Enter your password"]').fill(auth.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('should create a strategy and navigate to its live page', async ({ page }) => {
    // Navigate to Strategies
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    // Create a strategy for live testing
    await page.getByRole('button', { name: /New Strategy/i }).click();

    const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill('Live Test Strategy');

    const descInput = page.locator('textarea');
    await descInput.fill('For E2E live trading test');

    await page.getByRole('button', { name: /Create Strategy/i }).last().click();

    // Verify strategy created
    await expect(page.locator('text=Live Test Strategy')).toBeVisible({ timeout: 8_000 });

    // Click on the strategy to go to its detail page
    await page.locator('text=Live Test Strategy').click();

    // Look for the "Go Live" button on strategy detail
    const goLiveButton = page.getByRole('button', { name: /Go Live/i });
    await expect(goLiveButton).toBeVisible({ timeout: 5_000 });
    await goLiveButton.click();

    // Verify we're on the live trading page
    await expect(page.locator('h1')).toContainText('Live Trading', { timeout: 8_000 });

    console.log('✅ Live Strategy: Created strategy and navigated to live page');
  });

  test('should show engine controls on live page', async ({ page }) => {
    // First create a strategy and go live (reuse logic from above)
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    // Use existing strategy if any, or create one
    const existingStrategy = page.locator('a[href*="/strategies/"]').first();
    if (await existingStrategy.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await existingStrategy.click();
    } else {
      // Create quick strategy
      await page.getByRole('button', { name: /New Strategy/i }).click();
      const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill('Quick Live Test');
      const descInput = page.locator('textarea');
      await descInput.fill('Quick E2E test');
      await page.getByRole('button', { name: /Create Strategy/i }).last().click();
      await expect(page.locator('text=Quick Live Test')).toBeVisible({ timeout: 8_000 });
      await page.locator('text=Quick Live Test').click();
    }

    // Go to live page
    const goLiveButton = page.getByRole('button', { name: /Go Live/i });
    await expect(goLiveButton).toBeVisible({ timeout: 5_000 });
    await goLiveButton.click();

    // Verify controls
    await expect(page.locator('h1')).toContainText('Live Trading', { timeout: 8_000 });

    // Start button should be visible when idle
    await expect(page.getByRole('button', { name: /Start/i })).toBeVisible({ timeout: 5_000 });

    // Mode toggle should be visible
    await expect(page.getByText(/Auto Execute|Manual Approval/i)).toBeVisible();

    // Alpaca connection indicator
    await expect(page.getByText(/Alpaca:/i)).toBeVisible({ timeout: 5_000 });

    // Stats bar
    await expect(page.getByText('Signals Today')).toBeVisible();
    await expect(page.getByText('Open Positions')).toBeVisible();
    await expect(page.getByText('Session P&L')).toBeVisible();

    console.log('✅ Live Strategy: Controls and stats verified');
  });

  test('should start engine and see activity log', async ({ page }) => {
    // Navigate to strategies and pick first one
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    const strategyLink = page.locator('a[href*="/strategies/"]').first();
    if (!(await strategyLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // Create one
      await page.getByRole('button', { name: /New Strategy/i }).click();
      const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill('Engine Test Strategy');
      const descInput = page.locator('textarea');
      await descInput.fill('Engine E2E test');
      await page.getByRole('button', { name: /Create Strategy/i }).last().click();
      await expect(page.locator('text=Engine Test Strategy')).toBeVisible({ timeout: 8_000 });
      await page.locator('text=Engine Test Strategy').click();
    } else {
      await strategyLink.click();
    }

    // Go live
    await page.getByRole('button', { name: /Go Live/i }).click();
    await expect(page.locator('h1')).toContainText('Live Trading', { timeout: 8_000 });

    // Click Start
    await page.getByRole('button', { name: /Start/i }).click();

    // Wait for engine to produce log entries
    await expect(page.getByText(/State:/i).first()).toBeVisible({ timeout: 10_000 });

    // Activity Log section
    await expect(page.getByText('Activity Log')).toBeVisible();

    // Stop the engine
    const stopButton = page.getByRole('button', { name: /Stop/i });
    if (await stopButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await stopButton.click();
    }

    console.log('✅ Live Strategy: Engine started and logs produced');
  });

  test('should toggle between auto and manual mode', async ({ page }) => {
    // Navigate to strategies → pick one → go live
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    const strategyLink = page.locator('a[href*="/strategies/"]').first();
    if (!(await strategyLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
      await page.getByRole('button', { name: /New Strategy/i }).click();
      const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill('Mode Test Strategy');
      const descInput = page.locator('textarea');
      await descInput.fill('Mode toggle E2E test');
      await page.getByRole('button', { name: /Create Strategy/i }).last().click();
      await expect(page.locator('text=Mode Test Strategy')).toBeVisible({ timeout: 8_000 });
      await page.locator('text=Mode Test Strategy').click();
    } else {
      await strategyLink.click();
    }

    await page.getByRole('button', { name: /Go Live/i }).click();
    await expect(page.locator('h1')).toContainText('Live Trading', { timeout: 8_000 });

    // Default should be Auto Execute
    await expect(page.getByText(/Auto Execute/)).toBeVisible();

    // Toggle to Manual
    const modeToggle = page.getByRole('button', { name: /Auto Execute|Manual Approval/i });
    await modeToggle.click();
    await expect(page.getByText(/Manual Approval/)).toBeVisible({ timeout: 5_000 });

    // Toggle back to Auto
    await modeToggle.click();
    await expect(page.getByText(/Auto Execute/)).toBeVisible({ timeout: 5_000 });

    console.log('✅ Live Strategy: Mode toggle works');
  });
});