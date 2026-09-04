import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  CopyObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  CreateUploadInput,
  PrivatePresignedDownload,
  PrivatePdfInspection,
  PresignedUpload,
  PrivatePresignedUpload,
  StoragePort,
} from '../../domain/ports/storage.port';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** Private documents; this bucket must never receive a public-read policy or CDN domain. */
  privateBucket: string;
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
  'application/pdf': 'pdf',
};

export function s3ConfigFromEnv(): S3StorageConfig {
  const bucket = process.env.S3_BUCKET ?? 'bookingos';
  const privateBucket = process.env.S3_PRIVATE_BUCKET ?? `${bucket}-private`;
  if (privateBucket === bucket) {
    throw new Error('S3_PRIVATE_BUCKET must differ from the public S3_BUCKET');
  }
  return {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY ?? 'minio',
    secretKey: process.env.S3_SECRET_KEY ?? 'minio12345',
    bucket,
    privateBucket,
    publicUrl:
      process.env.S3_PUBLIC_URL ??
      `${process.env.S3_ENDPOINT ?? 'http://localhost:9000'}/${bucket}`,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    presignExpiresSec: Number(process.env.S3_PRESIGN_EXPIRES_SEC ?? '300'),
  };
}

/**
 * S3/MinIO adapter. Generates a random object key (never trusts a client-supplied
 * filename) and returns a presigned PUT URL scoped to the declared content type.
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
    const grant = await this.createUpload(this.config.bucket, input);
    return { ...grant, publicUrl: this.publicUrlForKey(grant.key) };
  }

  createPrivatePresignedUpload(input: CreateUploadInput): Promise<PrivatePresignedUpload> {
    return this.createUpload(this.config.privateBucket, input);
  }

  async createPrivatePresignedDownload(input: {
    key: string;
    fileName?: string;
  }): Promise<PrivatePresignedDownload> {
    const key = input.key.replace(/^\/+/, '');
    if (!key || key.includes('..')) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_STORAGE_KEY',
        message: 'Invalid storage object key',
      });
    }

    const responseOverrides = input.fileName
      ? (() => {
          const fileName = input.fileName
            .replace(/[\r\n"\\/]/g, '-')
            .replace(/[^a-z0-9._-]/gi, '-')
            .slice(0, 180);
          return {
            ResponseContentType: 'application/pdf',
            ResponseContentDisposition: `inline; filename="${fileName || 'document.pdf'}"`,
          };
        })()
      : {};

    const downloadUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.privateBucket,
        Key: key,
        ...responseOverrides,
      }),
      { expiresIn: this.config.presignExpiresSec },
    );
    return { downloadUrl, expiresInSec: this.config.presignExpiresSec };
  }

  async inspectPrivatePdf(input: {
    key: string;
    maxSizeBytes: number;
  }): Promise<PrivatePdfInspection> {
    const key = this.normalizePrivateKey(input.key);
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.privateBucket, Key: key }),
      );
      const contentType = object.ContentType ?? '';
      if ((object.ContentLength ?? 0) > input.maxSizeBytes) {
        return {
          valid: false,
          reason: 'too_large',
          checksum: '',
          sizeBytes: object.ContentLength ?? 0,
          contentType,
        };
      }
      if (!object.Body) {
        return { valid: false, reason: 'not_found', checksum: '', sizeBytes: 0, contentType };
      }

      const hash = createHash('sha256');
      let sizeBytes = 0;
      let header = Buffer.alloc(0);
      let tail = Buffer.alloc(0);
      for await (const rawChunk of object.Body as AsyncIterable<Uint8Array>) {
        const chunk = Buffer.from(rawChunk);
        sizeBytes += chunk.byteLength;
        if (sizeBytes > input.maxSizeBytes) {
          return { valid: false, reason: 'too_large', checksum: '', sizeBytes, contentType };
        }
        hash.update(chunk);
        if (header.byteLength < 5) {
          header = Buffer.concat([header, chunk]).subarray(0, 5);
        }
        tail = Buffer.concat([tail, chunk]).subarray(-1024);
      }

      const checksum = hash.digest('hex');
      if (contentType !== 'application/pdf') {
        return { valid: false, reason: 'wrong_content_type', checksum, sizeBytes, contentType };
      }
      const hasPdfHeader = header.toString('ascii') === '%PDF-';
      const hasEofMarker = tail.toString('latin1').includes('%%EOF');
      if (!hasPdfHeader || !hasEofMarker || sizeBytes === 0) {
        return { valid: false, reason: 'invalid_pdf', checksum, sizeBytes, contentType };
      }
      return { valid: true, checksum, sizeBytes, contentType };
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === 'NoSuchKey') {
        return {
          valid: false,
          reason: 'not_found',
          checksum: '',
          sizeBytes: 0,
          contentType: '',
        };
      }
      throw error;
    }
  }

  async inspectPrivateFile(input: {
    key: string;
    allowedContentTypes: readonly string[];
    maxSizeBytes: number;
  }) {
    const key = this.normalizePrivateKey(input.key);
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.config.privateBucket, Key: key }));
      const contentType = object.ContentType ?? '';
      const sizeBytes = object.ContentLength ?? 0;
      if (sizeBytes > input.maxSizeBytes || !object.Body) {
        return { valid: false, reason: sizeBytes > input.maxSizeBytes ? 'too_large' as const : 'not_found' as const, checksum: '', sizeBytes, contentType };
      }
      const hash = createHash('sha256');
      let bytes = 0;
      let header = Buffer.alloc(0);
      for await (const rawChunk of object.Body as AsyncIterable<Uint8Array>) {
        const chunk = Buffer.from(rawChunk);
        bytes += chunk.byteLength;
        hash.update(chunk);
        if (header.byteLength < 12) header = Buffer.concat([header, chunk]).subarray(0, 12);
      }
      const checksum = hash.digest('hex');
      const signatureValid = contentType === 'application/pdf'
        ? header.subarray(0, 5).toString('ascii') === '%PDF-'
        : contentType === 'image/png'
          ? header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : contentType === 'image/jpeg'
            ? header.subarray(0, 3).equals(Buffer.from([255,216,255]))
            : false;
      if (!input.allowedContentTypes.includes(contentType)) return { valid: false, reason: 'wrong_content_type' as const, checksum, sizeBytes: bytes, contentType };
      if (!signatureValid || bytes === 0) return { valid: false, reason: 'invalid_signature' as const, checksum, sizeBytes: bytes, contentType };
      return { valid: true, checksum, sizeBytes: bytes, contentType };
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === 'NoSuchKey') {
        return { valid: false, reason: 'not_found' as const, checksum: '', sizeBytes: 0, contentType: '' };
      }
      throw error;
    }
  }

  async quarantinePrivateObject(key: string): Promise<void> {
    const normalized = this.normalizePrivateKey(key);
    const quarantineKey = `quarantine/${normalized}`;
    await this.client.send(new CopyObjectCommand({
      Bucket: this.config.privateBucket,
      CopySource: `${this.config.privateBucket}/${normalized}`,
      Key: quarantineKey,
    }));
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.privateBucket, Key: normalized }));
  }

  async deletePrivateObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.privateBucket,
        Key: this.normalizePrivateKey(key),
      }),
    );
  }

  private async createUpload(
    bucket: string,
    input: CreateUploadInput,
  ): Promise<PrivatePresignedUpload> {
    const ext = MEDIA_EXT[input.contentType];
    if (!ext) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: `Unsupported upload content type (${Object.keys(MEDIA_EXT).join(', ')})`,
      });
    }
    const prefix =
      input.keyPrefix.replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '') || 'uploads';
    const key = `${prefix}/${randomUUID()}.${ext}`;

    const signableHeaders = new Set<string>(['content-type']);
    if (input.contentLength !== undefined) signableHeaders.add('content-length');
    if (input.writeOnce) signableHeaders.add('if-none-match');

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: input.contentType,
        ...(input.contentLength !== undefined ? { ContentLength: input.contentLength } : {}),
        ...(input.writeOnce ? { IfNoneMatch: '*' } : {}),
      }),
      { expiresIn: this.config.presignExpiresSec, signableHeaders },
    );

    return {
      uploadUrl,
      key,
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

  private normalizePrivateKey(key: string): string {
    const normalized = key.replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_STORAGE_KEY',
        message: 'Invalid storage object key',
      });
    }
    return normalized;
  }
}
