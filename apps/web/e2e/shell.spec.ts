import { test, expect } from '@playwright/test';

test.describe('ForgeX AI — Industrial Engineering Workspace Shell', () => {
  test('renders top telemetry rail and brand mark', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/ForgeX AI/);

    // Verify brand mark
    await expect(page.locator('text=ForgeX.AI')).toBeVisible();
    await expect(page.locator('text=OT-L3.5')).toBeVisible();

    // Verify sovereign air-gap badge
    await expect(page.locator('text=AIR-GAPPED [LOCAL RUNTIME]')).toBeVisible();
  });

  test('navigates across all 10 industrial workspace modules', async ({ page }) => {
    await page.goto('/');

    // 1. Overview
    await page.click('button:has-text("Overview")');
    await expect(page.locator('text=Operational Intelligence Overview')).toBeVisible();

    // 2. Plants & Assets
    await page.click('button:has-text("Plants & Assets")');
    await expect(page.locator('text=Plant Equipment & Asset Directory')).toBeVisible();

    // 3. Knowledge Hub
    await page.click('button:has-text("Knowledge Hub")');
    await expect(page.locator('text=Document Dossier')).toBeVisible();

    // 4. AI Copilot
    await page.click('button:has-text("AI Copilot")');
    await expect(page.locator('text=GROUNDED DIAGNOSTIC ENGINE')).toBeVisible();

    // 5. Troubleshooting
    await page.click('button:has-text("Troubleshooting")');
    await expect(page.locator('text=Diagnostic Troubleshooting & Root Cause Analysis')).toBeVisible();

    // 7. Maintenance
    await page.click('button:has-text("Maintenance")');
    await expect(page.locator('text=INTERACTIVE PROCEDURE RUNNER')).toBeVisible();

    // 8. Expert Knowledge
    await page.click('button:has-text("Expert Knowledge")');
    await expect(page.locator('text=Expert Knowledge & Tribal Wisdom Repository')).toBeVisible();

    // 9. Security & Audit
    await page.click('button:has-text("Security & Audit")');
    await expect(page.locator('text=Tamper-Evident Compliance & Audit Ledger')).toBeVisible();

    // 10. Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('text=System Configuration & Inference Policy')).toBeVisible();
  });

  test('opens and closes telemetry health modal', async ({ page }) => {
    await page.goto('/');

    // Open health modal via sidebar trigger
    await page.click('button:has-text("Stack Telemetry")');
    await expect(page.locator('text=Subsystem Telemetry & Infrastructure Health')).toBeVisible();
    await expect(page.locator('text=PostgreSQL Relational Store')).toBeVisible();
    await expect(page.locator('text=Qdrant Multimodal Vector Store')).toBeVisible();

    // Close inspector
    await page.click('button:has-text("Close Inspector")');
    await expect(page.locator('text=Subsystem Telemetry & Infrastructure Health')).not.toBeVisible();
  });
});
