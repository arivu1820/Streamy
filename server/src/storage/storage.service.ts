import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createReadStream, statSync, promises as fs } from 'fs';
import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StorageDriver = 'local' | 'r2';

/**
 * Where uploaded videos live.
 *
 *   local (dev / Docker)  -> on-disk under UPLOAD_DIR; the API streams bytes.
 *   r2    (production)     -> Cloudflare R2 (S3-compatible). The API never
 *                            streams video bytes itself: the /stream endpoint
 *                            authorises the request and 302-redirects the
 *                            browser to a short-lived PRESIGNED R2 URL. R2 then
 *                            serves the (range) request directly. This is what
 *                            makes a free Render instance viable — it keeps
 *                            multi-GB video traffic off the app's CPU/RAM/egress.
 *
 * Driver selection: STORAGE_DRIVER=local|r2. If unset, we infer "r2" when the
 * R2_* credentials are present, otherwise "local" — so nothing breaks when the
 * variable is simply absent (backward compatible).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('StorageService');
  readonly driver: StorageDriver;
  private readonly uploadDir = path.resolve(process.env.UPLOAD_DIR || './storage');

  // R2 config
  private readonly bucket = process.env.R2_BUCKET || '';
  private readonly publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || ''; // optional CDN/public bucket
  private readonly urlTtlSeconds = Number(process.env.R2_URL_TTL_SECONDS || 3600);
  private s3?: S3Client;

  constructor() {
    const explicit = (process.env.STORAGE_DRIVER || '').toLowerCase();
    const hasR2 =
      !!process.env.R2_ACCOUNT_ID &&
      !!process.env.R2_ACCESS_KEY_ID &&
      !!process.env.R2_SECRET_ACCESS_KEY &&
      !!process.env.R2_BUCKET;
    this.driver = explicit === 'r2' || (explicit !== 'local' && hasR2) ? 'r2' : 'local';
  }

  onModuleInit() {
    if (this.driver === 'r2') {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
        },
      });
      this.logger.log(`Storage driver: R2 (bucket="${this.bucket}").`);
    } else {
      this.logger.log(`Storage driver: local disk (${this.uploadDir}).`);
    }
  }

  /**
   * Move a freshly-uploaded temp file into permanent storage.
   * Multer has already written `tmpPath`. Returns the storage key to persist.
   */
  async persistUpload(tmpPath: string, key: string, contentType: string): Promise<string> {
    if (this.driver === 'r2') {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: createReadStream(tmpPath),
          ContentType: contentType,
          ContentLength: statSync(tmpPath).size,
        }),
      );
      await fs.rm(tmpPath, { force: true }); // temp file no longer needed
      return key;
    }
    // local: multer already wrote it under UPLOAD_DIR with this filename.
    return key;
  }

  /** Remove media for a deleted video (best-effort). */
  async remove(key: string): Promise<void> {
    try {
      if (this.driver === 'r2') {
        await this.s3!.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      } else {
        await fs.rm(path.resolve(this.uploadDir, key), { force: true });
      }
    } catch (e) {
      this.logger.warn(`remove(${key}) failed: ${(e as Error).message}`);
    }
  }

  /**
   * Resolve how to serve a video.
   *   r2    -> { kind: 'redirect', url } : a presigned (or public) R2 URL.
   *   local -> { kind: 'file', path }    : an on-disk path for range streaming.
   */
  async resolve(
    key: string,
  ): Promise<{ kind: 'redirect'; url: string } | { kind: 'file'; path: string }> {
    if (this.driver === 'r2') {
      if (this.publicBaseUrl) {
        return { kind: 'redirect', url: `${this.publicBaseUrl.replace(/\/$/, '')}/${key}` };
      }
      const url = await getSignedUrl(
        this.s3!,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: this.urlTtlSeconds },
      );
      return { kind: 'redirect', url };
    }
    return { kind: 'file', path: path.resolve(this.uploadDir, key) };
  }
}
