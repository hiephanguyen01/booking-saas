import '../src/config/load-root-env';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import {
  MAX_PARTNER_DOCUMENT_SIZE_BYTES,
  PARTNER_DOCUMENT_UPLOAD_ACCEPT,
} from '@booking/contracts';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { s3ConfigFromEnv } from '../src/modules/storage/infrastructure/services/s3-storage.service';

const PAGE_SIZE = 200;
const LEGACY_SCALAR_FIELDS = {
  identityCardFrontUrl: 'identityCardFrontKey',
  identityCardBackUrl: 'identityCardBackKey',
  businessLicenseFrontUrl: 'businessLicenseFrontKey',
  businessLicenseBackUrl: 'businessLicenseBackKey',
} as const;
const LEGACY_ARRAY_FIELD = 'licenseDocs' as const;
const CANONICAL_ARRAY_FIELD = 'licenseDocumentKeys' as const;

const EXTENSIONS_BY_CONTENT_TYPE: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/avif': ['avif'],
  'image/gif': ['gif'],
};
const ALLOWED_CONTENT_TYPES = new Set<string>(PARTNER_DOCUMENT_UPLOAD_ACCEPT);

interface Counters {
  eligible: number;
  external_url: number;
  missing: number;
  oversized: number;
  already_migrated: number;
  migrated: number;
  delete_pending: number;
  failed: number;
}

type LegacyScalarField = keyof typeof LEGACY_SCALAR_FIELDS;
type CanonicalScalarField = (typeof LEGACY_SCALAR_FIELDS)[LegacyScalarField];

type LegacyReference =
  | {
      kind: 'scalar';
      legacyField: LegacyScalarField;
      canonicalField: CanonicalScalarField;
      sourceUrl: string;
    }
  | {
      kind: 'array';
      legacyField: typeof LEGACY_ARRAY_FIELD;
      canonicalField: typeof CANONICAL_ARRAY_FIELD;
      sourceUrl: string;
    };

type CanonicalEnsureResult = 'changed' | 'already' | 'conflict';

interface PartnerSnapshot {
  id: string;
  tenantId: string;
  businessInfo: Prisma.JsonValue;
}

interface ObjectState {
  exists: boolean;
  head?: HeadObjectCommandOutput;
}

const cfg = s3ConfigFromEnv();
const s3 = new S3Client({
  region: cfg.region,
  endpoint: cfg.endpoint,
  forcePathStyle: cfg.forcePathStyle,
  credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
});
const admin = new PrismaClient({
  datasources: { db: { url: process.env.ADMIN_DATABASE_URL } },
});
const app = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const apply = process.argv.includes('--apply');
if (apply && process.argv.includes('--dry-run')) {
  throw new Error('Choose either --apply or --dry-run, not both');
}

const counters: Counters = {
  eligible: 0,
  external_url: 0,
  missing: 0,
  oversized: 0,
  already_migrated: 0,
  migrated: 0,
  delete_pending: 0,
  failed: 0,
};

async function main(): Promise<void> {
  requireDatabaseUrls();
  console.log(`partner document migration mode: ${apply ? 'apply' : 'dry-run'}`);

  let cursor: string | undefined;
  let scannedPartners = 0;
  let discoveredReferences = 0;

  while (true) {
    const page = await admin.partner.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, tenantId: true, businessInfo: true },
    });
    if (page.length === 0) break;

    for (const partner of page) {
      scannedPartners += 1;
      const refs = collectLegacyReferences(asRecord(partner.businessInfo));
      discoveredReferences += refs.length;
      for (const ref of refs) {
        await migrateReference(partner, ref);
      }
    }

    cursor = page.at(-1)?.id;
    if (page.length < PAGE_SIZE) break;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        scannedPartners,
        discoveredReferences,
        ...counters,
      },
      null,
      2,
    ),
  );

  if (counters.failed > 0) process.exitCode = 1;
}

