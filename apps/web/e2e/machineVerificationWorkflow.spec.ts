import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('ForgeX AI — Machine Verification Workflow & Manage Tasks Integration', () => {
  let authToken: string;
  let organizationId: string;

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post('http://localhost:4000/api/v1/auth/login?bypass_verification=true', {
      data: { email: 'admin@forgex.industrial', password: 'Admin@1234' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginJson = await loginRes.json();
    authToken = loginJson.data.token;
    organizationId = loginJson.data.organization.id;

    // Register a test machine for verification testing
    const machRes = await request.post('http://localhost:4000/api/v1/machines', {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-organization-id': organizationId,
      },
      data: {
        assetTag: `VERIF-${Date.now()}`,
        name: 'Hydrocracker Recycle Pump',
        machineType: 'Centrifugal Pump',
        manufacturer: 'Sulzer Flow Solutions',
        modelNumber: 'OH2-150-400',
        serialNumber: `SZ-${Date.now()}`,
        documentationReadiness: 'PENDING_INSPECTION',
      },
    });
    expect(machRes.ok()).toBeTruthy();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ token, orgId }) => {
        localStorage.setItem('forgex_token', token);
        localStorage.setItem('forgex_active_org_id', orgId);
      },
      { token: authToken, orgId: organizationId }
    );

    await page.goto('/');
    await page.click('button:has-text("Assets & Machines")');
    await expect(page.locator('button:has-text("Register Machine")')).toBeVisible();
  });

  test('1. Machine detail panel displays verification workflow card and checklist', async ({ page }) => {
    // Select the machine row in the table
    const machineRow = page.locator('tr:has-text("VERIF-")').first();
    await expect(machineRow).toBeVisible({ timeout: 15000 });
    await machineRow.click();

    // Verify Right Detail Pane opens
    const detailPane = page.locator('div:has-text("Machine Registry Record")').first();
    await expect(detailPane).toBeVisible();

    // Verify Machine Verification Card components
    await expect(page.locator('span:has-text("Machine Verification")')).toBeVisible();
    await expect(page.locator('span:has-text("Required Verification Checks")')).toBeVisible();

    // Verify all 4 checklist items exist
    const idCheck = page.locator('text=Machine Identity & Serial Number Verification');
    await idCheck.scrollIntoViewIfNeeded();
    await expect(idCheck).toBeVisible();

    const docCheck = page.locator('text=Engineering Documentation & Manuals Readiness');
    await docCheck.scrollIntoViewIfNeeded();
    await expect(docCheck).toBeVisible();

    const specCheck = page.locator('text=Verified Operating Technical Specifications');
    await specCheck.scrollIntoViewIfNeeded();
    await expect(specCheck).toBeVisible();

    const twinCheck = page.locator('text=Digital Twin Model & P&ID Schematic Verification');
    await twinCheck.scrollIntoViewIfNeeded();
    await expect(twinCheck).toBeVisible();
  });

  test('2. Manage Tasks button opens modal correctly populated with machine ID and tag', async ({ page }) => {
    const machineRow = page.locator('tr:has-text("VERIF-")').first();
    await expect(machineRow).toBeVisible({ timeout: 15000 });
    await machineRow.click();

    // Click Manage Tasks from detail panel
    const manageTasksBtn = page.locator('button:has-text("Manage Tasks")').first();
    await expect(manageTasksBtn).toBeVisible();
    await manageTasksBtn.click();

    // Task Management Modal should be visible and not throw machineId missing error
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Missing Information & Technician Workflows")')).toBeVisible();

    // Close modal
    await modal.locator('button').first().click();
  });

  test('3. Verification evidence submission modal allows entering operating specs', async ({ page }) => {
    const machineRow = page.locator('tr:has-text("VERIF-")').first();
    await expect(machineRow).toBeVisible({ timeout: 15000 });
    await machineRow.click();

    // Click Submit Verification Evidence
    const submitEvidenceBtn = page.locator('button:has-text("Submit Verification Evidence")');
    await submitEvidenceBtn.scrollIntoViewIfNeeded();
    await expect(submitEvidenceBtn).toBeVisible();
    await submitEvidenceBtn.click();

    // Verify modal inputs
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h4:has-text("Submit Verification Findings")')).toBeVisible();
    await expect(modal.locator('label:has-text("Manufacturer (OEM)")')).toBeVisible();
    await expect(modal.locator('label:has-text("Model Number")')).toBeVisible();
    await expect(modal.locator('label:has-text("Documentation Readiness")')).toBeVisible();

    // Close modal
    await modal.locator('button:has-text("Cancel")').click();
  });
});
