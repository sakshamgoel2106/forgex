import type { IStorageAdapter, StoragePutResult } from './storage.interface.js';
import { LocalStorageAdapter } from './localStorageAdapter.js';
import { guardedFetch } from '../utils/outboundGuard.js';
import { logger } from '../utils/logger.js';
import crypto from 'node:crypto';

export interface S3Config {
  endpoint?: string;
  bucket: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  useSsl?: boolean;
  forcePathStyle?: boolean;
}

/**
 * Universal S3 & MinIO Storage Adapter with Path-Style & SigV4 Support
 */
export class S3StorageAdapter implements IStorageAdapter {
  private fallbackAdapter: LocalStorageAdapter;

  constructor(public readonly config: S3Config) {
    this.fallbackAdapter = new LocalStorageAdapter();
  }

  private getUrlAndPath(key: string): { url: URL; targetPath: string; host: string } {
    const cleanKey = key.replace(/^[/\\]+/, '');
    const endpointStr = this.config.endpoint || 'http://localhost:9000';
    const baseUrl = new URL(endpointStr);

    // MinIO and local S3 require path-style: http://endpoint/bucket/key
    const isPathStyle =
      this.config.forcePathStyle ??
      (baseUrl.hostname === 'localhost' ||
        baseUrl.hostname === '127.0.0.1' ||
        baseUrl.hostname.includes('minio') ||
        Boolean(baseUrl.port));

    if (isPathStyle) {
      const targetPath = `/${this.config.bucket}/${cleanKey}`;
      return {
        url: new URL(targetPath, baseUrl),
        targetPath,
        host: baseUrl.host,
      };
    }

    // Virtual-hosted style: http://bucket.s3.amazonaws.com/key
    const host = `${this.config.bucket}.${baseUrl.host}`;
    const targetPath = `/${cleanKey}`;
    const url = new URL(`${baseUrl.protocol}//${host}${targetPath}`);
    return { url, targetPath, host };
  }