async function migrateReference(partner: PartnerSnapshot, ref: LegacyReference): Promise<void> {
  const sourceKey = sourceKeyForPublicUrl(ref.sourceUrl);
  if (!sourceKey) {
    counters.external_url += 1;
    return;
  }

  const extension = validatedExtension(sourceKey);
  if (!extension) {
    counters.failed += 1;
    warn(ref, 'source extension is not an allowed image extension');
    return;
  }

  const destinationKey = destinationKeyFor(partner.id, sourceKey, extension);
  const snapshotInfo = asRecord(partner.businessInfo);
  const canonicalAlreadyMatches = canonicalContains(snapshotInfo, ref, destinationKey);

  const [source, destination] = await Promise.all([
    headObject(cfg.bucket, sourceKey),
    headObject(cfg.privateBucket, destinationKey),
  ]);

  if (!source.exists) {
    if (canonicalAlreadyMatches && destination.exists) {
      counters.already_migrated += 1;
      if (apply) await cleanupLegacyReference(partner, ref, destinationKey);
      return;
    }
    counters.missing += 1;
    return;
  }

  const validation = validateSourceObject(source.head, extension);
  if (validation === 'oversized') {
    counters.oversized += 1;
    return;
  }
  if (validation !== 'ok') {
    counters.failed += 1;
    warn(ref, 'source object metadata does not match the allowed image policy');
    return;
  }

  counters.eligible += 1;
  const wasAlreadyMigrated = canonicalAlreadyMatches && destination.exists;
  if (wasAlreadyMigrated) counters.already_migrated += 1;

  if (!apply) return;

  if (!destination.exists) {
    try {
      await s3.send(
        new CopyObjectCommand({
          Bucket: cfg.privateBucket,
          Key: destinationKey,
          CopySource: copySource(cfg.bucket, sourceKey),
          ...(source.head?.ETag ? { CopySourceIfMatch: source.head.ETag } : {}),
        }),
      );
      const copied = await headObject(cfg.privateBucket, destinationKey);
      const copiedValidation = validateSourceObject(copied.head, extension);
      if (!copied.exists || copiedValidation !== 'ok') {
        throw new Error('copied private object failed metadata verification');
      }
    } catch (error) {
      counters.failed += 1;
      warn(ref, `private copy failed: ${safeError(error)}`);
      return;
    }
  }

  let ensureResult: CanonicalEnsureResult;
  try {
    ensureResult = await ensureCanonicalReference(partner, ref, destinationKey);
  } catch (error) {
    counters.failed += 1;
    warn(ref, `database canonicalization failed: ${safeError(error)}`);
    return;
  }
  if (ensureResult === 'conflict') {
    counters.failed += 1;
    warn(ref, 'canonical field already points at a different document');
    return;
  }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: sourceKey }));
  } catch (error) {
    counters.delete_pending += 1;
    warn(ref, `public source deletion is pending: ${safeError(error)}`);
    return;
  }

  try {
    await cleanupLegacyReference(partner, ref, destinationKey);
  } catch (error) {
    counters.failed += 1;
    warn(ref, `legacy database cleanup failed: ${safeError(error)}`);
    return;
  }

  if (!wasAlreadyMigrated) counters.migrated += 1;
}

function collectLegacyReferences(info: Record<string, unknown>): LegacyReference[] {
  const refs: LegacyReference[] = [];
  for (const [legacyField, canonicalField] of Object.entries(LEGACY_SCALAR_FIELDS) as Array<
    [LegacyScalarField, CanonicalScalarField]
  >) {
    const sourceUrl = info[legacyField];
    if (typeof sourceUrl === 'string' && sourceUrl.trim()) {
      refs.push({ kind: 'scalar', legacyField, canonicalField, sourceUrl: sourceUrl.trim() });
    }
  }
  const licenseDocs = info[LEGACY_ARRAY_FIELD];
  if (Array.isArray(licenseDocs)) {
    for (const value of licenseDocs) {
      if (typeof value === 'string' && value.trim()) {
        refs.push({
          kind: 'array',
          legacyField: LEGACY_ARRAY_FIELD,
          canonicalField: CANONICAL_ARRAY_FIELD,
          sourceUrl: value.trim(),
        });
      }
    }
  }
  return refs;
}

function sourceKeyForPublicUrl(raw: string): string | null {
  let source: URL;
  let base: URL;
  try {
    source = new URL(raw);
    base = new URL(cfg.publicUrl.endsWith('/') ? cfg.publicUrl : `${cfg.publicUrl}/`);
  } catch {
    return null;
  }
  if (source.protocol !== 'https:' && source.protocol !== 'http:') return null;
  if (source.origin !== base.origin || source.search || source.hash) return null;

  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  if (!source.pathname.startsWith(basePath)) return null;
  const encodedRelative = source.pathname.slice(basePath.length);
  if (!encodedRelative) return null;

  let key: string;
  try {
    key = decodeURIComponent(encodedRelative);
  } catch {
    return null;
  }
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) return null;
  return key;
}

function validatedExtension(sourceKey: string): string | null {
  const file = sourceKey.split('/').at(-1) ?? '';
  const match = /\.([a-z0-9]+)$/i.exec(file);
  if (!match?.[1]) return null;
  const extension = match[1].toLowerCase();
  const allowed = new Set(Object.values(EXTENSIONS_BY_CONTENT_TYPE).flat());
  return allowed.has(extension) ? extension : null;
}

