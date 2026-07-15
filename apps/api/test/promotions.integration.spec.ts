import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';
import { OutboxRelayWorker } from '../src/shared/outbox/outbox-relay.worker';
import { BookingSchedulerWorker } from '../src/modules/booking/infrastructure/booking-scheduler.worker';

const API_DIR = path.resolve(__dirname, '..');
const HOST = 'studiohub.bookify.vn';

async function login(http: ReturnType<INestApplication['getHttpServer']>, email: string): Promise<string[]> {
  const res = await request(http).post('/auth/login').send({ email, password: 'demo-password' }).expect(200);
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function slot(dayOffset: number, hourStart: number, hours: number): { from: string; to: string } {
  const d = new Date(Date.now() + dayOffset * 86_400_000);
  d.setUTCHours(hourStart, 0, 0, 0);
  return { from: d.toISOString(), to: new Date(d.getTime() + hours * 3_600_000).toISOString() };
}

const guest = (n: number) => ({ fullName: `Promo${n}`, email: `promo${n}@example.com`, phone: '0900000011' });

describe('promotions (§12)', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let listingId: string;
  let ownerCookies: string[];

  beforeAll(async () => {
    db = await startTestDb();
    redis = await new RedisContainer('redis:7').start();
    const base = db.container;
    process.env.DATABASE_URL = `postgresql://app_user:app_user_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.ADMIN_DATABASE_URL = `postgresql://app_admin:app_admin_dev_pw@${base.getHost()}:${base.getMappedPort(5432)}/${base.getDatabase()}`;
    process.env.MIGRATE_DATABASE_URL = base.getConnectionUri();
    process.env.REDIS_URL = redis.getConnectionUrl();
    process.env.SESSION_COOKIE_SECURE = 'false';
    process.env.OUTBOX_RELAY_DISABLED = 'true'; // drive the relay by hand in-test
    process.env.SEED_DEMO = 'true';
    process.env.PLATFORM_BASE_DOMAIN = 'bookify.vn';
    process.env.ALLOW_MOCK_PAYMENTS = 'true';

    execFileSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], { cwd: API_DIR, env: process.env, stdio: 'pipe' });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    await app.init();
    http = app.getHttpServer();

    tenantId = (await db.admin.tenant.findFirstOrThrow({ where: { slug: 'studiohub' } })).id;
    const partnerId = (await db.admin.partner.findFirstOrThrow({ where: { slug: 'giang-studio' } })).id;
    const studioTypeId = (await db.admin.listingType.findFirstOrThrow({ where: { tenantId, slug: 'studio' } })).id;
    ownerCookies = await login(http, 'owner@studiohub.vn');
    const tenant = (m: 'post', url: string) => request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

    const resource = await tenant('post', '/tenant/resources').send({ partnerId, name: 'Promo cal' }).expect(201);
    const listing = await tenant('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId: resource.body.id,
        title: 'Promo Studio',
        slug: 'promo-studio',
        provinceCode: '79',
        wardCode: '26740',
        address: '12 Nguyễn Huệ',
        attributes: { area: 30, style: 'Vintage', naturalLight: true },
        bookingModes: ['hourly'],
        modeConfig: { hourly: { basePrice: '300000', minDuration: 1, maxDuration: 8, granularity: 60, leadTimeMin: 0 } },
        depositPercent: 50,
      })
      .expect(201);
    listingId = listing.body.id;
    await db.admin.listing.update({ where: { id: listingId }, data: { status: 'published' } });
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  // ── helpers ──────────────────────────────────────────────────────────────
  const createBooking = (n: number, dayOffset: number, promoCode?: string) =>
    request(http)
      .post('/public/bookings')
      .set('Host', HOST)
      .send({ listingId, mode: 'hourly', ...slot(dayOffset, 2, 2), guest: guest(n), ...(promoCode ? { promoCode } : {}) });

  const validatePromo = (code: string, amount: string) =>
    request(http).post('/public/checkout/validate-promo').set('Host', HOST).send({ code, listingId, amount });

  async function seedPromo(overrides: Record<string, unknown>): Promise<string> {
    const p = await db.admin.promotion.create({
      data: {
        tenantId,
        name: 'Test promo',
        discountType: 'percent',
        discountValue: 10n,
        fundedBy: 'tenant',
        appliesTo: 'all',
        status: 'active',
        startsAt: new Date(),
        ...overrides,
      },
    });
    return p.id;
  }

  const promoOf = (id: string) => db.admin.promotion.findFirstOrThrow({ where: { id } });
  const redemptionsOf = (promotionId: string) => db.admin.promoRedemption.findMany({ where: { promotionId } });

  // ── tests ────────────────────────────────────────────────────────────────

  it('validate-promo previews a valid code and rejects with stable codes', async () => {
    await seedPromo({ code: 'PREVIEW10', discountValue: 10n, maxDiscount: 200_000n, minOrderAmount: 500_000n });

    const ok = await validatePromo('preview10', '2000000').expect(200); // lower-case → normalised
    expect(ok.body).toMatchObject({ valid: true, discountAmount: '200000', finalAmount: '1800000', code: 'PREVIEW10' });

    const notFound = await validatePromo('NOPE', '2000000').expect(200);
    expect(notFound.body).toMatchObject({ valid: false, error: 'PROMO_NOT_FOUND' });

    const belowMin = await validatePromo('PREVIEW10', '100000').expect(200);
    expect(belowMin.body).toMatchObject({ valid: false, error: 'PROMO_MIN_ORDER' });
  });

  it('a booking without a code is unchanged (discount 0, no redemption)', async () => {
    const res = await createBooking(1, 60).expect(201);
    expect(res.body.discountAmount).toBe('0');
    expect(res.body.finalAmount).toBe(res.body.totalAmount);
    const b = await db.admin.booking.findFirstOrThrow({ where: { id: res.body.id } });
    expect(b.promotionId).toBeNull();
    expect(await db.admin.promoRedemption.count({ where: { bookingId: res.body.id } })).toBe(0);
  });

  it('applies a code at booking creation → reserved redemption + booking snapshot', async () => {
    const promoId = await seedPromo({ code: 'APPLY10', discountValue: 10n });
    const res = await createBooking(2, 61, 'apply10').expect(201);

    // subtotal 600k → 10% = 60k discount, 540k final.
    expect(res.body.discountAmount).toBe('60000');
    expect(res.body.finalAmount).toBe('540000');

    const b = await db.admin.booking.findFirstOrThrow({ where: { id: res.body.id } });
    expect(b.promotionId).toBe(promoId);
    expect(b.promoCode).toBe('APPLY10');
    expect(b.promotionSnapshot).toMatchObject({ code: 'APPLY10', discountAmount: '60000', fundedBy: 'tenant' });

    const reds = await redemptionsOf(promoId);
    expect(reds).toHaveLength(1);
    expect(reds[0]).toMatchObject({ status: 'reserved', bookingId: res.body.id, discountAmount: 60_000n });
    expect((await promoOf(promoId)).redeemedCount).toBe(1);
  });

  it('confirming a booking flips its redemption reserved → applied', async () => {
    const promoId = await seedPromo({ code: 'CONFIRM10' });
    const res = await createBooking(3, 62, 'confirm10').expect(201);
    await request(http).post(`/public/bookings/${res.body.code}/mock-pay`).set('Host', HOST).expect(200);

    await app.get(OutboxRelayWorker).drainDueEvents(); // process booking.confirmed
    const reds = await redemptionsOf(promoId);
    expect(reds[0]?.status).toBe('applied');
    expect((await promoOf(promoId)).redeemedCount).toBe(1); // usage stays locked in
  });

  it('DoD: N concurrent requests for the last uses → exactly usage_limit_total applied', async () => {
    const LIMIT = 3;
    const N = 12;
    const promoId = await seedPromo({ code: 'RACE', discountValue: 10n, usageLimitTotal: LIMIT });

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => createBooking(100 + i, 200 + i, 'race')),
    );
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    const created = statuses.filter((s) => s === 201).length;
    const rejected = statuses.filter((s) => s === 409).length;

    expect(created).toBe(LIMIT);
    expect(rejected).toBe(N - LIMIT);

    const reds = await redemptionsOf(promoId);
    expect(reds).toHaveLength(LIMIT);
    expect(reds.every((r) => r.status === 'reserved')).toBe(true);
    // The counter never overshoots the limit (§12.3).
    expect((await promoOf(promoId)).redeemedCount).toBe(LIMIT);
  });

  it('release path returns the usage (expired booking frees the code for reuse)', async () => {
    const promoId = await seedPromo({ code: 'RELEASE', discountValue: 10n, usageLimitTotal: 1 });

    // Use the only slot.
    const first = await createBooking(4, 63, 'release').expect(201);
    expect((await promoOf(promoId)).redeemedCount).toBe(1);
    // The code is now exhausted.
    await createBooking(5, 64, 'release').expect(409);

    // Force the first booking to expire, then run scheduler + relay.
    await db.admin.booking.update({ where: { id: first.body.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(await app.get(BookingSchedulerWorker).sweep()).toBeGreaterThanOrEqual(1);
    await app.get(OutboxRelayWorker).drainDueEvents(); // process booking.expired → release

    const reds = await redemptionsOf(promoId);
    expect(reds.find((r) => r.bookingId === first.body.id)?.status).toBe('released');
    expect((await promoOf(promoId)).redeemedCount).toBe(0); // usage returned

    // The freed use can be claimed again.
    const reuse = await createBooking(6, 65, 'release').expect(201);
    expect(reuse.body.discountAmount).toBe('60000');
    expect((await promoOf(promoId)).redeemedCount).toBe(1);
  });

  it('tenant CRUD: create, list, usage-stats, and end (never delete)', async () => {
    const tenant = (m: 'post' | 'get' | 'patch', url: string) =>
      request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

    const created = await tenant('post', '/tenant/promotions')
      .send({ name: 'Summer', code: 'summer', discountType: 'fixed', discountValue: '150000', status: 'active' })
      .expect(201);
    expect(created.body).toMatchObject({ code: 'SUMMER', discountType: 'fixed', discountValue: '150000', status: 'active' });

    // Duplicate code → 409.
    await tenant('post', '/tenant/promotions')
      .send({ name: 'Dup', code: 'SUMMER', discountType: 'fixed', discountValue: '1000' })
      .expect(409);

    const list = await tenant('get', '/tenant/promotions').expect(200);
    expect(list.body.some((p: { code: string }) => p.code === 'SUMMER')).toBe(true);

    const stats = await tenant('get', `/tenant/promotions/${created.body.id}/usage-stats`).expect(200);
    expect(stats.body).toMatchObject({ redeemedCount: 0, reservedCount: 0, appliedCount: 0, releasedCount: 0, totalDiscount: '0' });

    const ended = await request(http)
      .post(`/tenant/promotions/${created.body.id}/end`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .expect(201);
    expect(ended.body.status).toBe('ended');
  });

  it('rejects an unauthenticated tenant promotion request', async () => {
    await request(http).get('/tenant/promotions').set('x-tenant-id', tenantId).expect(401);
  });
});
