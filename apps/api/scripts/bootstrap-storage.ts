import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { s3ConfigFromEnv } from '../src/shared/storage/s3-storage.service';

/**
 * One-time dev bootstrap for object storage: create the bucket and make it
 * publicly readable so presigned uploads are viewable on the storefront.
 * Idempotent — safe to re-run. Reads S3_* from apps/api/.env (or docker-compose
 * defaults). PRODUCTION note: do NOT use a public bucket policy there — serve
 * via a CDN or signed GET URLs instead.
 */
function loadDotEnv(): void {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const cfg = s3ConfigFromEnv();
  const s3 = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    console.log(`bucket "${cfg.bucket}" already exists`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
    console.log(`created bucket "${cfg.bucket}"`);
  }

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
  console.log(`applied public-read policy to "${cfg.bucket}" (dev only)`);
  console.log(`objects served from ${cfg.publicUrl}/<key>`);
}

main().catch((err: unknown) => {
  console.error('storage bootstrap failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
