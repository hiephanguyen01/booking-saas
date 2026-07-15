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

async function login(http: ReturnType<INestApplication['getHttpServer']>, email: string): Promise<string[]> {
  const res = await request(http).post('/auth/login').send({ email, password: 'demo-password' }).expect(200);
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (days: number) => iso(new Date(Date.now() + days * 86_400_000));

const modeConfig = {
  hourly: { basePrice: '300000', minDuration: 1, maxDuration: 8, granularity: 60, leadTimeMin: 0 },
  daily: { basePricePerNight: '2000000', minNights: 1, maxNights: 30, checkinTime: '14:00', checkoutTime: '12:00', leadTimeMin: 0 },
};

/** Task 1.6 DoD (§9): slot generation with rules/exceptions + the public endpoint. */
describe('scheduling & availability', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let partnerId: string;
  let studioTypeId: string;
  let ownerCookies: string[];
  let listingId: string;
  let resourceId: string;

  const from = plus(30);
  const openDay = plus(31);
  const to = plus(34);

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
    ownerCookies = await login(http, 'owner@studiohub.vn');

    const tenant = (m: 'post', url: string) =>
      request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

    const resource = await tenant('post', '/tenant/resources').send({ partnerId, name: 'Avail cal' }).expect(201);
    resourceId = resource.body.id;
    const listing = await tenant('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId,
        title: 'Avail Studio',
        slug: 'avail-studio',
        provinceCode: '79',
        wardCode: '26740',
        address: '12 Nguyễn Huệ',
        attributes: { area: 30, style: 'Vintage', naturalLight: true },
        bookingModes: ['hourly', 'daily'],
        modeConfig,
        depositPercent: 50,
      })
      .expect(201);
    listingId = listing.body.id;
    await db.admin.listing.update({ where: { id: listingId }, data: { status: 'published' } });

    // Open every weekday 09:00–17:00.
    await request(http)
      .put(`/tenant/listings/${listingId}/availability-rules`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ rules: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openTime: '09:00', closeTime: '17:00' })) })
      .expect(200);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  const availability = (mode: 'hourly' | 'daily') =>
    request(http)
      .get('/public/listings/avail-studio/availability')
      .set('Host', HOST)
      .query({ mode, from, to });

  it('generates 8 hourly slots per open day (09:00–17:00, 1h grid)', async () => {
    const res = await availability('hourly').expect(200);
    expect(res.body.mode).toBe('hourly');
    const day = res.body.days.find((d: { date: string }) => d.date === from);
    expect(day.slots).toHaveLength(8);
    expect(day.slots.every((s: { available: boolean }) => s.available)).toBe(true);
    expect(day.slots[0].price).toBe('300000');
  });

  it('returns a daily calendar of available nights', async () => {
    const res = await availability('daily').expect(200);
    expect(res.body.mode).toBe('daily');
    const day = res.body.days.find((d: { date: string }) => d.date === from);
    expect(day.status).toBe('available');
    expect(day.price).toBe('2000000');
  });

  it('a closed exception empties the day immediately', async () => {
    const before = await availability('hourly').expect(200);
    expect(before.body.days.find((d: { date: string }) => d.date === openDay).slots.length).toBeGreaterThan(0);

    await request(http)
      .post(`/tenant/resources/${resourceId}/availability-exceptions`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ date: openDay, type: 'closed', reason: 'Bảo trì' })
      .expect(201);

    const afterHourly = await availability('hourly').expect(200);
    expect(afterHourly.body.days.find((d: { date: string }) => d.date === openDay).slots).toHaveLength(0);

    const afterDaily = await availability('daily').expect(200);
    expect(afterDaily.body.days.find((d: { date: string }) => d.date === openDay).status).toBe('blocked');
  });
});
