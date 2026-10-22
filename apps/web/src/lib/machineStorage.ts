import type { Machine } from '@forgex/shared-types';

export interface StoredMachineFileMeta {
  name: string;
  size: number;
  type?: string;
  format?: string;
}

export interface StoredMachineFiles {
  model3dFile?: StoredMachineFileMeta | null;
  model3dUrl?: string | null;
  model3dName?: string | null;
  model3dType?: string | null;
  pAndIdFile?: StoredMachineFileMeta | null;
  pAndIdUrl?: string | null;
  pidFile?: StoredMachineFileMeta | null;
  pidUrl?: string | null;
  pidName?: string | null;
  pidType?: string | null;
}

// In-memory cache for Object URLs and active session data
const memoryCache = new Map<string, StoredMachineFiles>();

/**
 * Convert a File object to a base64 Data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Get storage key for LocalStorage
 */
function getStorageKey(key: string, isTag = false): string {
  return isTag ? `forgex_asset_files_tag_${key.toUpperCase()}` : `forgex_asset_files_id_${key}`;
}

/**
 * Retrieve stored 3D and P&ID files for a machine
 */
export function getMachineFiles(machine: Partial<Machine> | null): StoredMachineFiles {
  if (!machine) {
    return {
      model3dFile: null,
      model3dUrl: null,
      pAndIdFile: null,
      pAndIdUrl: null,
      pidFile: null,
      pidUrl: null,
    };
  }

  const id = machine.id;
  const tag = machine.assetTag?.toUpperCase();

  // 1. Check in-memory cache
  if (id && memoryCache.has(id)) {
    return memoryCache.get(id)!;
  }
  if (tag && memoryCache.has(tag)) {
    return memoryCache.get(tag)!;
  }

  // 2. Check localStorage
  let storedJson: string | null = null;
  if (id) {
    storedJson = localStorage.getItem(getStorageKey(id, false));
  }
  if (!storedJson && tag) {
    storedJson = localStorage.getItem(getStorageKey(tag, true));
  }

  let fromStorage: StoredMachineFiles = {};
  if (storedJson) {
    try {
      fromStorage = JSON.parse(storedJson);
    } catch {
      // Ignored parsing error
    }
  }

  // 3. Fallback to machine's own direct properties and technicalSpecs
  const specs = machine.technicalSpecs as Record<string, any> | undefined;

  const model3dName =
    fromStorage.model3dFile?.name ||
    machine.model3dFile?.name ||
    specs?.model3dFileName ||
    (machine.hasModel3d && machine.model3dStorageKey ? machine.model3dStorageKey.split('/').pop() : null);

  const model3dSize =
    fromStorage.model3dFile?.size ||
    machine.model3dFile?.size ||
    (specs?.model3dFileSize ? Number(specs.model3dFileSize) : 1024 * 1024);

  const model3dFormat =
    fromStorage.model3dFile?.format ||
    machine.model3dFormat ||
    (model3dName?.toLowerCase().endsWith('.glb') ? 'glb' : model3dName?.toLowerCase().endsWith('.step') ? 'step' : 'gltf');

  const model3dUrl =
    fromStorage.model3dUrl ||
    machine.model3dUrl ||
    specs?.model3dUrl ||
    null;

  const model3dFile: StoredMachineFileMeta | null =
    model3dName
      ? {
          name: model3dName,
          size: model3dSize,
          type: 'model/gltf-binary',
          format: model3dFormat,
        }
      : fromStorage.model3dFile || null;

  const pidName =
    fromStorage.pidFile?.name ||
    fromStorage.pAndIdFile?.name ||
    machine.pidFile?.name ||
    machine.pAndIdFile?.name ||
    specs?.pidFileName ||
    (machine.hasPidDiagram && machine.pidStorageKey ? machine.pidStorageKey.split('/').pop() : null);

  const pidSize =
    fromStorage.pidFile?.size ||
    fromStorage.pAndIdFile?.size ||
    machine.pidFile?.size ||
    machine.pAndIdFile?.size ||
    (specs?.pidFileSize ? Number(specs.pidFileSize) : 256 * 1024);

  const pidUrl =
    fromStorage.pidUrl ||
    fromStorage.pAndIdUrl ||
    machine.pidUrl ||
    machine.pAndIdUrl ||
    specs?.pidUrl ||
    null;

  const pidFile: StoredMachineFileMeta | null =
    pidName
      ? {
          name: pidName,
          size: pidSize,
          type: pidName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/svg+xml',
        }
      : fromStorage.pidFile || fromStorage.pAndIdFile || null;

  const resolved: StoredMachineFiles = {
    model3dFile,
    model3dUrl,
    pAndIdFile: pidFile,
    pAndIdUrl: pidUrl,
    pidFile,
    pidUrl,
  };

  // Cache in memory for quick subsequent access
  if (id) memoryCache.set(id, resolved);
  if (tag) memoryCache.set(tag, resolved);

  return resolved;
}

