import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, type TestDb } from './helpers/test-db';
import { OutboxRelayWorker } from '../src/shared/outbox/outbox-relay.worker';
import { ReminderWorker } from '../src/modules/notification/infrastructure/reminder.worker';

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

const guest = (n: number) => ({ fullName: `Notify${n}`, email: `notify${n}@example.com`, phone: '0900000033' });

describe('notifications — email per event, idempotent (§17)', () => {
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
    process.env.OUTBOX_RELAY_DISABLED = 'true'; // drive relay + reminder by hand
    process.env.SEED_DEMO = 'true';
    process.env.PLATFORM_BASE_DOMAIN = 'bookify.vn';
    process.env.ALLOW_MOCK_PAYMENTS = 'true';
    delete process.env.SMTP_HOST; // log-only sender → still records `sent` rows

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

    const resource = await tenant('post', '/tenant/resources').send({ partnerId, name: 'Notify cal' }).expect(201);
    const listing = await tenant('post', '/tenant/listings')
      .send({
        partnerId,
        listingTypeId: studioTypeId,
        resourceId: resource.body.id,
        title: 'Notify Studio',
        slug: 'notify-studio',
        attributes: { area: 30, style: 'Vintage', naturalLight: true },
        bookingModes: ['hourly'],
        modeConfig: { hourly: { basePrice: '300000', minDuration: 1, maxDuration: 8, granularity: 60, leadTimeMin: 0 } },
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

  // ── helpers ────────────────────────────────────────────────────────────────
  const createBooking = (n: number, dayOffset: number) =>
    request(http)
      .post('/public/bookings')
      .set('Host', HOST)
      .send({ listingId, mode: 'hourly', ...slot(dayOffset, 3, 2), guest: guest(n) });

  const drain = () => app.get(OutboxRelayWorker).drainDueEvents();

  const sentLogs = (eventType: string, bookingId: string) =>
    db.admin.notificationLog.findMany({
      where: { eventType, status: 'sent', payload: { path: ['bookingId'], equals: bookingId } },
    });

  // ── tests ────────────────────────────────────────────────────────────────

  it('DoD: booking.created sends exactly one customer email', async () => {
    const res = await createBooking(1, 30).expect(201);
    await drain();

    const logs = await sentLogs('booking.created', res.body.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.recipient).toBe(guest(1).email);
    expect(logs[0]?.channel).toBe('email');
  });

  it('DoD: booking.confirmed emails both the customer and the partner', async () => {
    const res = await createBooking(2, 31).expect(201);
    await drain(); // booking.created
    await request(http).post(`/public/bookings/${res.body.code}/mock-pay`).set('Host', HOST).expect(200);
    await drain(); // booking.confirmed

    const logs = await sentLogs('booking.confirmed', res.body.id);
    const recipients = logs.map((l) => l.recipient).sort();
    expect(recipients).toEqual([guest(2).email, 'giang@giangstudio.vn'].sort());
  });

  it('DoD: redelivering the same outbox event does not resend (idempotent)', async () => {
    const res = await createBooking(3, 32).expect(201);
    await drain();
    const before = await sentLogs('booking.created', res.body.id);
    expect(before).toHaveLength(1);

    // Re-arm the outbox event and drain again → the dedupe guard blocks a second email.
    await db.admin.$executeRaw(Prisma.sql`
      UPDATE outbox_events SET processed_at = NULL, available_at = now()
      WHERE event_type = 'booking.created' AND payload->>'bookingId' = ${res.body.id}`);
    await drain();

    const after = await sentLogs('booking.created', res.body.id);
    expect(after).toHaveLength(1); // still exactly one
  });

  it('DoD: booking.cancelled notifies customer + partner with the refund', async () => {
    const res = await createBooking(4, 33).expect(201);
    await drain();
    await request(http).post(`/public/bookings/${res.body.code}/mock-pay`).set('Host', HOST).expect(200);
    await drain(); // confirmed

    await db.admin.$executeRaw(Prisma.sql`
      INSERT INTO outbox_events (id, tenant_id, event_type, payload)
      VALUES (gen_random_uuid(), ${tenantId}::uuid, 'booking.cancelled',
              ${JSON.stringify({ bookingId: res.body.id, code: res.body.code, refundAmount: '600000', refundPercent: 100 })}::jsonb)`);
    await drain();

    const logs = await sentLogs('booking.cancelled', res.body.id);
    expect(logs).toHaveLength(2);
  });

  it('sends a T−24h reminder once, idempotent across poll ticks', async () => {
    const res = await createBooking(5, 40).expect(201);
    await drain();
    await request(http).post(`/public/bookings/${res.body.code}/mock-pay`).set('Host', HOST).expect(200);
    await drain(); // confirmed

    // Move the slot to ~23.5h out so it lands in the reminder band [23h, 24h).
    await db.admin.$executeRaw(Prisma.sql`
      UPDATE bookings SET timeslot = tstzrange(now() + interval '23 hours 30 minutes', now() + interval '25 hours 30 minutes')
      WHERE id = ${res.body.id}::uuid`);

    expect(await app.get(ReminderWorker).sweep()).toBeGreaterThanOrEqual(1);
    const first = await sentLogs('booking.reminder', res.body.id);
    expect(first).toHaveLength(1);
    expect(first[0]?.recipient).toBe(guest(5).email);

    await app.get(ReminderWorker).sweep(); // second tick
    const second = await sentLogs('booking.reminder', res.body.id);
    expect(second).toHaveLength(1); // no resend
  });
});
