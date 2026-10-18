import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IStorageAdapter, StoragePutResult } from './storage.interface.js';

export class LocalStorageAdapter implements IStorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir ?? path.join(process.cwd(), 'data', 'storage'));
  }

  private resolveSafePath(key: string): string {
    // Sanitize key by removing leading slashes and normalizing
    const cleanKey = key.replace(/^[/\\]+/, '');
    const resolved = path.resolve(this.baseDir, cleanKey);

    // Verify containment within baseDir to prevent path traversal
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(`Security Violation: Path traversal detected for key '${key}'.`);
    }

    return resolved;
  }

  public async putObject(key: string, data: Buffer, _contentType: string): Promise<StoragePutResult> {
    const filePath = this.resolveSafePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);

    const checksumSha256 = crypto.createHash('sha256').update(data).digest('hex');

    return {
      storageKey: key,
      sizeBytes: data.length,
      checksumSha256,
    };
  }

  public async getObject(key: string): Promise<Buffer> {
    const filePath = this.resolveSafePath(key);
    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Storage object not found: '${key}'`);
      }
      throw err;
    }
  }

  public async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveSafePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  public async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    // In local dev, return the local documents download endpoint
    return `/api/v1/documents/raw/${encodeURIComponent(key)}`;
  }
}