  private generateSigV4Headers(
    method: string,
    targetPath: string,
    host: string,
    headers: Record<string, string>,
    payloadHash: string
  ): Record<string, string> {
    const region = this.config.region || 'us-east-1';
    const service = 's3';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const signedHeadersList = ['host', 'x-amz-content-sha256', 'x-amz-date'];
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;

    const canonicalRequest =
      `${method}\n` +
      `${targetPath}\n` +
      `\n` +
      `${canonicalHeaders}\n` +
      `${signedHeadersList.join(';')}\n` +
      `${payloadHash}`;

    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    const kDate = crypto.createHmac('sha256', `AWS4${this.config.secretKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 ` +
      `Credential=${this.config.accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeadersList.join(';')}, ` +
      `Signature=${signature}`;

    return {
      ...headers,
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authorization,
    };
  }

  public async putObject(key: string, data: Buffer, contentType: string): Promise<StoragePutResult> {
    if (this.config.endpoint && this.config.accessKey && this.config.secretKey) {
      try {
        const { url, targetPath, host } = this.getUrlAndPath(key);
        const payloadHash = crypto.createHash('sha256').update(data).digest('hex');
        const headers = this.generateSigV4Headers(
          'PUT',
          targetPath,
          host,
          { 'Content-Type': contentType },
          payloadHash
        );

        const res = await guardedFetch(url.href, {
          method: 'PUT',
          headers,
          body: data,
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          return {
            storageKey: key,
            sizeBytes: data.length,
            checksumSha256: payloadHash,
          };
        }
      } catch (err: any) {
        logger.warn({ err: err?.message, key }, 'S3/MinIO putObject failed; saving to local containment fallback');
      }
    }

    return this.fallbackAdapter.putObject(key, data, contentType);
  }

  public async getObject(key: string): Promise<Buffer> {
    if (this.config.endpoint && this.config.accessKey && this.config.secretKey) {
      try {
        const { url, targetPath, host } = this.getUrlAndPath(key);
        const payloadHash = crypto.createHash('sha256').update('').digest('hex');
        const headers = this.generateSigV4Headers('GET', targetPath, host, {}, payloadHash);

        const res = await guardedFetch(url.href, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (err: any) {
        logger.warn({ err: err?.message, key }, 'S3/MinIO getObject failed; reading from local fallback');
      }
    }

    return this.fallbackAdapter.getObject(key);
  }

  public async deleteObject(key: string): Promise<void> {
    if (this.config.endpoint && this.config.accessKey && this.config.secretKey) {
      try {
        const { url, targetPath, host } = this.getUrlAndPath(key);
        const payloadHash = crypto.createHash('sha256').update('').digest('hex');
        const headers = this.generateSigV4Headers('DELETE', targetPath, host, {}, payloadHash);

        await guardedFetch(url.href, {
          method: 'DELETE',
          headers,
          signal: AbortSignal.timeout(5000),
        });
      } catch (err: any) {
        logger.warn({ err: err?.message, key }, 'S3/MinIO deleteObject error');
      }
    }

    return this.fallbackAdapter.deleteObject(key);
  }

  public async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const cleanKey = key.replace(/^[/\\]+/, '');
    if (this.config.endpoint && this.config.accessKey && this.config.secretKey) {
      try {
        const { url, targetPath, host } = this.getUrlAndPath(cleanKey);
        const region = this.config.region || 'us-east-1';
        const service = 's3';
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

        const queryParams = new URLSearchParams({
          'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
          'X-Amz-Credential': `${this.config.accessKey}/${credentialScope}`,
          'X-Amz-Date': amzDate,
          'X-Amz-Expires': String(expiresInSeconds),
          'X-Amz-SignedHeaders': 'host',
        });
        queryParams.sort();

        const canonicalHeaders = `host:${host}\n`;
        const canonicalRequest = `GET\n${targetPath}\n${queryParams.toString()}\n${canonicalHeaders}\nhost\nUNSIGNED-PAYLOAD`;

        const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

        const kDate = crypto.createHmac('sha256', `AWS4${this.config.secretKey}`).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

        queryParams.set('X-Amz-Signature', signature);
        return `${url.origin}${targetPath}?${queryParams.toString()}`;
      } catch {
        // Fallback
      }
    }
    return this.fallbackAdapter.getSignedUrl(cleanKey, expiresInSeconds);
  }

  public async getPresignedPutUrl(key: string, contentType: string, expiresInSeconds = 3600): Promise<string> {
    const cleanKey = key.replace(/^[/\\]+/, '');
    if (this.config.endpoint && this.config.accessKey && this.config.secretKey) {
      try {
        const { url, targetPath, host } = this.getUrlAndPath(cleanKey);
        const region = this.config.region || 'us-east-1';
        const service = 's3';
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

        const queryParams = new URLSearchParams({
          'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
          'X-Amz-Credential': `${this.config.accessKey}/${credentialScope}`,
          'X-Amz-Date': amzDate,
          'X-Amz-Expires': String(expiresInSeconds),
          'X-Amz-SignedHeaders': 'content-type;host',
        });
        queryParams.sort();

        const canonicalHeaders = `content-type:${contentType.trim()}\nhost:${host}\n`;
        const canonicalRequest = `PUT\n${targetPath}\n${queryParams.toString()}\n${canonicalHeaders}\ncontent-type;host\nUNSIGNED-PAYLOAD`;

        const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

        const kDate = crypto.createHmac('sha256', `AWS4${this.config.secretKey}`).update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
        const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

        queryParams.set('X-Amz-Signature', signature);
        return `${url.origin}${targetPath}?${queryParams.toString()}`;
      } catch {
        // Fallback
      }
    }
    return this.fallbackAdapter.getPresignedPutUrl(cleanKey, contentType, expiresInSeconds);
  }

  public async healthCheck(): Promise<{ healthy: boolean; provider: string; bucket: string; latencyMs: number; message?: string }> {
    const startTime = Date.now();
    try {
      if (!this.config.endpoint) {
        return {
          healthy: true,
          provider: 'local',
          bucket: this.config.bucket,
          latencyMs: 1,
        };
      }

      const { url, host } = this.getUrlAndPath('');
      const payloadHash = crypto.createHash('sha256').update('').digest('hex');
      const headers = this.generateSigV4Headers('HEAD', `/${this.config.bucket}`, host, {}, payloadHash);

      const res = await guardedFetch(url.origin + `/${this.config.bucket}`, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(3000),
      });

      const isMinio = (this.config.endpoint || '').includes('minio') || (this.config.endpoint || '').includes(':9000');
      return {
        healthy: res.ok || res.status === 200 || res.status === 403,
        provider: isMinio ? 'minio' : 's3',
        bucket: this.config.bucket,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        healthy: false,
        provider: (this.config.endpoint || '').includes('minio') ? 'minio' : 's3',
        bucket: this.config.bucket,
        latencyMs: Date.now() - startTime,
        message: err?.message || 'Storage check failed',
      };
    }
  }
}
