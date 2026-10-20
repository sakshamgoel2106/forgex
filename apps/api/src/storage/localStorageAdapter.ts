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

    // Verify containment within baseDir with strict directory boundary to prevent path traversal prefix bypass
    const baseDirWithSep = this.baseDir.endsWith(path.sep) ? this.baseDir : this.baseDir + path.sep;
    if (!resolved.startsWith(baseDirWithSep) && resolved !== this.baseDir) {
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

  public async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const secret = process.env.JWT_SECRET || 'super_secret_forgex_jwt_key_at_least_32_characters_long_min_change_me';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${key}:${expiresAt}`)
      .digest('hex');

    return `/api/v1/engineering/storage-proxy?key=${encodeURIComponent(key)}&expires=${expiresAt}&signature=${signature}`;
  }
}
