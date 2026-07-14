import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';

const API_DIR = path.resolve(__dirname, '..');
const HOST = 'studiohub.bookify.vn';

async function login(
  http: ReturnType<INestApplication['getHttpServer']>,
  email: string,
): Promise<string[]> {
  const res = await request(http)
    .post('/auth/login')
    .send({ email, password: 'demo-password' })
    .expect(200);
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

const hourlyModeConfig = {
  basePrice: '300000',
  minDuration: 1,
  maxDuration: 8,
  granularity: 60,
  leadTimeMin: 0,
};

/**
 * Task 1.5 DoD (TONG-QUAN.md §7.3, §16.1): contact info flagged at review +
 * publishing blocked, admin-hide lockout enforced over HTTP, and trust signals
 * rendered from real data.
 */
describe('listing moderation & trust signals', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let partnerId: string;
  let studioTypeId: string;
  let ownerCookies: string[];
  let partnerCookies: string[];
  let listingId: string;
  let groupId: string;

  beforeAll(async () => {
    db = await startTestDb();
    redis = await new RedisContainer('redis:7').start();

    const base = db.container;
    process.env.DATABASE_URL = `postgresql://app_user:app_user_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.ADMIN_DATABASE_URL = `postgresql://app_admin:app_admin_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.MIGRATE_DATABASE_URL = base.getConnectionUri();
    process.env.REDIS_URL = redis.getConnectionUrl();
    process.env.SESSION_COOKIE_SECURE = 'false';
    process.env.OUTBOX_RELAY_DISABLED = 'true';
    process.env.SEED_DEMO = 'true';
    process.env.PLATFORM_BASE_DOMAIN = 'bookify.vn';

    execFileSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], {
      cwd: API_DIR,
      env: process.env,
      stdio: 'pipe',
    });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    http = app.getHttpServer();

    tenantId = (await db.admin.tenant.findFirstOrThrow({ where: { slug: 'studiohub' } })).id;
    partnerId = (await db.admin.partner.findFirstOrThrow({ where: { slug: 'giang-studio' } })).id;
    studioTypeId = (
      await db.admin.listingType.findFirstOrThrow({ where: { tenantId, slug: 'studio' } })
    ).id;
    ownerCookies = await login(http, 'owner@studiohub.vn');
    partnerCookies = await login(http, 'giang@giangstudio.vn');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  const tenant = (m: 'post' | 'get' | 'patch', url: string) =>
    request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);
  const partner = (m: 'post', url: string) =>
    request(http)
      [m](url)
      .set('Cookie', partnerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', partnerId);

  const attributes = { area: 30, style: 'Vintage', naturalLight: true };

  it('flags contact info at review and blocks publishing until it is removed', async () => {
    const resource = await tenant('post', '/tenant/resources')
      .send({ partnerId, name: 'Mod calendar' })
      .expect(201);
    const listing = await tenant('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId: resource.body.id,
        title: 'Studio ánh sáng',
        slug: 'studio-anh-sang',
        description: 'Đặt phòng gọi 0901234567 hoặc Zalo để được giảm giá',
        photos: ['https://picsum.photos/seed/x/800/600'],
        attributes,
        bookingModes: ['hourly'],
        modeConfig: { hourly: hourlyModeConfig },
        depositPercent: 50,
      })
      .expect(201);
    listingId = listing.body.id;

    // Partner submits for review (draft → pending_review).
    const submitted = await partner('post', `/partner/listings/${listingId}/submit`).expect(200);
    expect(submitted.body.listing.status).toBe('pending_review');
    expect(
      submitted.body.review.contactFlags.some((f: { type: string }) => f.type === 'phone'),
    ).toBe(true);

    // Reviewer sees the same flags.
    const review = await tenant('get', `/tenant/listings/${listingId}/review`).expect(200);
    expect(review.body.contactFlags.map((f: { type: string }) => f.type)).toEqual(
      expect.arrayContaining(['phone', 'zalo']),
    );

    // Publishing is blocked while contact info remains.
    const blocked = await tenant('post', `/tenant/listings/${listingId}/publish`).expect(400);
    expect(blocked.body.code).toBe('LISTING_HAS_CONTACT_INFO');
  });

  it('publishes a cleaned listing and exposes trust signals (no contact info)', async () => {
    await tenant('patch', `/tenant/listings/${listingId}`)
      .send({ description: 'Không gian rộng rãi, ánh sáng tự nhiên, có phòng thay đồ.' })
      .expect(200);

    const published = await tenant('post', `/tenant/listings/${listingId}/publish`).expect(200);
    expect(published.body.status).toBe('published');
    expect(published.body.publishedBy).toBe('admin');

    const detail = await request(http)
      .get('/public/listings/studio-anh-sang')
      .set('Host', HOST)
      .expect(200);
    expect(detail.body.trust).toBeDefined();
    expect(detail.body.trust.partnerName).toBeTruthy();
    expect(detail.body.trust.completedBookings).toBe(0);
    // Contact info is never exposed publicly.
    expect(JSON.stringify(detail.body)).not.toContain('0901234567');
  });

  it('enforces the admin-hide lockout over HTTP', async () => {
    const hidden = await tenant('post', `/tenant/listings/${listingId}/hide`).send({}).expect(200);
    expect(hidden.body.status).toBe('archived');
    expect(hidden.body.hiddenBy).toBe('admin');

    // A partner cannot re-publish a post an admin hid.
    const locked = await partner('post', `/partner/listings/${listingId}/republish`).expect(403);
    expect(locked.body.code).toBe('LISTING_ADMIN_LOCKED');

    // The admin can unlock it.
    const republished = await tenant('post', `/tenant/listings/${listingId}/republish`).expect(200);
    expect(republished.body.status).toBe('published');
  });

  it('blocks group contact info by default and records an explicit force-publish override', async () => {
    const group = await tenant('post', '/tenant/listing-groups')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        title: 'Giang Studio Q3',
        slug: 'giang-q3',
        description: 'Ghé xem studio, add zalo 0912345678 nhé',
      })
      .expect(201);
    groupId = group.body.id;

    await partner('post', `/partner/listing-groups/${groupId}/submit`).expect(200);
    const blocked = await tenant('post', `/tenant/listing-groups/${groupId}/publish`).expect(400);
    expect(blocked.body.code).toBe('LISTING_HAS_CONTACT_INFO');

    const published = await tenant('post', `/tenant/listing-groups/${groupId}/publish`)
      .send({ force: true })
      .expect(200);
    expect(published.body.status).toBe('published');
    expect(published.body.publishedBy).toBe('admin');

    const audit = await db.admin.auditLog.findFirstOrThrow({
      where: {
        tenantId,
        entityType: 'listing_group',
        entityId: groupId,
        action: 'listing_group.published',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.data).toMatchObject({ reason: 'force-published: contact-info gate bypassed' });
  });
});