/**
 * Persist machine 3D and P&ID file attachments to LocalStorage & Memory Cache
 */
export function saveMachineFiles(
  identifier: { id?: string; assetTag?: string },
  files: Partial<StoredMachineFiles>
): void {
  const { id, assetTag } = identifier;
  const tag = assetTag?.toUpperCase();

  // Fetch existing
  const current = getMachineFiles({ id, assetTag });
  const updated: StoredMachineFiles = {
    ...current,
    ...files,
  };

  // Harmonize pAndId and pid aliases
  if (files.pidFile !== undefined) updated.pAndIdFile = files.pidFile;
  if (files.pAndIdFile !== undefined) updated.pidFile = files.pAndIdFile;
  if (files.pidUrl !== undefined) updated.pAndIdUrl = files.pidUrl;
  if (files.pAndIdUrl !== undefined) updated.pidUrl = files.pAndIdUrl;

  // Update in-memory cache
  if (id) memoryCache.set(id, updated);
  if (tag) memoryCache.set(tag, updated);

  // Persist to LocalStorage safely (stripping overly large base64 if quota exceeded)
  const serialize = (data: StoredMachineFiles) => JSON.stringify(data);

  try {
    const jsonStr = serialize(updated);
    if (id) localStorage.setItem(getStorageKey(id, false), jsonStr);
    if (tag) localStorage.setItem(getStorageKey(tag, true), jsonStr);
  } catch (err) {
    // Quota exceeded: store metadata without oversized data URLs
    try {
      const lightweight: StoredMachineFiles = {
        model3dFile: updated.model3dFile,
        model3dUrl: updated.model3dUrl && updated.model3dUrl.length < 500000 ? updated.model3dUrl : null,
        pAndIdFile: updated.pAndIdFile,
        pAndIdUrl: updated.pAndIdUrl && updated.pAndIdUrl.length < 500000 ? updated.pAndIdUrl : null,
        pidFile: updated.pidFile,
        pidUrl: updated.pidUrl && updated.pidUrl.length < 500000 ? updated.pidUrl : null,
      };
      const lightJson = serialize(lightweight);
      if (id) localStorage.setItem(getStorageKey(id, false), lightJson);
      if (tag) localStorage.setItem(getStorageKey(tag, true), lightJson);
    } catch {
      console.warn('LocalStorage quota reached; retaining files in session memory cache.');
    }
  }
}

/**
 * Attach a new File directly to a machine (used inside viewer modals)
 */
export async function attachFileToMachine(
  machineId: string,
  assetTag: string,
  type: '3d' | 'pid',
  file: File
): Promise<{ url: string; fileMeta: StoredMachineFileMeta }> {
  const dataUrl = await fileToDataUrl(file);
  const fileMeta: StoredMachineFileMeta = {
    name: file.name,
    size: file.size,
    type: file.type,
    format: file.name.split('.').pop()?.toLowerCase(),
  };

  if (type === '3d') {
    saveMachineFiles(
      { id: machineId, assetTag },
      {
        model3dFile: fileMeta,
        model3dUrl: dataUrl,
      }
    );
  } else {
    saveMachineFiles(
      { id: machineId, assetTag },
      {
        pidFile: fileMeta,
        pidUrl: dataUrl,
        pAndIdFile: fileMeta,
        pAndIdUrl: dataUrl,
      }
    );
  }

  return { url: dataUrl, fileMeta };
}

/**
 * Enrich a list of machines with their persistent attached files
 */
export function enrichMachinesWithStoredFiles(machines: Machine[]): Machine[] {
  return machines.map((m) => {
    const stored = getMachineFiles(m);
    const has3d = m.hasModel3d || Boolean(stored.model3dFile || stored.model3dUrl);
    const hasPid = m.hasPidDiagram || Boolean(stored.pidFile || stored.pidUrl || stored.pAndIdUrl);

    return {
      ...m,
      hasModel3d: has3d,
      hasPidDiagram: hasPid,
      model3dFile: stored.model3dFile || m.model3dFile || null,
      model3dUrl: stored.model3dUrl || m.model3dUrl || null,
      pAndIdFile: stored.pAndIdFile || m.pAndIdFile || m.pidFile || null,
      pAndIdUrl: stored.pAndIdUrl || m.pAndIdUrl || m.pidUrl || null,
      pidFile: stored.pidFile || m.pidFile || m.pAndIdFile || null,
      pidUrl: stored.pidUrl || m.pidUrl || m.pAndIdUrl || null,
    };
  });
}
