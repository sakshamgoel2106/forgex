/**
 * ForgeX AI — Pluggable Storage Adapter Contract
 */

export interface StoragePutResult {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface IStorageAdapter {
  /**
   * Stores a file buffer under a server-controlled storage key
   */
  putObject(key: string, data: Buffer, contentType: string): Promise<StoragePutResult>;

  /**
   * Retrieves raw file buffer from storage
   */
  getObject(key: string): Promise<Buffer>;

  /**
   * Deletes a stored file
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Generates a secure URL or download endpoint for accessing the file
   */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
