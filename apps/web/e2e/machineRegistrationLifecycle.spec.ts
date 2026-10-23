import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('ForgeX AI — Machine Registration Ledger Form Lifecycle & State Reset', () => {
  let authToken: string;
  let organizationId: string;

  test.beforeAll(async ({ request }) => {
    // Obtain valid dev JWT token from backend API
    const loginRes = await request.post('http://localhost:4000/api/v1/auth/login?bypass_verification=true', {
      data: { email: 'admin@forgex.industrial', password: 'Admin@1234' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginJson = await loginRes.json();
    authToken = loginJson.data.token;
    organizationId = loginJson.data.organization.id;
  });

  test.beforeEach(async ({ page }) => {
    // Pre-populate authenticated session before page loads
    await page.addInitScript(({ token, orgId }) => {
      localStorage.setItem('forgex_token', token);
      localStorage.setItem('forgex_active_org_id', orgId);
    }, { token: authToken, orgId: organizationId });

    // Navigate to Assets & Machines module
    await page.goto('/');
    await page.click('button:has-text("Assets & Machines")');
    await expect(page.locator('button:has-text("Register Machine")')).toBeVisible();
  });

  test('1. Open registration: all create fields show their intended initial values', async ({ page }) => {
    // Open Register Machine modal
    await page.click('button:has-text("Register Machine")');
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Verify all text inputs are empty
    await expect(modal.locator('input[placeholder="PUMP-204-B"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Flowserve Corp"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Mark 3 ANSI"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="SN-99824-A"]')).toHaveValue('');

    // Verify building and production line are empty
    await expect(modal.locator('input[placeholder="Unit-02"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Crude Distillation"]')).toHaveValue('');

    // Verify dropdown default selections
    const selects = modal.locator('form select');
    await expect(selects.nth(0)).toHaveValue('Centrifugal Pump'); // machineType
    await expect(selects.nth(1)).toHaveValue('CONFIDENTIAL');     // dataClassification
    await expect(selects.nth(2)).toHaveValue('HIGH');             // criticality
    await expect(selects.nth(3)).toHaveValue('PENDING_INSPECTION'); // documentationReadiness

    // Verify engineering attachment checkboxes are both unchecked
    const model3dCheckbox = modal.locator('label:has-text("Has 3D Engineering Twin Model") input[type="checkbox"]');
    const pidCheckbox = modal.locator('label:has-text("Has P&ID Engineering Schematic") input[type="checkbox"]');
    await expect(model3dCheckbox).not.toBeChecked();
    await expect(pidCheckbox).not.toBeChecked();

    // Verify no attached file chips
    await expect(modal.locator('text=3D Digital Twin')).not.toBeVisible();
    await expect(modal.locator('text=P&ID Schematic Diagram')).not.toBeVisible();

    // Verify Advanced / Additional Details section is collapsed
    await expect(modal.locator('text=Operational Status')).not.toBeVisible();
    await expect(modal.locator('text=Commissioning Date')).not.toBeVisible();

    // Close modal
    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
  });

  test('2. Enter machine A data, close the modal, reopen it: the form is clean', async ({ page }) => {
    // Open Register Machine modal
    await page.click('button:has-text("Register Machine")');
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Enter partial Machine A data
    await modal.locator('input[placeholder="PUMP-204-B"]').fill('MACHINE-A-TAG');
    await modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]').fill('Machine Alpha Pump');
    await modal.locator('input[placeholder="Flowserve Corp"]').fill('Alpha OEM');
    await modal.locator('input[placeholder="Mark 3 ANSI"]').fill('Model-Alpha');
    await modal.locator('input[placeholder="SN-99824-A"]').fill('SN-ALPHA-999');
    await modal.locator('input[placeholder="Unit-02"]').fill('Building 09');
    await modal.locator('input[placeholder="Crude Distillation"]').fill('Cracker Line 2');

    // Check attachment flags
    await modal.locator('label:has-text("Has 3D Engineering Twin Model") input[type="checkbox"]').check();
    await modal.locator('label:has-text("Has P&ID Engineering Schematic") input[type="checkbox"]').check();

    // Expand advanced section
    await modal.locator('button:has-text("Advanced / Additional Details")').click();
    await expect(modal.locator('text=Operational Status')).toBeVisible();

    // Close modal via Cancel button
    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();

    // Reopen modal
    await page.click('button:has-text("Register Machine")');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Assert form is completely clean
    await expect(modal.locator('input[placeholder="PUMP-204-B"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Flowserve Corp"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Mark 3 ANSI"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="SN-99824-A"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Unit-02"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Crude Distillation"]')).toHaveValue('');

    // Attachment checkboxes unchecked
    await expect(modal.locator('label:has-text("Has 3D Engineering Twin Model") input[type="checkbox"]')).not.toBeChecked();
    await expect(modal.locator('label:has-text("Has P&ID Engineering Schematic") input[type="checkbox"]')).not.toBeChecked();

    // Advanced section collapsed
    await expect(modal.locator('text=Operational Status')).not.toBeVisible();

    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
  });

  test('3. Register machine A successfully, then start machine B: no machine A values or attachments remain', async ({ page }) => {
    const timestamp = Date.now();
    const tagA = `PUMP-A-${timestamp}`;
    const nameA = `High Pressure Pump ${timestamp}`;
    const serialA = `SN-A-${timestamp}`;

    // Open Register Machine modal
    await page.click('button:has-text("Register Machine")');
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Register Machine A
    await modal.locator('input[placeholder="PUMP-204-B"]').fill(tagA);
    await modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]').fill(nameA);
    await modal.locator('input[placeholder="Flowserve Corp"]').fill('Sulzer Pumps');
    await modal.locator('input[placeholder="Mark 3 ANSI"]').fill('OH2-200');
    await modal.locator('input[placeholder="SN-99824-A"]').fill(serialA);

    await modal.locator('input[placeholder="Unit-02"]').fill('Bldg-A');
    await modal.locator('input[placeholder="Crude Distillation"]').fill('Line-1');

    // Submit registration for Machine A
    await modal.locator('button:has-text("Register Machine")').click();

    // Modal should automatically close on success
    await expect(modal).not.toBeVisible();

    // Machine A should appear in the asset table
    await expect(page.locator(`text=${tagA}`)).toBeVisible();

    // Now start Machine B registration
    await page.click('button:has-text("Register Machine")');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Verify no Machine A data remains
    await expect(modal.locator('input[placeholder="PUMP-204-B"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Flowserve Corp"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Mark 3 ANSI"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="SN-99824-A"]')).toHaveValue('');

    await expect(modal.locator('input[placeholder="Unit-02"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Crude Distillation"]')).toHaveValue('');

    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
  });

  test('4. Attach a CAD model and P&ID to machine A, then start machine B: no stale files or checked attachment flags', async ({ page }) => {
    // Open Register Machine modal
    await page.click('button:has-text("Register Machine")');
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Check CAD model checkbox
    const cadCheckbox = modal.locator('label:has-text("Has 3D Engineering Twin Model") input[type="checkbox"]');
    await cadCheckbox.check();
    await expect(cadCheckbox).toBeChecked();

    // Check P&ID checkbox
    const pidCheckbox = modal.locator('label:has-text("Has P&ID Engineering Schematic") input[type="checkbox"]');
    await pidCheckbox.check();
    await expect(pidCheckbox).toBeChecked();

    // Attach mock files to both hidden file inputs inside modal
    const fileInputs = modal.locator('form input[type="file"]');
    await fileInputs.nth(0).setInputFiles({
      name: 'alpha_pump_model.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from('mock 3d binary content'),
    });
    await fileInputs.nth(1).setInputFiles({
      name: 'alpha_pump_pid.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock pdf content'),
    });

    // Verify attachment file badges appear
    await expect(modal.locator('text=alpha_pump_model.glb')).toBeVisible();
    await expect(modal.locator('text=alpha_pump_pid.pdf')).toBeVisible();

    // Close the modal
    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();

    // Reopen for Machine B
    await page.click('button:has-text("Register Machine")');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Verify CAD & P&ID checkboxes are clean and unchecked
    await expect(modal.locator('label:has-text("Has 3D Engineering Twin Model") input[type="checkbox"]')).not.toBeChecked();
    await expect(modal.locator('label:has-text("Has P&ID Engineering Schematic") input[type="checkbox"]')).not.toBeChecked();

    // Verify neither attached filename is displayed
    await expect(modal.locator('text=alpha_pump_model.glb')).not.toBeVisible();
    await expect(modal.locator('text=alpha_pump_pid.pdf')).not.toBeVisible();

    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
  });

  test('5. Force a validation/API failure: entered values remain available for correction', async ({ page }) => {
    // Open Register Machine modal
    await page.click('button:has-text("Register Machine")');
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Fill in values with an intentionally invalid tag
    await modal.locator('input[placeholder="PUMP-204-B"]').fill('INVALID-TAG-FAILED');
    await modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]').fill('Failed Validation Pump');
    await modal.locator('input[placeholder="Flowserve Corp"]').fill('Custom OEM');
    await modal.locator('input[placeholder="Mark 3 ANSI"]').fill('Custom Series');
    await modal.locator('input[placeholder="SN-99824-A"]').fill('SN-VAL-ERR-01');

    // Route /api/v1/machines POST to return 400 Bad Request
    await page.route('**/api/v1/machines', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: {
              code: 'FORGEX_VALIDATION_ERROR',
              message: 'Asset tag does not match authorized engineering naming convention.',
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Submit form to trigger failure
    await modal.locator('button:has-text("Register Machine")').click();

    // Verify error banner is displayed inside modal
    await expect(modal.locator('text=Asset tag does not match authorized engineering naming convention.')).toBeVisible();

    // Verify modal remains open
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    // Verify user entered inputs are PRESERVED so they can correct their entry
    await expect(modal.locator('input[placeholder="PUMP-204-B"]')).toHaveValue('INVALID-TAG-FAILED');
    await expect(modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]')).toHaveValue('Failed Validation Pump');
    await expect(modal.locator('input[placeholder="Flowserve Corp"]')).toHaveValue('Custom OEM');
    await expect(modal.locator('input[placeholder="Mark 3 ANSI"]')).toHaveValue('Custom Series');
    await expect(modal.locator('input[placeholder="SN-99824-A"]')).toHaveValue('SN-VAL-ERR-01');

    // Unroute for future tests
    await page.unroute('**/api/v1/machines');

    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
  });

  test('6. Open edit mode for machine A, close it, and open create mode: create form is clean', async ({ page }) => {
    // Wait for ledger table to finish sync/load if in-flight
    await page.locator('text=Syncing...').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });
    await firstRow.click();

    // Verify detail pane is open with Edit Machine Record button
    const editBtn = page.locator('button:has-text("Edit Machine Record")');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Verify modal opens in EDIT mode with "Edit Machine:" header
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Edit Machine:")')).toBeVisible();
    await expect(modal.locator('button:has-text("Save Changes")')).toBeVisible();

    // Verify inputs contain existing machine data
    const tagValue = await modal.locator('input[placeholder="PUMP-204-B"]').inputValue();
    expect(tagValue.length).toBeGreaterThan(0);

    // Close edit modal
    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();

    // Now click the toolbar "Register Machine" (Create mode)
    await page.click('button:has-text("Register Machine")');

    // Verify modal is in CREATE mode
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();
    await expect(modal.locator('button:has-text("Register Machine")')).toBeVisible();

    // Verify every text field is completely clean
    await expect(modal.locator('input[placeholder="PUMP-204-B"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Flowserve Corp"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Mark 3 ANSI"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="SN-99824-A"]')).toHaveValue('');

    await expect(modal.locator('input[placeholder="Unit-02"]')).toHaveValue('');
    await expect(modal.locator('input[placeholder="Crude Distillation"]')).toHaveValue('');

    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
  });

  test('7. Verify both registrations can be completed independently and existing machine A data remains unchanged', async ({ page }) => {
    const timestamp = Date.now();
    const tagA = `PUMP-IND-A-${timestamp}`;
    const nameA = `Independent Pump A ${timestamp}`;
    const serialA = `SN-IND-A-${timestamp}`;

    const tagB = `PUMP-IND-B-${timestamp}`;
    const nameB = `Independent Pump B ${timestamp}`;
    const serialB = `SN-IND-B-${timestamp}`;

    const modal = page.locator('div.fixed.inset-0');

    // --- 1. Register Machine A ---
    await page.click('button:has-text("Register Machine")');
    await modal.locator('input[placeholder="PUMP-204-B"]').fill(tagA);
    await modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]').fill(nameA);
    await modal.locator('input[placeholder="Flowserve Corp"]').fill('OEM Alpha');
    await modal.locator('input[placeholder="Mark 3 ANSI"]').fill('Model-Alpha');
    await modal.locator('input[placeholder="SN-99824-A"]').fill(serialA);
    await modal.locator('button:has-text("Register Machine")').click();

    await expect(modal).not.toBeVisible();
    await expect(page.locator(`text=${tagA}`)).toBeVisible();

    // --- 2. Register Machine B ---
    await page.click('button:has-text("Register Machine")');
    // Ensure form is clean
    await expect(modal.locator('input[placeholder="PUMP-204-B"]')).toHaveValue('');

    await modal.locator('input[placeholder="PUMP-204-B"]').fill(tagB);
    await modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]').fill(nameB);
    await modal.locator('input[placeholder="Flowserve Corp"]').fill('OEM Beta');
    await modal.locator('input[placeholder="Mark 3 ANSI"]').fill('Model-Beta');
    await modal.locator('input[placeholder="SN-99824-A"]').fill(serialB);
    await modal.locator('button:has-text("Register Machine")').click();

    await expect(modal).not.toBeVisible();
    await expect(page.locator(`text=${tagB}`)).toBeVisible();

    // --- 3. Verify Both Machines Coexist Independently ---
    const rowA = page.locator(`tr:has-text("${tagA}")`);
    await expect(rowA).toBeVisible();
    await expect(rowA).toContainText(nameA);

    const rowB = page.locator(`tr:has-text("${tagB}")`);
    await expect(rowB).toBeVisible();
    await expect(rowB).toContainText(nameB);
  });

  test('9. Auto-categorization: Typing equipment name updates machine type unless manually overridden', async ({ page }) => {
    // Open Register Machine modal
    await page.click('button:has-text("Register Machine")');
    const modal = page.locator('div.fixed.inset-0');
    await expect(modal.locator('h2:has-text("Machine Registration Ledger")')).toBeVisible();

    const nameInput = modal.locator('input[placeholder="Centrifugal Slurry Bottoms Pump"]');
    const typeSelect = modal.locator('form select').nth(0);

    // Initial default
    await expect(typeSelect).toHaveValue('Centrifugal Pump');

    // Type "Industrial Bucket Elevator" -> should auto-select "Bucket Elevator"
    await nameInput.fill('Industrial Bucket Elevator');
    await expect(typeSelect).toHaveValue('Bucket Elevator');
    await expect(modal.locator('text=Auto-detected')).toBeVisible();

    // Type "High Pressure Wet Gas Compressor" -> should auto-select "Wet Gas Compressor"
    await nameInput.fill('High Pressure Wet Gas Compressor');
    await expect(typeSelect).toHaveValue('Wet Gas Compressor');

    // Type "Emergency Isolation Valve" -> should auto-select "Emergency Isolation Valve"
    await nameInput.fill('Primary Emergency Isolation Valve');
    await expect(typeSelect).toHaveValue('Emergency Isolation Valve');

    // Now test UX Constraint: Manual override
    // User explicitly selects "Shell & Tube Heat Exchanger"
    await typeSelect.selectOption('Shell & Tube Heat Exchanger');
    await expect(typeSelect).toHaveValue('Shell & Tube Heat Exchanger');
    await expect(modal.locator('text=Override (Reset)')).toBeVisible();

    // Typing another name must NOT override the manual choice
    await nameInput.fill('Heavy Slurry Centrifugal Pump');
    await expect(typeSelect).toHaveValue('Shell & Tube Heat Exchanger');

    // Click Override (Reset) -> re-evaluates current name and auto-selects "Centrifugal Pump"
    await modal.locator('button:has-text("Override (Reset)")').click();
    await expect(typeSelect).toHaveValue('Centrifugal Pump');
    await expect(modal.locator('text=Auto-detected')).toBeVisible();

    // Close modal
    await modal.locator('button:has-text("Cancel")').click();
    await expect(modal).not.toBeVisible();
  });
});

