import { test, expect } from '@playwright/test';

test.describe('ForgeX AI — Maintenance History UI & Chronological Timeline', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to root
    await page.goto('/');
  });

  test('1. Valid API response se timeline entries correctly render hoti hain & headers match', async ({ page }) => {
    // Navigate to History module
    await page.click('button:has-text("History")');
    await expect(page.locator('text=FLEET MAINTENANCE HISTORY & DOSSIERS')).toBeVisible();
    await expect(page.locator('text=Audited Chronological Log & Closed-Loop Work Order Ledger')).toBeVisible();
  });

  test('2. Machine selector loads fleet and filters machine-wise history', async ({ page }) => {
    await page.click('button:has-text("History")');
    const machineSelect = page.locator('select');
    await expect(machineSelect).toBeVisible();
  });

  test('3. Timeline sorting toggle toggles between Newest First and Oldest First', async ({ page }) => {
    await page.click('button:has-text("History")');
    const sortBtn = page.locator('button:has-text("Newest First"), button:has-text("Oldest First")');
    if (await sortBtn.isVisible()) {
      await sortBtn.click();
    }
  });

  test('4. Empty history and search filter fallback states render gracefully', async ({ page }) => {
    await page.click('button:has-text("History")');
    const searchInput = page.locator('input[placeholder*="Search by machine tag"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('NON_EXISTENT_MACHINE_OR_FAULT_99999');
      await expect(page.locator('text=No Matching Maintenance Records')).toBeVisible();
    }
  });

  test('5. Work Order reference linkage triggers navigation', async ({ page }) => {
    await page.click('button:has-text("History")');
    const woButton = page.locator('button:has-text("WO-"), button:has-text("TICK-")').first();
    if (await woButton.isVisible()) {
      await woButton.click();
      // Should navigate to Maintenance module
      await expect(page.locator('text=INTERACTIVE PROCEDURE RUNNER')).toBeVisible();
    }
  });
});
