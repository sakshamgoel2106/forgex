/**
 * ForgeX AI — Multi-Tenant / Per-Company Data Isolation Utility
 * Enforces strict boundaries between organizations and plant facilities.
 * Prevents mock demo records or previous tenant data from leaking into newly registered companies.
 */

export const TENANT_PLANT_STORAGE_KEY = 'forgex_active_plant';
export const TENANT_ORG_STORAGE_KEY = 'forgex_active_org_id';
export const TENANT_ORG_OBJECT_KEY = 'forgex_organization';

/**
 * Returns the effective plant ID for tenant scoping.
 */
export function getEffectivePlantId(explicitPlantId?: string | null): string {
  if (explicitPlantId && explicitPlantId.trim()) {
    return explicitPlantId.trim();
  }
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(TENANT_PLANT_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  }
  return 'PLANT-TX-04';
}

/**
 * Generates an isolated storage key scoped to a specific plant and/or organization.
 * Format: `${baseKey}__tenant_${plantId}`
 */
export function getTenantKey(baseKey: string, plantId?: string | null): string {
  const effectivePlant = getEffectivePlantId(plantId);
  return `${baseKey}__tenant_${effectivePlant}`;
}

/**
 * Returns true ONLY for the genuine default demo plant (JMK Tiles Modernized / PLANT-TX-04).
 * Returns false for any newly registered company, newly created plant, or custom organization.
 */
export function isDefaultDemoPlant(
  plantId?: string | null,
  plantName?: string | null,
  orgId?: string | null,
  orgName?: string | null
): boolean {
  if (typeof window === 'undefined') return true;

  let currentOrgName = orgName;
  const currentOrgId = orgId;

  if (!currentOrgName) {
    try {
      const rawOrg = localStorage.getItem(TENANT_ORG_OBJECT_KEY);
      if (rawOrg) {
        const parsed = JSON.parse(rawOrg);
        currentOrgName = parsed.name || parsed.slug;
      }
    } catch {}
  }

  // If the active company has an ID that is not a demo ID
  if (currentOrgId && !currentOrgId.includes('demo') && !currentOrgId.includes('jmk') && !currentOrgName) {
    return false;
  }

  // If the active company is a custom/newly created organization, it is NEVER a demo plant
  if (currentOrgName) {
    const lowerOrg = currentOrgName.toLowerCase();
    const isDemoOrg =
      lowerOrg.includes('jmk') ||
      lowerOrg.includes('demo factory') ||
      lowerOrg.includes('forgex demo');
    if (!isDemoOrg) {
      return false;
    }
  }

  const effectivePlant = (plantId || (typeof window !== 'undefined' ? localStorage.getItem(TENANT_PLANT_STORAGE_KEY) : '') || '').toUpperCase();
  const effectivePlantName = (plantName || '').toLowerCase();

  const isDemoPlantCode =
    effectivePlant === 'PLANT-TX-04' ||
    effectivePlant === 'PLANT-JMK-01' ||
    effectivePlant === 'DEMO-PLANT-01';

  const isDemoPlantName =
    effectivePlantName.includes('jmk') ||
    effectivePlantName.includes('petrochemical refinery train 4') ||
    effectivePlantName.includes('texas petrochemical');

  return isDemoPlantCode || isDemoPlantName;
}

/**
 * Reads tenant-isolated data from localStorage.
 * If data does not exist yet for this tenant:
 * - If default demo plant: initializes with defaultDemoSeed.
 * - If newly registered company/plant: initializes with empty array `[]` and persists it.
 */
export function getTenantData<T = any>(
  baseKey: string,
  plantId?: string | null,
  defaultDemoSeed: any = []
): T extends (infer U)[] ? U[] : T[] {
  if (typeof window === 'undefined') return defaultDemoSeed as any;

  const key = getTenantKey(baseKey, plantId);
  const effectivePlant = getEffectivePlantId(plantId);
  const isDemo = isDefaultDemoPlant(effectivePlant);

  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Enforce strict plantId match on items that carry plantId or facilityId
        return parsed.filter((item: any) => {
          if (!item) return false;
          if (item.plantId && item.plantId !== effectivePlant) return false;
          if (item.facilityId && item.facilityId !== effectivePlant) return false;
          return true;
        }) as any;
      }
    }

    // First time access for this tenant:
    if (isDemo && Array.isArray(defaultDemoSeed) && defaultDemoSeed.length > 0) {
      // Stamp plantId on seed items
      const stampedSeed = defaultDemoSeed.map((item: any) => ({
        ...item,
        plantId: item.plantId || effectivePlant,
      }));
      try {
        localStorage.setItem(key, JSON.stringify(stampedSeed));
      } catch {}
      return stampedSeed as any;
    } else {
      // Fresh new company/plant starts completely clean with 0 records
      try {
        localStorage.setItem(key, JSON.stringify([]));
      } catch {}
      return [] as any;
    }
  } catch (err) {
    console.warn(`Failed reading tenant storage for ${key}:`, err);
    return (isDemo ? defaultDemoSeed : []) as any;
  }
}

/**
 * Persists tenant-isolated data to localStorage with plantId stamping and broadcasts a sync event.
 */
export function setTenantData(baseKey: string, plantId: string | null | undefined, data: any): void {
  if (typeof window === 'undefined') return;

  const key = getTenantKey(baseKey, plantId);
  const effectivePlant = getEffectivePlantId(plantId);

  try {
    const dataList = Array.isArray(data) ? data : [data];
    // Stamp plantId on every object if not already present
    const stampedData = dataList.map((item: any) => {
      if (typeof item === 'object' && item !== null) {
        return {
          ...item,
          plantId: item.plantId || effectivePlant,
        };
      }
      return item;
    });

    localStorage.setItem(key, JSON.stringify(stampedData));

    // Broadcast synchronization event
    window.dispatchEvent(
      new CustomEvent('forgex:tenant_data_updated', {
        detail: { baseKey, plantId: effectivePlant, key },
      })
    );
  } catch (err) {
    console.warn(`Failed writing tenant storage for ${key}:`, err);
  }
}

/**
 * Clears in-memory selected machine, ticket, and RCA sessions when switching companies or plants.
 */
export function clearTransientSessionState(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem('forgex_active_rca_id');
    sessionStorage.removeItem('forgex_selected_case_id');
    sessionStorage.removeItem('forgex_rca_ticket');
    localStorage.removeItem('forgex_selected_machine_tag');
    window.dispatchEvent(new CustomEvent('forgex:transient_state_cleared'));
  } catch {}
}
