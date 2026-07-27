import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { CreateUploadInput, PresignedUpload, StoragePort } from '../../domain/ports/storage.port';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** Base URL objects are publicly served from (CDN in prod, MinIO in dev). */
  publicUrl: string;
  forcePathStyle: boolean;
  presignExpiresSec: number;
}

const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  // .ico is used for tenant favicons (§16.2 theme_config.faviconUrl).
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function s3ConfigFromEnv(): S3StorageConfig {
  return {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY ?? 'minio',
    secretKey: process.env.S3_SECRET_KEY ?? 'minio12345',
    bucket: process.env.S3_BUCKET ?? 'bookingos',
    publicUrl:
      process.env.S3_PUBLIC_URL ??
      `${process.env.S3_ENDPOINT ?? 'http://localhost:9000'}/${process.env.S3_BUCKET ?? 'bookingos'}`,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    presignExpiresSec: Number(process.env.S3_PRESIGN_EXPIRES_SEC ?? '300'),
  };
}

/**
 * S3/MinIO adapter. Generates a random object key (never trusts a client-supplied
 * filename) and returns a presigned PUT URL scoped to the declared image type.
 */
@Injectable()
export class S3StorageService implements StoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }

  async createPresignedUpload(input: CreateUploadInput): Promise<PresignedUpload> {
    const ext = MEDIA_EXT[input.contentType];
    if (!ext) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Unsupported upload content type (${Object.keys(MEDIA_EXT).join(', ')})`,
      });
    }
    const prefix = input.keyPrefix.replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '') || 'uploads';
    const key = `${prefix}/${randomUUID()}.${ext}`;

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: input.contentType,
      }),
      { expiresIn: this.config.presignExpiresSec },
    );

    return {
      uploadUrl,
      key,
      publicUrl: this.publicUrlForKey(key),
      expiresInSec: this.config.presignExpiresSec,
    };
  }

  publicUrlForKey(key: string): string {
    const normalized = key.replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_STORAGE_KEY',
        message: 'Invalid storage object key',
      });
    }
    return `${this.config.publicUrl.replace(/\/+$/, '')}/${normalized}`;
  }
}
