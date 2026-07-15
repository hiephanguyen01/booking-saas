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
import { BookingSchedulerWorker } from '../src/modules/booking/infrastructure/booking-scheduler.worker';
import { RecordJournalService } from '../src/modules/finance/application/record-journal.service';

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

const guest = (n: number) => ({ fullName: `Fin${n}`, email: `fin${n}@example.com`, phone: '0900000022' });

interface LedgerEntry {
  journalId: string;
  debit: bigint;
  credit: bigint;
  entryType: string;
  account: { ownerType: string; ownerId: string | null };
}

describe('finance — ledger, commissions, payouts (§13)', () => {
  let db: TestDb;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let tenantId: string;
  let partnerId: string;
  let fullListingId: string;
  let depositListingId: string;
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
    process.env.BOOKING_SCHEDULER_DISABLED = 'true';
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
    partnerId = (await db.admin.partner.findFirstOrThrow({ where: { slug: 'giang-studio' } })).id;
    const studioTypeId = (await db.admin.listingType.findFirstOrThrow({ where: { tenantId, slug: 'studio' } })).id;
    ownerCookies = await login(http, 'owner@studiohub.vn');
    const tenant = (m: 'post', url: string) => request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

    const resource = await tenant('post', '/tenant/resources').send({ partnerId, name: 'Finance cal' }).expect(201);
    const mkListing = async (slugSuffix: string, depositPercent: number): Promise<string> => {
      const r = await tenant('post', '/tenant/listings')
        .send({
          partnerId,
          listingTypeId: studioTypeId,
          resourceId: resource.body.id,
          title: `Finance Studio ${slugSuffix}`,
          slug: `finance-studio-${slugSuffix}`,
          provinceCode: '79',
          wardCode: '26740',
          address: '12 Nguyễn Huệ',
          attributes: { area: 30, style: 'Vintage', naturalLight: true },
          bookingModes: ['hourly'],
          modeConfig: { hourly: { basePrice: '300000', minDuration: 1, maxDuration: 8, granularity: 60, leadTimeMin: 0 } },
          depositPercent,
        })
        .expect(201);
      await db.admin.listing.update({ where: { id: r.body.id }, data: { status: 'published' } });
      return r.body.id;
    };
    fullListingId = await mkListing('full', 100);
    depositListingId = await mkListing('deposit', 50);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await db?.stop();
    await redis?.stop();
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const createBooking = (listingId: string, n: number, dayOffset: number) =>
    request(http)
      .post('/public/bookings')
      .set('Host', HOST)
      .send({ listingId, mode: 'hourly', ...slot(dayOffset, 2, 2), guest: guest(n) });

  const mockPay = (code: string) => request(http).post(`/public/bookings/${code}/mock-pay`).set('Host', HOST).expect(200);
  const drain = () => app.get(OutboxRelayWorker).drainDueEvents();

  /** Move the slot into the past + run the scheduler so the booking auto-completes. */
  async function complete(bookingId: string, hoursAgo: number): Promise<void> {
    await db.admin.$executeRaw(Prisma.sql`
      UPDATE bookings SET timeslot = tstzrange(now() - make_interval(hours => ${hoursAgo + 1}::int), now() - make_interval(hours => ${hoursAgo}::int))
      WHERE id = ${bookingId}::uuid`);
    await app.get(BookingSchedulerWorker).sweep();
    await drain();
  }

  const entriesFor = (bookingId: string): Promise<LedgerEntry[]> =>
    db.admin.ledgerEntry.findMany({ where: { bookingId }, include: { account: true } }) as unknown as Promise<LedgerEntry[]>;

  function assertJournalsBalanced(entries: LedgerEntry[]): void {
    const byJournal = new Map<string, { d: bigint; c: bigint }>();
    for (const e of entries) {
      const j = byJournal.get(e.journalId) ?? { d: 0n, c: 0n };
      j.d += e.debit;
      j.c += e.credit;
      byJournal.set(e.journalId, j);
    }
    expect(byJournal.size).toBeGreaterThan(0);
    for (const [, { d, c }] of byJournal) expect(d).toBe(c);
  }

  const net = (entries: LedgerEntry[], ownerType: string, ownerId: string | null): bigint =>
    entries
      .filter((e) => e.account.ownerType === ownerType && e.account.ownerId === ownerId)
      .reduce((acc, e) => acc + e.credit - e.debit, 0n);

  async function totalLedgerImbalance(): Promise<bigint> {
    const rows = await db.admin.$queryRaw<{ imbalance: bigint }[]>(Prisma.sql`
      SELECT COALESCE(SUM(debit), 0)::bigint - COALESCE(SUM(credit), 0)::bigint AS imbalance FROM ledger_entries`);
    return rows[0]?.imbalance ?? 0n;
  }

  // ── tests ────────────────────────────────────────────────────────────────

  it('DoD: a full-payment completion writes a balanced commission journal (§13.2)', async () => {
    const res = await createBooking(fullListingId, 1, 40).expect(201);
    await mockPay(res.body.code);
    await drain(); // booking.confirmed
    await complete(res.body.id, 48);

    const entries = await entriesFor(res.body.id);
    assertJournalsBalanced(entries);
    // subtotal 600k · 15% tenant · 2% platform · no affiliate.
    expect(net(entries, 'partner', partnerId)).toBe(510_000n); // 600k − 15%
    expect(net(entries, 'platform', null)).toBe(12_000n); // 2% × 600k
    expect(net(entries, 'tenant', tenantId)).toBe(78_000n); // tenant net revenue
    expect(net(entries, 'tenant', null)).toBe(-600_000n); // cash float
    expect(await totalLedgerImbalance()).toBe(0n);
  });

  it('DoD: a deposit booking splits partner cash collected on-site', async () => {
    const res = await createBooking(depositListingId, 2, 41).expect(201);
    await mockPay(res.body.code); // paidAmount = 50% deposit = 300k
    await drain();
    await complete(res.body.id, 48);

    const entries = await entriesFor(res.body.id);
    assertJournalsBalanced(entries);
    // partner share 510k, but the partner already collected 300k on-site → payable 210k.
    expect(net(entries, 'partner', partnerId)).toBe(210_000n);
    expect(net(entries, 'tenant', null)).toBe(-300_000n); // only the deposit hit the gateway
    expect(net(entries, 'tenant', tenantId)).toBe(78_000n);
    expect(await totalLedgerImbalance()).toBe(0n);
  });

  it('DoD: a no-show journals the forfeited paid amount (§8.5)', async () => {
    const res = await createBooking(fullListingId, 3, 42).expect(201);
    await mockPay(res.body.code); // paidAmount = 600k
    await drain();

    // The finance handler's revenue journal (booking.no_show is emitted by the
    // partner/tenant no-show action, tested in the booking module).
    await app.get(RecordJournalService).recordNoShow(tenantId, res.body.id);

    const entries = await entriesFor(res.body.id);
    assertJournalsBalanced(entries);
    expect(net(entries, 'partner', partnerId)).toBe(510_000n); // split on 600k paid
    expect(net(entries, 'tenant', tenantId)).toBe(78_000n);
    expect(await totalLedgerImbalance()).toBe(0n);
  });

  it('DoD: a cancellation with a retained portion journals a balanced cancellation fee', async () => {
    const res = await createBooking(fullListingId, 4, 43).expect(201);
    await mockPay(res.body.code); // paidAmount = 600k
    await drain();

    // 200k refunded → 400k retained (booking.cancelled carries the refund amount).
    await app.get(RecordJournalService).recordCancellationFee(tenantId, res.body.id, 200_000n);

    const entries = await entriesFor(res.body.id);
    const feeEntries = entries.filter((e) => e.entryType === 'cancellation_fee');
    assertJournalsBalanced(feeEntries);
    expect(net(feeEntries, 'tenant', tenantId)).toBe(400_000n); // retained fee is tenant revenue
    expect(await totalLedgerImbalance()).toBe(0n);
  });

  it('DoD: commission snapshot immutability — a rule change never touches a past booking', async () => {
    const res = await createBooking(fullListingId, 5, 44).expect(201);
    await mockPay(res.body.code);
    await drain();

    // Change the tenant default AFTER the booking was created (snapshot already frozen at 15%).
    await db.admin.commissionRule.updateMany({
      where: { tenantId, appliesTo: 'tenant_default' },
      data: { tenantRate: 30n },
    });

    await complete(res.body.id, 48);
    const entries = await entriesFor(res.body.id);
    assertJournalsBalanced(entries);
    // Still 15% (510k), NOT 30% (420k) — the frozen snapshot won.
    expect(net(entries, 'partner', partnerId)).toBe(510_000n);
    expect(await totalLedgerImbalance()).toBe(0n);
  });

  it('creates + marks a partner payout paid, reconciling the partner balance', async () => {
    const tenant = (m: 'post' | 'get', url: string) => request(http)[m](url).set('Cookie', ownerCookies).set('x-tenant-id', tenantId);

    // Partner has accumulated payable from the completed bookings above. Drop the
    // holding period to 0 so all matured payable is immediately payable (§7.7).
    const current = await db.admin.tenant.findFirstOrThrow({ where: { id: tenantId } });
    await db.admin.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...(current.settings as object), payout: { holdingDays: 0 } } },
    });

    const before = await tenant('get', `/tenant/finance/partners/${partnerId}`).expect(200);
    const owedBefore = BigInt(before.body.balance);
    expect(owedBefore).toBeGreaterThan(0n);

    const payout = await tenant('post', '/tenant/finance/payouts')
      .send({ payeeType: 'partner', payeeId: partnerId })
      .expect(201);
    expect(payout.body.status).toBe('pending');
    expect(BigInt(payout.body.amount)).toBe(owedBefore);

    const paid = await request(http)
      .post(`/tenant/finance/payouts/${payout.body.id}/mark-paid`)
      .set('Cookie', ownerCookies)
      .set('x-tenant-id', tenantId)
      .send({ reference: 'VCB-TRANSFER-001' })
      .expect(201);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.reference).toBe('VCB-TRANSFER-001');

    // The payout journal (Debit partner payable / Credit tenant cash) zeroes the balance.
    const after = await tenant('get', `/tenant/finance/partners/${partnerId}`).expect(200);
    expect(BigInt(after.body.balance)).toBe(0n);
    expect(await totalLedgerImbalance()).toBe(0n);
  });

  it('records a clawback that reverses a completed booking journal (§13.1)', async () => {
    const res = await createBooking(fullListingId, 6, 45).expect(201);
    await mockPay(res.body.code);
    await drain();
    await complete(res.body.id, 48);

    await app.get(RecordJournalService).recordClawback(tenantId, res.body.id);

    const entries = await entriesFor(res.body.id);
    expect(entries.some((e) => e.entryType === 'clawback')).toBe(true);
    // Original + clawback net to zero on every account touched by the booking.
    expect(net(entries, 'partner', partnerId)).toBe(0n);
    expect(net(entries, 'platform', null)).toBe(0n);
    expect(net(entries, 'tenant', tenantId)).toBe(0n);
    expect(await totalLedgerImbalance()).toBe(0n);
  });

  it('rejects an unauthenticated finance request', async () => {
    await request(http).get('/tenant/finance/summary').set('x-tenant-id', tenantId).expect(401);
  });
});
