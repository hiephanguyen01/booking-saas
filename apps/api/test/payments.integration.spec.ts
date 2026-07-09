import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';
import { signMockWebhook } from '../src/modules/payments/infrastructure/gateways/mock-gateway.adapter';
import { ExecuteRefundUseCase } from '../src/modules/payments/application/use-cases/execute-refund.use-case';
import { ReconciliationWorker } from '../src/modules/payments/infrastructure/reconciliation.worker';

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

const guest = (n: number) => ({ fullName: `P${n}`, email: `pay${n}@example.com`, phone: '0900000009' });

describe('payments (PayOS + mock)', () => {
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
    process.env.OUTBOX_RELAY_DISABLED = 'true';
    process.env.SEED_DEMO = 'true';
    process.env.PLATFORM_BASE_DOMAIN = 'bookify.vn';
    process.env.PAYMENT_STALE_SEC = '0'; // reconciliation treats every pending payment as stale

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
    const ownerCookies = await login(http, 'owner@studiohub.vn');
    const tenant = (m: 'post', url: string) => request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

    const resource = await tenant('post', '/tenant/resources').send({ partnerId, name: 'Pay cal' }).expect(201);
    const listing = await tenant('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId: resource.body.id,
        title: 'Pay Studio',
        slug: 'pay-studio',
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

  const createBooking = (n: number, dayOffset: number) =>
    request(http)
      .post('/public/bookings')
      .set('Host', HOST)
      .send({ listingId, mode: 'hourly', ...slot(dayOffset, 2, 2), guest: guest(n) });

  const checkout = (bookingId: string) =>
    request(http).post(`/public/bookings/${bookingId}/checkout`).set('Host', HOST);

  async function paymentOf(bookingId: string): Promise<{ gatewayTxnId: string; amount: bigint }> {
    const p = await db.admin.payment.findFirstOrThrow({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
    return { gatewayTxnId: p.gatewayTxnId!, amount: p.amount };
  }

  function mockWebhook(gatewayTxnId: string, amount: bigint, event: 'succeeded' | 'failed' = 'succeeded') {
    return { gatewayTxnId, event, amountVnd: amount.toString(), signature: signMockWebhook(gatewayTxnId, event, amount) };
  }

  it('checkout creates a pending payment + a paymentUrl', async () => {
    const booking = await createBooking(1, 40).expect(201);
    const res = await checkout(booking.body.id).expect(201);
    expect(res.body.paymentUrl).toMatch(/^mock:\/\/pay\//);
    const p = await db.admin.payment.findFirstOrThrow({ where: { bookingId: booking.body.id } });
    expect(p.status).toBe('pending');
    expect(p.amount).toBe(300_000n); // 600k × 50% deposit
  });

  it('records exactly one payment + confirms once for 5 duplicate webhooks (DoD)', async () => {
    const booking = await createBooking(2, 41).expect(201);
    await checkout(booking.body.id).expect(201);
    const { gatewayTxnId, amount } = await paymentOf(booking.body.id);
    const body = mockWebhook(gatewayTxnId, amount);

    for (let i = 0; i < 5; i++) {
      await request(http).post('/webhooks/mock').set('Host', HOST).send(body).expect(200);
    }

    const succeeded = await db.admin.payment.count({ where: { bookingId: booking.body.id, status: 'succeeded' } });
    expect(succeeded).toBe(1);
    const b = await db.admin.booking.findFirstOrThrow({ where: { id: booking.body.id } });
    expect(b.status).toBe('confirmed');
    expect(b.paidAmount).toBe(300_000n);
  });

  it('rejects an underpayment webhook and leaves the payment pending', async () => {
    const booking = await createBooking(3, 42).expect(201);
    await checkout(booking.body.id).expect(201);
    const { gatewayTxnId, amount } = await paymentOf(booking.body.id);
    await request(http)
      .post('/webhooks/mock')
      .set('Host', HOST)
      .send(mockWebhook(gatewayTxnId, amount - 1n))
      .expect(400);
    const p = await db.admin.payment.findFirstOrThrow({ where: { bookingId: booking.body.id } });
    expect(p.status).toBe('pending');
  });

  it('executes a refund via the gateway API (mock)', async () => {
    const booking = await createBooking(4, 43).expect(201);
    await checkout(booking.body.id).expect(201);
    const { gatewayTxnId, amount } = await paymentOf(booking.body.id);
    await request(http).post('/webhooks/mock').set('Host', HOST).send(mockWebhook(gatewayTxnId, amount)).expect(200);

    await app.get(ExecuteRefundUseCase).handle(tenantId, booking.body.id, 200_000n);
    const refund = await db.admin.refund.findFirstOrThrow({ where: { bookingId: booking.body.id } });
    expect(refund.status).toBe('succeeded');
    expect(refund.amount).toBe(200_000n);
  });

  it('falls back to manual_required when the gateway has no refund API', async () => {
    const ownerCookies = await login(http, 'owner@studiohub.vn');
    await request(http)
      .put('/tenant/gateway-config')
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ gateway: 'payos', environment: 'sandbox', credentials: { clientId: 'c', apiKey: 'k', checksumKey: 's' } })
      .expect(200);

    const booking = await createBooking(5, 44).expect(201);
    // Give the booking a succeeded payment directly (avoid a real payos network call);
    // the refund routes via the tenant's active gateway (payos → no refund API).
    await db.admin.payment.create({
      data: { tenantId, bookingId: booking.body.id, gateway: 'mock', kind: 'deposit', amount: 300_000n, status: 'succeeded', gatewayTxnId: `mock_manual_${booking.body.id}`, idempotencyKey: `manual:${booking.body.id}`, paidAt: new Date() },
    });

    await app.get(ExecuteRefundUseCase).handle(tenantId, booking.body.id, 150_000n);
    const refund = await db.admin.refund.findFirstOrThrow({ where: { bookingId: booking.body.id } });
    expect(refund.status).toBe('manual_required');
  });

  it('reconciles a stuck pending payment by polling the gateway', async () => {
    // Reset to mock gateway for reconciliation (queryPaymentStatus → succeeded).
    await db.admin.tenantGatewayConfig.updateMany({ where: { tenantId }, data: { isActive: false } });
    const booking = await createBooking(6, 45).expect(201);
    await checkout(booking.body.id).expect(201); // pending, no webhook

    const reconciled = await app.get(ReconciliationWorker).sweep();
    expect(reconciled).toBeGreaterThanOrEqual(1);
    const b = await db.admin.booking.findFirstOrThrow({ where: { id: booking.body.id } });
    expect(b.status).toBe('confirmed');
  });
});
