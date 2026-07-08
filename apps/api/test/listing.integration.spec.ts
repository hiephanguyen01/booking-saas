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
  password: string,
): Promise<string[]> {
  const res = await request(http).post('/auth/login').send({ email, password }).expect(200);
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

const hourlyModeConfig = {
  basePrice: '300000',
  blocks: [{ hours: 2, price: '500000' }],
  minDuration: 1,
  maxDuration: 8,
  granularity: 60,
  leadTimeMin: 0,
};

/**
 * Task 1.4 DoD (TONG-QUAN.md §7/§9): a group with rooms on a shared resource,
 * golden-hour + block pricing, prices a quote correctly.
 */
describe('listings, groups & pricing', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let partnerId: string;
  let studioTypeId: string;
  let modelTypeId: string;
  let ownerCookies: string[];
  let resourceId: string;
  let groupId: string;
  let listingId: string;

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
    studioTypeId = (await db.admin.listingType.findFirstOrThrow({ where: { tenantId, slug: 'studio' } })).id;
    modelTypeId = (await db.admin.listingType.findFirstOrThrow({ where: { tenantId, slug: 'model' } })).id;
    ownerCookies = await login(http, 'owner@studiohub.vn', 'demo-password');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  const tenantReq = (method: 'post' | 'get' | 'patch' | 'delete', url: string) =>
    request(http)[method](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

  it('creates a shared resource and a group with two rooms on it', async () => {
    const resource = await tenantReq('post', '/tenant/resources')
      .send({ partnerId, name: 'Giang Q1 calendar' })
      .expect(201);
    resourceId = resource.body.id;

    const group = await tenantReq('post', '/tenant/listing-groups')
      .send({ partnerId, listingTypeId: studioTypeId, title: 'Giang Q1', slug: 'giang-q1' })
      .expect(201);
    groupId = group.body.id;

    const room1 = await tenantReq('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        groupId,
        resourceId,
        title: 'Room One',
        slug: 'room-one',
        attributes: { area: 30, style: 'Vintage', naturalLight: true },
        bookingModes: ['hourly'],
        modeConfig: { hourly: hourlyModeConfig },
        depositPercent: 50,
      })
      .expect(201);
    listingId = room1.body.id;
    expect(room1.body.resourceId).toBe(resourceId);

    const room2 = await tenantReq('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        groupId,
        resourceId, // same resource → shared calendar
        title: 'Room Two',
        slug: 'room-two',
        attributes: { area: 20, style: 'Hàn Quốc', naturalLight: false },
        bookingModes: ['hourly'],
        modeConfig: { hourly: hourlyModeConfig },
      })
      .expect(201);
    expect(room2.body.resourceId).toBe(resourceId); // both rooms share one resource
  });

  it('validates attributes, booking modes, slug, and the partner-verification gate', async () => {
    const badAttrs = await tenantReq('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId,
        title: 'Bad attrs',
        slug: 'bad-attrs',
        attributes: { area: 'not-a-number' },
        bookingModes: ['hourly'],
        modeConfig: { hourly: hourlyModeConfig },
      })
      .expect(400);
    expect(badAttrs.body.code).toBe('INVALID_ATTRIBUTES');

    const badModes = await tenantReq('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId,
        title: 'Bad modes',
        slug: 'bad-modes',
        attributes: { area: 10 },
        bookingModes: ['inventory'],
        stockQuantity: 1,
        modeConfig: { inventory: { unit: 'day', basePrice: '100000' } },
      })
      .expect(400);
    expect(badModes.body.code).toBe('INVALID_BOOKING_MODES');

    await tenantReq('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId,
        title: 'Dup',
        slug: 'room-one',
        attributes: { area: 10 },
        bookingModes: ['hourly'],
        modeConfig: { hourly: hourlyModeConfig },
      })
      .expect(409);

    // An unverified partner cannot serve the people-booking "model" type (Task 1.2 gate).
    const blocked = await tenantReq('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: modelTypeId,
        resourceId,
        title: 'A Model',
        slug: 'a-model',
        attributes: { height: 170 },
        bookingModes: ['hourly'],
        modeConfig: { hourly: hourlyModeConfig },
      })
      .expect(403);
    expect(blocked.body.code).toBe('PARTNER_NOT_VERIFIED');
  });

  it('prices a quote with golden-hour + block pricing', async () => {
    await tenantReq('post', `/tenant/listings/${listingId}/pricing-rules`)
      .send({
        bookingMode: 'hourly',
        ruleType: 'time_range',
        params: { from: '18:00', to: '22:00' },
        price: '450000',
        priority: 10,
      })
      .expect(201);

    // publishing is Task 1.5 — flip status directly so the public endpoint serves it
    await db.admin.listing.update({ where: { id: listingId }, data: { status: 'published' } });

    // 17:00–20:00 ICT (3h, no block): 300k base + 2 × 450k golden = 1,200,000
    const threeHours = await request(http)
      .get('/public/listings/room-one/quote')
      .set('Host', HOST)
      .query({ mode: 'hourly', from: '2026-03-10T10:00:00.000Z', to: '2026-03-10T13:00:00.000Z' })
      .expect(200);
    expect(threeHours.body.subtotal).toBe('1200000');

    // 18:00–20:00 ICT (2h): the block price wins over the golden-hour rule → 500,000
    const twoHours = await request(http)
      .get('/public/listings/room-one/quote')
      .set('Host', HOST)
      .query({ mode: 'hourly', from: '2026-03-10T11:00:00.000Z', to: '2026-03-10T13:00:00.000Z' })
      .expect(200);
    expect(twoHours.body.subtotal).toBe('500000');
    expect(twoHours.body.lineItems[0].block).toBe(true);
    expect(twoHours.body.depositAmount).toBe('250000'); // 50% deposit
  });

  it('blocks deleting a group that still has listings', async () => {
    const res = await tenantReq('delete', `/tenant/listing-groups/${groupId}`).expect(409);
    expect(res.body.code).toBe('LISTING_GROUP_NOT_EMPTY');
  });
});