function destinationKeyFor(partnerId: string, sourceKey: string, extension: string): string {
  const digest = createHash('sha256').update(sourceKey).digest('hex');
  return `partner-documents/legacy/${partnerId}/${digest}.${extension}`;
}

function validateSourceObject(
  head: HeadObjectCommandOutput | undefined,
  extension: string,
): 'ok' | 'oversized' | 'invalid' {
  if (!head) return 'invalid';
  const size = head.ContentLength;
  if (typeof size !== 'number' || size <= 0) return 'invalid';
  if (size > MAX_PARTNER_DOCUMENT_SIZE_BYTES) return 'oversized';
  const contentType = (head.ContentType ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) return 'invalid';
  if (!EXTENSIONS_BY_CONTENT_TYPE[contentType]?.includes(extension)) return 'invalid';
  return 'ok';
}

function canonicalContains(
  info: Record<string, unknown>,
  ref: LegacyReference,
  destinationKey: string,
): boolean {
  if (ref.kind === 'scalar') return info[ref.canonicalField] === destinationKey;
  return readStringArray(info[ref.canonicalField]).includes(destinationKey);
}

async function ensureCanonicalReference(
  partner: Pick<PartnerSnapshot, 'id' | 'tenantId'>,
  ref: LegacyReference,
  destinationKey: string,
): Promise<CanonicalEnsureResult> {
  return forTenant(partner.tenantId, async (tx) => {
    const row = await tx.partner.findUnique({
      where: { id: partner.id },
      select: { businessInfo: true },
    });
    if (!row) throw new Error('partner not visible in tenant-scoped transaction');
    const info = asRecord(row.businessInfo);

    if (ref.kind === 'scalar') {
      const currentCanonical = info[ref.canonicalField];
      if (currentCanonical !== undefined && currentCanonical !== '' && currentCanonical !== destinationKey) {
        return 'conflict';
      }
      const currentLegacy = info[ref.legacyField];
      if (currentLegacy !== ref.sourceUrl && currentCanonical !== destinationKey) return 'conflict';
      if (currentCanonical === destinationKey) return 'already';
      info[ref.canonicalField] = destinationKey;
    } else {
      const existingCanonical = readStringArray(info[ref.canonicalField]);
      if (existingCanonical.includes(destinationKey)) return 'already';
      const currentLegacy = readStringArray(info[ref.legacyField]);
      if (!currentLegacy.includes(ref.sourceUrl)) return 'conflict';
      info[ref.canonicalField] = [...existingCanonical, destinationKey];
    }

    await tx.partner.update({
      where: { id: partner.id },
      data: { businessInfo: info as Prisma.InputJsonObject },
    });
    return 'changed';
  });
}

async function cleanupLegacyReference(
  partner: Pick<PartnerSnapshot, 'id' | 'tenantId'>,
  ref: LegacyReference,
  destinationKey: string,
): Promise<void> {
  await forTenant(partner.tenantId, async (tx) => {
    const row = await tx.partner.findUnique({
      where: { id: partner.id },
      select: { businessInfo: true },
    });
    if (!row) throw new Error('partner not visible in tenant-scoped transaction');
    const info = asRecord(row.businessInfo);
    if (!canonicalContains(info, ref, destinationKey)) return;

    let changed = false;
    if (ref.kind === 'scalar') {
      if (info[ref.legacyField] === ref.sourceUrl) {
        delete info[ref.legacyField];
        changed = true;
      }
    } else {
      const legacy = readStringArray(info[ref.legacyField]);
      const next = legacy.filter((url) => url !== ref.sourceUrl);
      if (next.length !== legacy.length) {
        if (next.length > 0) info[ref.legacyField] = next;
        else delete info[ref.legacyField];
        changed = true;
      }
    }

    if (changed) {
      await tx.partner.update({
        where: { id: partner.id },
        data: { businessInfo: info as Prisma.InputJsonObject },
      });
    }
  });
}

async function forTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

async function headObject(bucket: string, key: string): Promise<ObjectState> {
  try {
    return { exists: true, head: await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })) };
  } catch (error) {
    if (isNotFound(error)) return { exists: false };
    throw error;
  }
}

function copySource(bucket: string, key: string): string {
  return `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Prisma.JsonObject) };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey'
  );
}

function warn(ref: LegacyReference, message: string): void {
  console.warn(`partner document migration warning [${ref.legacyField}]: ${message}`);
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  return error.name || 'Error';
}

function requireDatabaseUrls(): void {
  if (!process.env.ADMIN_DATABASE_URL) throw new Error('ADMIN_DATABASE_URL is required');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
}

main()
  .catch((error: unknown) => {
    console.error(`partner document migration failed: ${safeError(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([admin.$disconnect(), app.$disconnect()]);
    s3.destroy();
  });
