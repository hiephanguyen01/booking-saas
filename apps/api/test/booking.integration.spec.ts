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

/** A whole-hour future slot, `dayOffset` days out. */
function slot(dayOffset: number, hourStart: number, hours: number): { from: string; to: string } {
  const d = new Date(Date.now() + dayOffset * 86_400_000);
  d.setUTCHours(hourStart, 0, 0, 0);
  return { from: d.toISOString(), to: new Date(d.getTime() + hours * 3_600_000).toISOString() };
}

const guest = (n: number) => ({ fullName: `Guest ${n}`, email: `guest${n}@example.com`, phone: '0900000009' });

describe('booking core & state machine', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
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
    process.env.OUTBOX_RELAY_DISABLED = 'true'; // also disables the booking scheduler
    process.env.ALLOW_MOCK_PAYMENTS = 'true';
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
    const partnerId = (await db.admin.partner.findFirstOrThrow({ where: { slug: 'giang-studio' } })).id;
    const studioTypeId = (await db.admin.listingType.findFirstOrThrow({ where: { tenantId, slug: 'studio' } })).id;
    const policyId = (await db.admin.cancellationPolicy.findFirstOrThrow({ where: { tenantId } })).id;
    const ownerCookies = await login(http, 'owner@studiohub.vn');

    const resource = await request(http)
      .post('/tenant/resources')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ partnerId, name: 'Booking cal' })
      .expect(201);
    const listing = await request(http)
      .post('/tenant/listings')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId: resource.body.id,
        title: 'Booking Studio',
        slug: 'booking-studio',
        attributes: { area: 30, style: 'Vintage', naturalLight: true },
        bookingModes: ['hourly'],
        modeConfig: { hourly: { basePrice: '300000', minDuration: 1, maxDuration: 8, granularity: 60, leadTimeMin: 0 } },
        depositPercent: 50,
        cancellationPolicyId: policyId,
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

  const createBooking = (body: object) =>
    request(http).post('/public/bookings').set('Host', HOST).send(body);

  it('creates a guest booking (pending_payment) and confirms it via mock-pay', async () => {
    const s = slot(30, 2, 2);
    const created = await createBooking({ listingId, mode: 'hourly', ...s, guest: guest(1) }).expect(201);
    expect(created.body.status).toBe('pending_payment');
    expect(created.body.totalAmount).toBe('600000'); // 2h × 300k
    expect(created.body.depositAmount).toBe('300000'); // 50%
    expect(created.body.code).toMatch(/^BK-/);

    const confirmed = await request(http)
      .post(`/public/bookings/${created.body.code}/mock-pay`)
      .set('Host', HOST)
      .expect(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.paidAmount).toBe('300000');
  });

  it('lets exactly one of N concurrent requests win the same slot (DoD)', async () => {
    const s = slot(31, 2, 2);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createBooking({ listingId, mode: 'hourly', ...s, guest: guest(100 + i) }).then((r) => r.status),
      ),
    );
    expect(results.filter((code) => code === 201)).toHaveLength(1);
    expect(results.filter((code) => code === 409)).toHaveLength(4);
  });

  it('supports guest lookup + cancel via email OTP with a policy refund', async () => {
    const s = slot(32, 2, 2);
    const created = await createBooking({ listingId, mode: 'hourly', ...s, guest: guest(2) }).expect(201);
    const code = created.body.code;
    await request(http).post(`/public/bookings/${code}/mock-pay`).set('Host', HOST).expect(200);

    const otpRes = await request(http).post(`/public/bookings/${code}/request-otp`).set('Host', HOST).expect(200);
    expect(otpRes.body.devOtp).toMatch(/^\d{6}$/);

    // Wrong OTP is rejected.
    await request(http)
      .post(`/public/bookings/${code}/cancel`)
      .set('Host', HOST)
      .send({ otp: '000000' })
      .expect(401);

    const cancelled = await request(http)
      .post(`/public/bookings/${code}/cancel`)
      .set('Host', HOST)
      .send({ otp: otpRes.body.devOtp, reason: 'change of plan' })
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(typeof cancelled.body.refundPercent).toBe('number');
    expect(cancelled.body.refundAmount).toBeDefined();
  });

  it('lists a logged-in customer’s bookings', async () => {
    const customerCookies = await login(http, 'customer@studiohub.vn');
    const s = slot(33, 2, 2);
    const created = await request(http)
      .post('/public/bookings')
      .set('Host', HOST)
      .set('Cookie', customerCookies)
      .send({ listingId, mode: 'hourly', ...s })
      .expect(201);

    const mine = await request(http)
      .get('/public/my-bookings')
      .set('Host', HOST)
      .set('Cookie', customerCookies)
      .expect(200);
    expect(mine.body.map((b: { code: string }) => b.code)).toContain(created.body.code);
  });
});
