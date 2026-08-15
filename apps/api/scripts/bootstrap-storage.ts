import '../src/config/load-root-env';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { s3ConfigFromEnv } from '../src/modules/storage/infrastructure/services/s3-storage.service';

/**
 * One-time bootstrap for object storage. It creates the bucket when the provider
 * supports that operation, configures public reads for local S3-compatible
 * storage, and uploads the default storefront assets.
 *
 * Cloudflare R2 does not implement PutBucketPolicy. Public reads there are
 * configured by connecting S3_PUBLIC_URL as an R2 custom domain, so this script
 * deliberately skips the bucket-policy call for R2 endpoints.
 */
async function main(): Promise<void> {
  const cfg = s3ConfigFromEnv();
  const s3 = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });

  await ensureBucket(s3, cfg.bucket);
  await ensureBucket(s3, cfg.privateBucket);

  const endpointHostname = new URL(cfg.endpoint).hostname;
  const isCloudflareR2 = endpointHostname.endsWith('.r2.cloudflarestorage.com');

  if (isCloudflareR2) {
    console.log(
      `skipped bucket policy for Cloudflare R2; public reads use the custom domain ${cfg.publicUrl}`,
    );
  } else {
    await s3.send(
      new PutBucketPolicyCommand({
        Bucket: cfg.bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Sid: 'PublicReadObjects',
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${cfg.bucket}/*`],
            },
          ],
        }),
      }),
    );
    console.log(`applied public-read policy to "${cfg.bucket}"`);
  }

  const storefrontAssets = resolve(process.cwd(), '../storefront/public/studiohub');
  const defaultAssets = [
    {
      label: 'logo',
      key: 'defaults/studiohub/logo.png',
      path: resolve(storefrontAssets, 'logo.png'),
      contentType: 'image/png',
    },
    {
      label: 'app icon',
      key: 'defaults/studiohub/app-icon.png',
      path: resolve(storefrontAssets, 'app-icon.png'),
      contentType: 'image/png',
    },
    {
      label: 'app icon 180',
      key: 'defaults/studiohub/app-icon-180.png',
      path: resolve(storefrontAssets, 'app-icon-180.png'),
      contentType: 'image/png',
    },
    {
      label: 'app icon 192',
      key: 'defaults/studiohub/app-icon-192.png',
      path: resolve(storefrontAssets, 'app-icon-192.png'),
      contentType: 'image/png',
    },
    {
      label: 'background',
      key: 'defaults/studiohub/background.png',
      path: resolve(storefrontAssets, 'hero.png'),
      contentType: 'image/png',
    },
    ...[1, 2, 3, 4].map((index) => ({
      label: `carousel image ${index}`,
      key: `defaults/studiohub/carousel/${String(index).padStart(2, '0')}.jpg`,
      path: resolve(storefrontAssets, `carousel/${String(index).padStart(2, '0')}.jpg`),
      contentType: 'image/jpeg',
    })),
  ] as const;

  for (const asset of defaultAssets) {
    await s3.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: asset.key,
        Body: readFileSync(asset.path),
        ContentType: asset.contentType,
        CacheControl: 'public, max-age=3600',
      }),
    );
    console.log(`uploaded default storefront ${asset.label} to ${cfg.publicUrl}/${asset.key}`);
  }
  console.log(`objects served from ${cfg.publicUrl}/<key>`);
  console.log(`private objects stored in "${cfg.privateBucket}" without a public-read policy`);
}

async function ensureBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`bucket "${bucket}" already exists`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`created bucket "${bucket}"`);
  }
}

main().catch((err: unknown) => {
  console.error('storage bootstrap failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
