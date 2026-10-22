import type { IStorageAdapter } from './storage.interface.js';
import { LocalStorageAdapter } from './localStorageAdapter.js';
import { S3StorageAdapter } from './s3StorageAdapter.js';

let defaultStorageAdapter: IStorageAdapter | null = null;

export function createStorageAdapter(): IStorageAdapter {
  if (defaultStorageAdapter) return defaultStorageAdapter;

  const adapterType = process.env.STORAGE_PROVIDER || process.env.STORAGE_ADAPTER || 'local';

  if (adapterType === 's3' || adapterType === 'minio') {
    defaultStorageAdapter = new S3StorageAdapter({
      endpoint: process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT || 'http://localhost:9000',
      bucket: process.env.S3_BUCKET_NAME || process.env.MINIO_BUCKET_NAME || process.env.MINIO_BUCKET || 'forgex-documents',
      accessKey: process.env.S3_ACCESS_KEY_ID || process.env.MINIO_ROOT_USER || 'minioadmin',
      secretKey: process.env.S3_SECRET_ACCESS_KEY || process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
      useSsl: process.env.MINIO_SECURE === 'true' || process.env.MINIO_USE_SSL === 'true' || (process.env.S3_ENDPOINT || '').startsWith('https'),
    });
  } else {
    defaultStorageAdapter = new LocalStorageAdapter(process.env.STORAGE_LOCAL_DIR);
  }

  return defaultStorageAdapter;
}

export function setStorageAdapter(adapter: IStorageAdapter): void {
  defaultStorageAdapter = adapter;
}
