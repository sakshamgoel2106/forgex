import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { IStorageAdapter, StoragePutResult } from './storage.interface.js';

export class LocalStorageAdapter implements IStorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    if (baseDir) {
      this.baseDir = path.resolve(baseDir);
    } else if (process.env.STORAGE_LOCAL_DIR) {
      this.baseDir = path.resolve(process.env.STORAGE_LOCAL_DIR);
    } else {
      const apiStorage = path.resolve(process.cwd(), 'apps', 'api', 'data', 'storage');
      const directStorage = path.resolve(process.cwd(), 'data', 'storage');
      if (fsSync.existsSync(apiStorage)) {
        this.baseDir = apiStorage;
      } else {
        this.baseDir = directStorage;
      }
    }
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
    const cleanKey = key.replace(/^[/\\]+/, '');
    const filePath = this.resolveSafePath(cleanKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);

    const checksumSha256 = crypto.createHash('sha256').update(data).digest('hex');

    return {
      storageKey: cleanKey,
      sizeBytes: data.length,
      checksumSha256,
    };
  }

  public async getObject(key: string): Promise<Buffer> {
    const cleanKey = key.replace(/^[/\\]+/, '');
    const filePath = this.resolveSafePath(cleanKey);
    try {
      return await fs.readFile(filePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        const altPaths = [
          path.resolve(process.cwd(), 'apps', 'api', 'data', 'storage', cleanKey),
          path.resolve(process.cwd(), 'data', 'storage', cleanKey),
          path.resolve(this.baseDir, '..', '..', 'data', 'storage', cleanKey),
          path.resolve(this.baseDir, '..', 'data', 'storage', cleanKey),
        ];
        const basename = path.basename(cleanKey);
        const dirname = path.dirname(cleanKey);
        altPaths.push(
          path.resolve(this.baseDir, dirname, basename),
          path.resolve(this.baseDir, 'models', basename),
          path.resolve(this.baseDir, 'schematics', basename),
          path.resolve(this.baseDir, 'drawings', basename)
        );
        if (basename.includes('-')) {
          const stripped = basename.substring(basename.indexOf('-') + 1);
          altPaths.push(
            path.resolve(this.baseDir, dirname, stripped),
            path.resolve(this.baseDir, 'models', stripped),
            path.resolve(this.baseDir, 'schematics', stripped),
            path.resolve(this.baseDir, 'drawings', stripped)
          );
        }
        for (const altPath of altPaths) {
          try {
            return await fs.readFile(altPath);
          } catch {
            // continue checking alternate locations
          }
        }
        throw new Error(`Storage object not found: '${key}'`);
      }
      throw err;
    }
  }

  public async deleteObject(key: string): Promise<void> {
    const cleanKey = key.replace(/^[/\\]+/, '');
    const filePath = this.resolveSafePath(cleanKey);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    const altPaths = [
      path.resolve(process.cwd(), 'apps', 'api', 'data', 'storage', cleanKey),
      path.resolve(process.cwd(), 'data', 'storage', cleanKey),
    ];
    for (const altPath of altPaths) {
      if (altPath !== filePath) {
        try {
          await fs.unlink(altPath);
        } catch {
          // ignore
        }
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
