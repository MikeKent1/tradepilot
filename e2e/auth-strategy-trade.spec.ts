import { test, expect } from '@playwright/test';
import fs from 'fs';

// Read credentials written by global-setup.ts
const auth = JSON.parse(fs.readFileSync('e2e/.auth.json', 'utf-8')) as {
  email: string;
  password: string;
  userId: string;
};

test.describe('E2E: Login → Dashboard → Strategy → Trade → Analytics', () => {
  test('full user journey', async ({ page }) => {
    // ═══════════════════════════════════════════════════════
    // 1. LOGIN
    // ═══════════════════════════════════════════════════════
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('Welcome back');

    await page.locator('input[placeholder="you@example.com"]').fill(auth.email);
    await page.locator('input[placeholder="Enter your password"]').fill(auth.password);
    await page.locator('button[type="submit"]').click();

    // ═══════════════════════════════════════════════════════
    // 2. DASHBOARD (redirect after login)
    // ═══════════════════════════════════════════════════════
    await expect(page).toHaveURL('/', { timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible({
      timeout: 5_000,
    });

    // ═══════════════════════════════════════════════════════
    // 3. NAVIGATE TO STRATEGIES → CREATE STRATEGY
    // ═══════════════════════════════════════════════════════
    await page.getByRole('link', { name: 'Strategies' }).click();
    await expect(page).toHaveURL('/strategies', { timeout: 8_000 });

    // Click "New Strategy" button
    await page.getByRole('button', { name: /New Strategy/i }).click();

    // Modal: fill strategy name
    const nameInput = page.locator('input[placeholder="e.g. Golden Cross Scalper"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill('E2E Scalping Bot');

    // Fill description
    const descInput = page.locator('textarea');
    await descInput.fill('Automated E2E test strategy');

    // Click "Create Strategy" button (the last one on the page)
    await page.getByRole('button', { name: /Create Strategy/i }).last().click();

    // Verify strategy appears in list
    await expect(page.locator('text=E2E Scalping Bot')).toBeVisible({
      timeout: 8_000,
    });

    console.log('✅ Step 1-3: Login → Dashboard → Create Strategy');

    // ═══════════════════════════════════════════════════════
    // 4. EXECUTE A TRADE
    // ═══════════════════════════════════════════════════════
    await page.getByRole('link', { name: 'Trades' }).click();
    await expect(page).toHaveURL('/trades', { timeout: 8_000 });
    await expect(page.getByText('Execute and review your trades')).toBeVisible();

    // Fill trade form — use the real placeholders from the component
    const symbolInput = page.locator('input[placeholder="e.g. AAPL"]');
    await expect(symbolInput).toBeVisible({ timeout: 8_000 });
    await symbolInput.fill('AAPL');

    const qtyInput = page.locator('input[placeholder="0"]');
    await qtyInput.fill('10');

    const priceInput = page.locator('input[placeholder="0.00"]');
    await priceInput.fill('185.50');

    // Buy button appears only after quantity + price are filled (total > 0)
    const buyButton = page.getByRole('button', { name: /Buy AAPL/i });
    await expect(buyButton).toBeVisible({ timeout: 5_000 });

    // Execute the trade
    await buyButton.click();

    // Verify trade appears in Trade History table
    await expect(page.locator('td:has-text("AAPL")').first()).toBeVisible({
      timeout: 10_000,
    });

    console.log('✅ Step 4: Execute Trade');

    // ═══════════════════════════════════════════════════════
    // 5. VERIFY ANALYTICS
    // ═══════════════════════════════════════════════════════
    await page.getByRole('link', { name: 'Analytics' }).click();
    await expect(page).toHaveURL('/analytics', { timeout: 8_000 });
    await expect(page.getByText('Performance Analytics')).toBeVisible();

    // Verify KPI cards are present (Total Trades, Win Rate, etc.)
    await expect(page.getByText('Total Trades')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Win Rate')).toBeVisible();
    await expect(page.getByText('Total P&L')).toBeVisible();

    // Verify equity curve section exists
    await expect(page.getByText('Equity Curve')).toBeVisible();

    console.log('✅ Step 5: Verify Analytics');

    // ═══════════════════════════════════════════════════════
    // 6. NAVIGATE BACK TO TRADES → VERIFY TRADE HISTORY
    // ═══════════════════════════════════════════════════════
    await page.getByRole('link', { name: 'Trades' }).click();
    await expect(page).toHaveURL('/trades', { timeout: 8_000 });

    // The trade history table should still show our AAPL trade
    const tradeRows = page.locator('tr:has(td:has-text("AAPL"))');
    await expect(tradeRows.first()).toBeVisible({ timeout: 5_000 });

    console.log('✅ Step 6: Verify Trade History persistence');
    console.log(
      `🎉 Full E2E journey passed for ${auth.email}: Login → Dashboard → Create Strategy → Execute Trade → Verify Analytics`
    );
  });
});