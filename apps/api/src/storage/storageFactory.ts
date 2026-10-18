import type { IStorageAdapter } from './storage.interface.js';
import { LocalStorageAdapter } from './localStorageAdapter.js';
import { S3StorageAdapter } from './s3StorageAdapter.js';

let defaultStorageAdapter: IStorageAdapter | null = null;

export function createStorageAdapter(): IStorageAdapter {
  if (defaultStorageAdapter) return defaultStorageAdapter;

  const adapterType = process.env.STORAGE_ADAPTER || 'local';

  if (adapterType === 's3' || adapterType === 'minio') {
    defaultStorageAdapter = new S3StorageAdapter({
      endpoint: process.env.MINIO_ENDPOINT || 'localhost:9000',
      bucket: process.env.MINIO_BUCKET || 'forgex-documents',
      accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
      secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
      useSsl: process.env.MINIO_USE_SSL === 'true',
    });
  } else {
    defaultStorageAdapter = new LocalStorageAdapter(process.env.STORAGE_LOCAL_DIR);
  }

  return defaultStorageAdapter;
}

export function setStorageAdapter(adapter: IStorageAdapter): void {
  defaultStorageAdapter = adapter;
}
