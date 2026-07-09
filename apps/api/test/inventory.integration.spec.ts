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

/** A whole-day future rental window, `dayOffset` days out. */
function daySlot(dayOffset: number): { from: string; to: string; date: string } {
  const d = new Date(Date.now() + dayOffset * 86_400_000);
  d.setUTCHours(0, 0, 0, 0);
  return {
    from: d.toISOString(),
    to: new Date(d.getTime() + 86_400_000).toISOString(),
    date: d.toISOString().slice(0, 10),
  };
}

const guest = (n: number) => ({ fullName: `G${n}`, email: `inv${n}@example.com`, phone: '0900000009' });

describe('inventory mode (quantity + deposit)', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let partnerId: string;
  let listingId: string;
  let partnerCookies: string[];

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

    execFileSync('pnpm', ['exec', 'ts-node', '--transpile-only', 'prisma/seed.ts'], { cwd: API_DIR, env: process.env, stdio: 'pipe' });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    http = app.getHttpServer();

    tenantId = (await db.admin.tenant.findFirstOrThrow({ where: { slug: 'studiohub' } })).id;
    partnerId = (await db.admin.partner.findFirstOrThrow({ where: { slug: 'giang-studio' } })).id;
    partnerCookies = await login(http, 'giang@giangstudio.vn');
    const ownerCookies = await login(http, 'owner@studiohub.vn');
    const tenant = (m: 'post', url: string) => request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

    // A fresh inventory listing type (no required attributes) + listing with stock 3.
    const type = await tenant('post', '/tenant/listing-types')
      .send({ name: 'Gear', slug: 'gear', allowedModes: ['inventory'], attributeSchema: [] })
      .expect(201);
    const resource = await tenant('post', '/tenant/resources').send({ partnerId, name: 'Gear shelf' }).expect(201);
    const listing = await tenant('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: type.body.id,
        resourceId: resource.body.id,
        title: 'Sony FX3',
        slug: 'test-fx3',
        attributes: {},
        bookingModes: ['inventory'],
        modeConfig: { inventory: { unit: 'day', basePrice: '100000', securityDeposit: '500000', lateFeePerUnit: '50000' } },
        stockQuantity: 3,
        depositPercent: 100,
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

  const book = (body: object) => request(http).post('/public/bookings').set('Host', HOST).send(body);

  it('books units with a security deposit and reports remaining stock', async () => {
    const s = daySlot(40);
    const created = await book({ listingId, mode: 'inventory', from: s.from, to: s.to, quantity: 2, guest: guest(1) }).expect(201);
    expect(created.body.quantity).toBe(2);
    expect(created.body.securityDeposit).toBe('1000000'); // 500k × 2
    expect(created.body.totalAmount).toBe('200000'); // 100k × 1 day × 2

    const avail = await request(http)
      .get('/public/listings/test-fx3/availability')
      .set('Host', HOST)
      .query({ mode: 'inventory', from: s.date, to: s.date })
      .expect(200);
    expect(avail.body.mode).toBe('inventory');
    expect(avail.body.inventory).toEqual({ stock: 3, remaining: 1 });
  });

  it('never oversells the last units under concurrency (DoD)', async () => {
    const s = daySlot(41); // fresh window → 3 available
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        book({ listingId, mode: 'inventory', from: s.from, to: s.to, quantity: 1, guest: guest(200 + i) }).then((r) => r.status),
      ),
    );
    expect(results.filter((c) => c === 201)).toHaveLength(3);
    expect(results.filter((c) => c === 409)).toHaveLength(2);

    const used = await db.admin.$queryRawUnsafe<{ sum: bigint | null }[]>(
      `SELECT SUM(quantity) AS sum FROM bookings WHERE listing_id = '${listingId}' AND booking_mode='inventory'
       AND status IN ('pending_payment','confirmed') AND lower(timeslot) = '${s.from}'`,
    );
    expect(Number(used[0]?.sum ?? 0)).toBeLessThanOrEqual(3);
  });

  it('charges a late fee and settles the deposit on a late return', async () => {
    const s = daySlot(42);
    const created = await book({ listingId, mode: 'inventory', from: s.from, to: s.to, quantity: 1, guest: guest(3) }).expect(201);
    await request(http).post(`/public/bookings/${created.body.code}/mock-pay`).set('Host', HOST).expect(200);

    // Shift the rental into the past so the return is late — end 47h ago →
    // ceil(47h / 24h) = 2 overdue days (unambiguous, epsilon-safe).
    await db.admin.$executeRawUnsafe(
      `UPDATE bookings SET timeslot = tstzrange(now() - interval '4 days', now() - interval '47 hours', '[)'),
       blocked_period = tstzrange(now() - interval '4 days', now() - interval '47 hours', '[)') WHERE id = '${created.body.id}'`,
    );

    const returned = await request(http)
      .post(`/partner/bookings/${created.body.id}/return`)
      .set('Cookie', partnerCookies)
      .set('x-tenant-id', tenantId)
      .set('x-partner-id', partnerId)
      .send({ damageAmount: '0' })
      .expect(200);
    expect(returned.body.status).toBe('completed');
    expect(returned.body.lateFee).toBe('100000'); // 50k × 2 days × 1
    expect(returned.body.depositRefund).toBe('400000'); // 500k − 100k late fee
    expect(returned.body.returnedAt).toBeTruthy();
  });
});
