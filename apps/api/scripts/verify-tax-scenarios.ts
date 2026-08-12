/**
 * End-to-end money-lifecycle scenario driver.
 *
 * Replaces the integration tests the no-tests policy forbids (ADR 0005) — the
 * companion to `audit-tax-lifecycle.ts`: that one asserts invariants over whatever
 * is in the database, this one CREATES the situations worth asserting by driving
 * the real HTTP API, so every state change goes through the real controllers,
 * use-cases, outbox relay and settlement worker.
 *
 * It proves the load-bearing claim of the tax refactor:
 *
 *   payment.succeeded → NO tax        (money received is not revenue)
 *   booking.completed → tax assessed  (BEFORE any release or payout)
 *   refund            → linked reversal, original assessment untouched
 *
 * Prerequisites — a dev stack with a FRESH seed:
 *   docker compose up -d
 *   pnpm --filter=@booking/api prisma:deploy && pnpm --filter=@booking/api seed
 *   PORT=3999 pnpm --filter=@booking/api start     # relay must be ENABLED
 *   pnpm --filter=@booking/api verify:tax -- --base http://localhost:3999
 *
 * Exits 1 on the first failed assertion.
 */
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const BASE = argValue('--base') ?? 'http://localhost:3999';
const TENANT_HOST = argValue('--host') ?? 'bookingstudio.localhost';
const CUSTOMER = { email: 'customer@bookingstudio.vn', password: 'demo-password' };
const TENANT_OWNER = { email: 'owner@bookingstudio.vn', password: 'demo-password' };
const PARTNER_PASSWORD = argValue('--partner-password') ?? 'demo-password';
/** Only a household/individual seller is withheld from (NĐ 117). */
const WITHHELD_TAX_STATUS = 'household_declaring';
const MOCK_SECRET = process.env.MOCK_WEBHOOK_SECRET ?? 'mock-webhook-secret';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL } },
});

let failures = 0;
let scenario = '';

function check(claim: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`    ✓ ${claim}`);
    return;
  }
  failures++;
  console.error(`    ✗ ${claim}${detail ? ` — ${detail}` : ''}`);
}

function step(message: string): void {
  console.log(`  → ${message}`);
}

function heading(title: string): void {
  scenario = title;
  console.log(`\n━━ ${title}`);
}

const vnd = (amount: bigint) => amount.toLocaleString('vi-VN');

// ── HTTP ────────────────────────────────────────────────────────────────────

interface Session {
  cookie: string;
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  options: {
    body?: unknown;
    session?: Session;
    headers?: Record<string, string>;
    host?: string;
    raw?: string;
  } = {},
): Promise<T> {
  // `fetch` forbids setting `host`; the API's `hostOf()` reads x-forwarded-host
  // first precisely so a proxy (or this driver) can name the tenant host.
  const headers: Record<string, string> = {
    'x-forwarded-host': options.host ?? TENANT_HOST,
    'content-type': 'application/json',
    ...options.headers,
  };
  if (options.session) headers.cookie = options.session.cookie;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

async function login(credentials: { email: string; password: string }): Promise<Session> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'x-forwarded-host': TENANT_HOST, 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`login ${credentials.email} → ${response.status} ${text}`);
  const cookies = response.headers.getSetCookie();
  const cookie = cookies.map((entry) => entry.split(';')[0]).join('; ');
  if (!cookie.includes('sid=')) throw new Error(`login ${credentials.email}: no sid cookie`);
  return { cookie };
}

/** Poll a condition against the DB until the outbox relay has caught up. */
async function until<T>(
  label: string,
  probe: () => Promise<T | null>,
  timeoutMs = 40_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null && value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

// ── Fixture selection (reads only; every mutation goes through the API) ──────

interface Listing {
  id: string;
  mode: string;
  depositPercent: number;
}

interface Fixture {
  tenantId: string;
  partnerId: string;
  partnerEmail: string;
  /** A part-paid listing: online deposit + the balance collected on site. */
  partial: Listing;
  /** A fully-prepaid listing, so a refund CAN reverse the whole assessment. */
  full: Listing;
}

async function pickFixture(): Promise<Fixture> {
  const domain = await prisma.tenantDomain.findFirst({
    where: { hostname: TENANT_HOST },
    select: { tenantId: true },
  });
  if (!domain) throw new Error(`no tenant registered for host ${TENANT_HOST}`);

  // Pick a partner that actually has bookable inventory. Its tax status is then
  // set through the tenant API below — a company seller is never withheld from,
  // so the scenario would be vacuous on one, and the seeded households own no
  // listings. Setting it via the real endpoint is also what an operator does.
  const partner = await prisma.partner.findFirst({
    where: {
      tenantId: domain.tenantId,
      isHouse: false,
      status: 'approved',
      listings: { some: { status: 'published' } },
    },
    select: { id: true, taxStatus: true, name: true },
  });
  if (!partner) throw new Error('no approved non-house partner with published listings');

  // Whoever actually holds the partner-scoped role assignment — the seeded owner
  // email differs per partner, and only a household seller is withheld from.
  const assignment = await prisma.roleAssignment.findFirst({
    where: { partnerId: partner.id },
    select: { user: { select: { email: true } } },
  });
  if (!assignment) throw new Error(`no user is assigned to partner ${partner.name}`);

  const findListing = (fullyPrepaid: boolean, excludeId?: string) =>
    prisma.listing.findFirst({
      where: {
        tenantId: domain.tenantId,
        partnerId: partner.id,
        status: 'published',
        depositPercent: fullyPrepaid ? 100 : { lt: 100 },
        listingType: { bookingSelection: 'flexible_duration' },
        id: excludeId ? { not: excludeId } : undefined,
      },
      select: {
        id: true,
        title: true,
        depositPercent: true,
        bookingModes: true,
        listingType: { select: { allowedModes: true } },
      },
    });

  const describe = (
    label: string,
    row: { id: string; title: string; depositPercent: number; bookingModes: string[]; listingType: { allowedModes: string[] } },
  ): Listing => {
    const mode = row.bookingModes?.[0] ?? row.listingType.allowedModes?.[0] ?? 'hourly';
    console.log(`  ${label}: "${row.title}" (deposit ${row.depositPercent}%, mode ${mode})`);
    return { id: row.id, mode, depositPercent: row.depositPercent };
  };

  const partialRow = await findListing(false);
  if (!partialRow) throw new Error(`no part-paid published listing for ${partner.name}`);
  const partial = describe('partial-deposit listing', partialRow);

  /**
   * FIXTURE SETUP, not a business step: the seed ships no fully-prepaid listing
   * for a non-house partner (only house inventory is 100%), and a FULL reversal is
   * unreachable on a part-paid booking — `refunded_amount` is capped at the deposit
   * the platform actually holds, so the most a refund can reverse is
   * `deposit / transaction`. Promoting one spare listing to 100% is a plain
   * configuration value, set directly rather than pushed through the
   * listing-revision approval flow, which is not what this script is testing.
   */
  let fullRow = await findListing(true, partial.id);
  if (!fullRow) {
    const spare = await findListing(false, partial.id);
    if (!spare) throw new Error(`no spare listing to promote for ${partner.name}`);
    console.log(`  (fixture setup: promoting "${spare.title}" to depositPercent 100)`);
    await prisma.listing.update({ where: { id: spare.id }, data: { depositPercent: 100 } });
    fullRow = { ...spare, depositPercent: 100 };
  }

  console.log(
    `fixture: partner "${partner.name}" (${partner.taxStatus}) as ${assignment.user.email}`,
  );
  return {
    tenantId: domain.tenantId,
    partnerId: partner.id,
    partnerEmail: assignment.user.email,
    partial,
    full: describe('fully-prepaid listing', fullRow),
  };
}

/**
 * Every run must claim slots no previous run touched: the `tstzrange` GiST
 * exclusion constraint is real, so re-running would otherwise fail SLOT_TAKEN on
 * the bookings the last run left behind. Random rather than clock-derived because
 * two runs inside the same minute would otherwise pick the identical band.
 */
const RUN_NONCE = 1 + Math.floor(Math.random() * 900);

/** A slot far enough out that no seeded booking or blackout collides. */
function futureSlot(index: number): { from: string; to: string } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 30 + RUN_NONCE + index * 3);
  start.setUTCHours(3, 0, 0, 0); // 10:00 Vietnam time
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Matching past band, so time travel cannot collide with an earlier run either. */
function pastDayOffset(index: number): number {
  return 2 + RUN_NONCE + index * 3;
}

// ── Lifecycle drivers ───────────────────────────────────────────────────────

interface BookingHandle {
  id: string;
  code: string;
  totalAmount: bigint;
}

async function createAndPayBooking(
  listing: Listing,
  customer: Session,
  index: number,
): Promise<BookingHandle> {
  step('POST /public/bookings');
  // A leftover booking from an earlier run can still hold the band this run drew;
  // walk forward rather than making the whole verification a coin flip.
  let booking: { id: string; code: string; totalAmount: string; status: string } | undefined;
  for (let attempt = 0; attempt < 12 && !booking; attempt++) {
    const slot = futureSlot(index + attempt * 7);
    try {
      booking = await request('POST', '/public/bookings', {
        session: customer,
        body: { listingId: listing.id, mode: listing.mode, ...slot, quantity: 1, guestCount: 1 },
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('SLOT_TAKEN')) throw error;
    }
  }
  if (!booking) throw new Error('could not find a free slot after 12 attempts');

  step(`POST /public/bookings/${booking.code}/checkout`);
  await request('POST', `/public/bookings/${booking.id}/checkout`, {
    session: customer,
    headers: { 'x-booking-code': booking.code },
    body: { paymentMethod: 'bank_transfer' },
  });

  const payment = await until('the checkout payment row', () =>
    prisma.payment.findFirst({
      where: { bookingId: booking.id, status: 'pending' },
      select: { id: true, amount: true, gatewayTxnId: true },
      orderBy: { createdAt: 'desc' },
    }),
  );
  if (!payment.gatewayTxnId) throw new Error('mock checkout produced no gatewayTxnId');

  step(`POST /webhooks/mock (${vnd(payment.amount)} ₫)`);
  const body = JSON.stringify({
    gatewayTxnId: payment.gatewayTxnId,
    event: 'succeeded',
    amountVnd: payment.amount.toString(),
    signature: createHmac('sha256', MOCK_SECRET)
      .update(`${payment.gatewayTxnId}.succeeded.${payment.amount}`)
      .digest('hex'),
  });
  await request('POST', '/webhooks/mock', { raw: body });

  // `payment.succeeded` fans out to BOTH the booking module (confirm) and finance
  // (custody). Waiting only for the settlement would let the driver time-travel
  // the slot before confirmation has run, and confirmation then refuses a past
  // slot — so wait for the booking itself to be confirmed.
  await until('the booking to be confirmed', async () => {
    const row = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { status: true },
    });
    return row?.status === 'confirmed' ? row : null;
  });

  return { id: booking.id, code: booking.code, totalAmount: BigInt(booking.totalAmount) };
}

/**
 * Move a booking's slot into the past so the partner can complete it.
 *
 * This is CLOCK manipulation, not a business mutation: `MarkCompletedUseCase`
 * refuses a service whose scheduled end has not passed, and a driver cannot wait
 * two hours. Every money-moving step still goes through the real API. `daysAgo`
 * differs per booking so the `tstzrange` GiST exclusion constraint cannot collide.
 */
async function timeTravelPastEnd(bookingId: string, daysAgo: number): Promise<void> {
  step(`time travel: moving the slot ${daysAgo} day(s) into the past`);
  await prisma.$executeRaw`
    UPDATE bookings
    SET timeslot = tstzrange(
          now() - make_interval(days => ${daysAgo}::int, hours => 2),
          now() - make_interval(days => ${daysAgo}::int),
          '[)')
    WHERE id = ${bookingId}::uuid AND timeslot IS NOT NULL`;
}

function settlementOf(bookingId: string) {
  return prisma.bookingSettlement.findUnique({ where: { bookingId } });
}

function taxEventsOf(settlementId: string) {
  return prisma.taxWithholdingEvent.findMany({
    where: { settlementId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Expire the dispute window so `SettlementReleaseWorker.findDue` picks the
 * settlement up. Clock manipulation again — the real holding period is days.
 */
async function expireDisputeWindow(settlementId: string): Promise<void> {
  step('time travel: expiring the dispute window');
  await prisma.$executeRaw`
    UPDATE booking_settlements
    SET dispute_until = now() - interval '1 minute'
    WHERE id = ${settlementId}::uuid AND status = 'dispute_window'::settlement_status`;
}

/**
 * Ask for a refund and confirm the manual transfer.
 *
 * `reason` matters twice over: `ExecuteRefundUseCase` is idempotent per
 * (booking, reason), so the SAME reason can never produce a second refund; and
 * the finance handler only treats `dispute_refund` as incremental. Returns null
 * when no refund row appeared, which is a legitimate outcome to assert.
 */
async function refundAndConfirm(
  context: { tenantId: string; owner: Session; bookingId: string; label: string },
  amount: bigint,
  reason = 'dispute_refund',
): Promise<string | null> {
  const before = await prisma.refund.count({ where: { bookingId: context.bookingId } });
  step(`${context.label}: requesting a ${vnd(amount)} ₫ refund (${reason})`);
  await prisma.outboxEvent.create({
    data: {
      tenantId: context.tenantId,
      eventType:
        reason === 'dispute_refund' ? 'settlement.refund_requested' : 'refund.recovery_requested',
      payload: {
        bookingId: context.bookingId,
        amount: amount.toString(),
        reason,
        affectsBookingStatus: true,
      },
    },
  });

  let pending: { id: string } | null = null;
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline && !pending) {
    const count = await prisma.refund.count({ where: { bookingId: context.bookingId } });
    if (count > before) {
      pending = await prisma.refund.findFirst({
        where: { bookingId: context.bookingId, status: { in: ['pending', 'manual_required'] } },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!pending) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!pending) {
    console.log(`    (${context.label}: no new refund row — blocked by per-reason idempotency)`);
    return null;
  }

  await request('POST', `/tenant/payments/refunds/${pending.id}/confirm`, {
    session: context.owner,
    headers: { 'x-tenant-id': context.tenantId },
    // The whole id: uuid v7 is time-prefixed, so a leading slice collides between
    // two refunds created in the same millisecond band and the tenant rejects the
    // second transfer as a duplicate reference.
    body: { reference: `VERIFY-${RUN_NONCE}-${pending.id}` },
  });
  await until(`${context.label}: the refund to succeed`, async () => {
    const row = await prisma.refund.findUnique({ where: { id: pending.id } });
    return row?.status === 'succeeded' ? row : null;
  });
  return pending.id;
}

function reversalTotals(events: { eventType: string; vatAmount: bigint; pitAmount: bigint }[]) {
  const reversals = events.filter((event) => event.eventType === 'reversal');
  return {
    count: reversals.length,
    vat: reversals.reduce((total, event) => total + event.vatAmount, 0n),
    pit: reversals.reduce((total, event) => total + event.pitAmount, 0n),
  };
}

// ── Scenarios ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`driving ${BASE} (host ${TENANT_HOST})\n`);
  const fixture = await pickFixture();
  const customer = await login(CUSTOMER);
  const partner = await login({ email: fixture.partnerEmail, password: PARTNER_PASSWORD });
  const owner = await login(TENANT_OWNER);
  const partnerHeaders = { 'x-tenant-id': fixture.tenantId, 'x-partner-id': fixture.partnerId };

  // Must precede booking creation: the resolved rate is frozen onto the
  // booking's commission snapshot, so a later status change cannot affect it.
  step(`POST /tenant/partners/${fixture.partnerId}/tax-status → ${WITHHELD_TAX_STATUS}`);
  await request('POST', `/tenant/partners/${fixture.partnerId}/tax-status`, {
    session: owner,
    headers: { 'x-tenant-id': fixture.tenantId },
    body: { taxStatus: WITHHELD_TAX_STATUS, reason: 'verify-tax-scenarios: exercise NĐ117 withholding' },
  });

  // ── Case 1 + 2: payment is not revenue, and not a taxable event ──────────
  heading('Case 1/2 — payment.succeeded must NOT assess tax');
  const first = await createAndPayBooking(fixture.partial, customer, 0);
  const held = await until('settlement held', async () => {
    const settlement = await settlementOf(first.id);
    return settlement?.status === 'held' ? settlement : null;
  });
  check('settlement reached HELD from payment.succeeded', held.status === 'held');
  check(
    'no tax event exists yet (payment ≠ taxable event)',
    (await taxEventsOf(held.id)).length === 0,
  );
  check('no revenue journal yet', (await prisma.ledgerEntry.count({
    where: { bookingId: first.id, entryType: { in: ['booking_revenue', 'partner_share'] } },
  })) === 0);
  check(
    'taxable amount is not derived from the payment amount',
    held.onlineHeldAmount <= first.totalAmount,
    `held ${vnd(held.onlineHeldAmount)} vs booking ${vnd(first.totalAmount)}`,
  );

  // ── Case 1 continued: completion assesses tax, BEFORE any release ────────
  heading('Case 1 — booking.completed assesses tax before release/payout');
  const onsite = held.onlineHeldAmount >= first.totalAmount ? 0n : first.totalAmount - held.onlineHeldAmount;
  await timeTravelPastEnd(first.id, pastDayOffset(0));
  step(`POST /partner/bookings/${first.id}/complete (onsite ${vnd(onsite)} ₫)`);
  await request('POST', `/partner/bookings/${first.id}/complete`, {
    session: partner,
    headers: partnerHeaders,
    body: { onsiteCollectedAmount: onsite.toString() },
  });

  const assessed = await until('the tax assessment', async () => {
    const events = await taxEventsOf(held.id);
    return events.find((event) => event.eventType === 'withholding') ?? null;
  });
  const afterCompletion = await until('settlement in dispute_window', async () => {
    const settlement = await settlementOf(first.id);
    return settlement?.status === 'dispute_window' ? settlement : null;
  });
  check('assessment exists while the settlement is still in its dispute window',
    afterCompletion.status === 'dispute_window');
  check('assessment exists BEFORE release', afterCompletion.releasedAt === null);
  check('assessment exists BEFORE any payout',
    (await prisma.payoutAllocation.count({ where: { settlementId: held.id } })) === 0);
  check('source key is keyed on the settlement (idempotent)',
    assessed.sourceKey === `completion:${held.id}`, assessed.sourceKey);
  check('occurred_at is the completion instant, not a release instant',
    afterCompletion.completedAt !== null &&
      assessed.occurredAt.getTime() === afterCompletion.completedAt.getTime(),
    `event ${assessed.occurredAt.toISOString()} vs completed ${afterCompletion.completedAt?.toISOString()}`);
  check('taxable revenue comes from the booking, not the online payment',
    assessed.taxableRevenue >= held.onlineHeldAmount,
    `taxable ${vnd(assessed.taxableRevenue)} vs online held ${vnd(held.onlineHeldAmount)}`);
  check('withholding journal debits the partner and credits the tax authority',
    (await prisma.ledgerEntry.count({
      where: { journalId: assessed.journalId, account: { ownerType: 'tax_authority' } },
    })) > 0);
  console.log(
    `    assessed: revenue ${vnd(assessed.taxableRevenue)} → vat ${vnd(assessed.vatAmount)} + pit ${vnd(assessed.pitAmount)}`,
  );

  // ── Case 6: duplicate booking.completed must not double-assess ───────────
  heading('Case 6 — duplicate booking.completed produces ONE assessment');
  step('re-emitting booking.completed through the outbox');
  await prisma.outboxEvent.create({
    data: {
      tenantId: fixture.tenantId,
      eventType: 'booking.completed',
      payload: { bookingId: first.id, onsiteCollectedAmount: onsite.toString() },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const afterReplay = await taxEventsOf(held.id);
  check('still exactly one withholding event',
    afterReplay.filter((event) => event.eventType === 'withholding').length === 1,
    `${afterReplay.filter((e) => e.eventType === 'withholding').length} found`);

  // ── Case 4 + 7: partial refund before release → linked reversal ──────────
  heading('Case 4/7 — partial refund before release appends a reversal');
  const refundAmount = held.onlineHeldAmount / 4n;
  if (refundAmount <= 0n) {
    console.log('    (skipped: nothing was collected online to refund)');
  } else {
    step(`emitting refund.requested for ${vnd(refundAmount)} ₫ (dispute refund path)`);
    await prisma.outboxEvent.create({
      data: {
        tenantId: fixture.tenantId,
        eventType: 'settlement.refund_requested',
        payload: {
          bookingId: first.id,
          amount: refundAmount.toString(),
          affectsBookingStatus: true,
        },
      },
    });
    // Without a configured gateway the refund lands as `manual_required`: the
    // tenant confirms the transfer out-of-band, which is what turns it into the
    // `refund.completed` fact the reversal keys off. Drive that through the API.
    const pending = await until('the refund row', () =>
      prisma.refund.findFirst({
        where: { bookingId: first.id, status: { in: ['pending', 'manual_required'] } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    step(`POST /tenant/payments/refunds/${pending.id}/confirm`);
    await request('POST', `/tenant/payments/refunds/${pending.id}/confirm`, {
      session: owner,
      headers: { 'x-tenant-id': fixture.tenantId },
      body: { reference: `VERIFY-${RUN_NONCE}` },
    });

    const reversal = await until('the tax reversal', async () => {
      const events = await taxEventsOf(held.id);
      return events.find((event) => event.eventType === 'reversal') ?? null;
    }, 60_000);

    const stillThere = await prisma.taxWithholdingEvent.findUnique({ where: { id: assessed.id } });
    check('the ORIGINAL assessment still exists, unmodified',
      stillThere !== null &&
        stillThere.vatAmount === assessed.vatAmount &&
        stillThere.pitAmount === assessed.pitAmount &&
        stillThere.taxableRevenue === assessed.taxableRevenue);
    check('the reversal is linked to the original assessment',
      reversal.originalEventId === assessed.id);
    check('the reversal never exceeds the original',
      reversal.vatAmount <= assessed.vatAmount && reversal.pitAmount <= assessed.pitAmount);
    check('final tax position = assessed − reversed',
      assessed.vatAmount - reversal.vatAmount >= 0n);
    console.log(
      `    reversed: vat -${vnd(reversal.vatAmount)} pit -${vnd(reversal.pitAmount)} → net vat ${vnd(
        assessed.vatAmount - reversal.vatAmount,
      )} pit ${vnd(assessed.pitAmount - reversal.pitAmount)}`,
    );

    step('re-emitting the SAME refund to check reversal idempotency');
    const refundRow = await prisma.refund.findFirst({
      where: { bookingId: first.id, status: 'succeeded' },
      orderBy: { createdAt: 'desc' },
    });
    if (refundRow) {
      await prisma.outboxEvent.create({
        data: {
          tenantId: fixture.tenantId,
          eventType: 'refund.completed',
          payload: {
            refundId: refundRow.id,
            paymentId: refundRow.paymentId,
            bookingId: first.id,
            amount: refundRow.amount.toString(),
            reason: refundRow.reason,
            affectsBookingStatus: true,
          },
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 8_000));
      const reversals = (await taxEventsOf(held.id)).filter((e) => e.eventType === 'reversal');
      check('duplicate refund.completed produced no second reversal for that refund',
        reversals.filter((r) => r.sourceKey === `refund:${refundRow.id}`).length === 1,
        `${reversals.length} reversal(s) total`);
    } else {
      console.log('    (no succeeded refund row yet — skipping the duplicate check)');
    }
  }

  // ── Case 8: cancellation before acceptance must never assess tax ─────────
  heading('Case 8 — cancellation before acceptance assesses no tax');
  const second = await createAndPayBooking(fixture.full, customer, 1);
  const secondHeld = await until('second settlement held', async () => {
    const settlement = await settlementOf(second.id);
    return settlement?.status === 'held' ? settlement : null;
  });
  step(`POST /public/bookings/${second.code}/cancel`);
  await request('POST', `/public/bookings/${second.code}/cancel`, {
    session: customer,
    body: { reason: 'verify-tax-scenarios: cancel before completion' },
  });
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const cancelled = await settlementOf(second.id);
  check('cancelled booking never reached completion',
    cancelled !== null && cancelled.completedAt === null,
    `completedAt=${cancelled?.completedAt?.toISOString() ?? 'null'} status=${cancelled?.status}`);
  check('cancelled-before-acceptance booking has NO tax event',
    (await taxEventsOf(secondHeld.id)).length === 0);

  // ── Case 3: FULL refund before release → reversal cancels the assessment ──
  // Needs a fully-prepaid listing: on a part-paid booking the platform only holds
  // the deposit, so `refunded_amount` is capped at it and the reversal can never
  // reach 100% of an assessment based on the whole transaction.
  heading('Case 3 — full refund before release reverses the whole assessment');
  const third = await completedBooking(fixture, fixture.full, customer, partner, partnerHeaders, 2);
  check('fully-prepaid booking was assessed on the whole transaction',
    third.assessment.taxableRevenue === third.settlement.onlineHeldAmount,
    `assessed ${vnd(third.assessment.taxableRevenue)} vs held ${vnd(third.settlement.onlineHeldAmount)}`);

  await refundAndConfirm(
    { tenantId: fixture.tenantId, owner, bookingId: third.booking.id, label: 'Case 3' },
    third.settlement.onlineHeldAmount,
  );
  const fullyReversed = await until('the full tax reversal', async () => {
    const totals = reversalTotals(await taxEventsOf(third.settlement.id));
    return totals.count > 0 ? totals : null;
  }, 60_000);
  const originalThird = await prisma.taxWithholdingEvent.findUnique({
    where: { id: third.assessment.id },
  });
  check('the original assessment was NOT deleted',
    originalThird !== null);
  check('the original assessment was NOT edited down',
    originalThird?.vatAmount === third.assessment.vatAmount &&
      originalThird?.pitAmount === third.assessment.pitAmount);
  check('cumulative reversal equals the original assessment (net tax = 0)',
    fullyReversed.vat === third.assessment.vatAmount &&
      fullyReversed.pit === third.assessment.pitAmount,
    `reversed ${vnd(fullyReversed.vat)}/${vnd(fullyReversed.pit)} vs assessed ${vnd(third.assessment.vatAmount)}/${vnd(third.assessment.pitAmount)}`);
  const refundedSettlement = await settlementOf(third.booking.id);
  check('settlement moved to REFUNDED, never released',
    refundedSettlement?.status === 'refunded' && refundedSettlement.releasedAt === null,
    `status=${refundedSettlement?.status}`);
  console.log(
    `    assessed ${vnd(third.assessment.vatAmount)}/${vnd(third.assessment.pitAmount)} − reversed ${vnd(fullyReversed.vat)}/${vnd(fullyReversed.pit)} = 0/0`,
  );

  // ── Case 9: successive refunds accumulate exactly ────────────────────────
  // NOTE: `ExecuteRefundUseCase` is idempotent per (booking, reason) with no
  // status filter, so §9's "Refund A, B, C" is only reachable across DISTINCT
  // reasons — a second refund under the same reason is dropped by design. This
  // case asserts both halves: the ceiling, and the arithmetic when it is cleared.
  heading('Case 9 — successive refunds accumulate; same-reason retry is blocked');
  const fourth = await completedBooking(fixture, fixture.full, customer, partner, partnerHeaders, 3);
  const slice = fourth.settlement.onlineHeldAmount / 5n;
  if (slice <= 0n) {
    console.log('    (skipped: booking too small to split into refunds)');
  } else {
    const refundA = await refundAndConfirm(
      { tenantId: fixture.tenantId, owner, bookingId: fourth.booking.id, label: 'refund A' },
      slice,
    );
    check('refund A was executed', refundA !== null);
    await until('reversal after A', async () => {
      const totals = reversalTotals(await taxEventsOf(fourth.settlement.id));
      return totals.count >= 1 ? totals : null;
    }, 60_000);

    const refundB = await refundAndConfirm(
      { tenantId: fixture.tenantId, owner, bookingId: fourth.booking.id, label: 'refund B' },
      slice,
    );
    check('a SECOND refund under the same reason is refused (per-reason idempotency)',
      refundB === null);
    check('the refused retry created no extra reversal',
      reversalTotals(await taxEventsOf(fourth.settlement.id)).count === 1);

    // A distinct reason clears the ceiling: cumulative refunded rises to 3 slices.
    const refundC = await refundAndConfirm(
      { tenantId: fixture.tenantId, owner, bookingId: fourth.booking.id, label: 'refund C' },
      slice * 3n,
      'goodwill_adjustment',
    );
    check('a refund under a DIFFERENT reason is executed', refundC !== null);
    await until('reversal after C', async () => {
      const totals = reversalTotals(await taxEventsOf(fourth.settlement.id));
      return totals.count >= 2 ? totals : null;
    }, 60_000);

    const cumulative = reversalTotals(await taxEventsOf(fourth.settlement.id));
    const cumulativeRefunded = (await settlementOf(fourth.booking.id))?.refundedAmount ?? 0n;
    check('cumulative reversal never exceeds the original assessment',
      cumulative.vat <= fourth.assessment.vatAmount && cumulative.pit <= fourth.assessment.pitAmount,
      `reversed ${vnd(cumulative.vat)}/${vnd(cumulative.pit)} vs assessed ${vnd(fourth.assessment.vatAmount)}/${vnd(fourth.assessment.pitAmount)}`);
    const expectedVat =
      (fourth.assessment.vatAmount * cumulativeRefunded) / fourth.assessment.taxableRevenue;
    check('cumulative reversal matches the cumulative refunded proportion (±2 đồng)',
      abs(cumulative.vat - expectedVat) <= 2n,
      `reversed vat ${vnd(cumulative.vat)} vs expected ${vnd(expectedVat)} on ${vnd(cumulativeRefunded)} refunded`);
    check('the original assessment is still untouched after several reversals',
      (await prisma.taxWithholdingEvent.findUnique({ where: { id: fourth.assessment.id } }))
        ?.vatAmount === fourth.assessment.vatAmount);
    console.log(
      `    ${cumulative.count} reversal(s) → cumulative refunded ${vnd(cumulativeRefunded)}, reversed vat ${vnd(cumulative.vat)} pit ${vnd(cumulative.pit)}`,
    );
  }

  // ── Case 5 + 10: release, payout, duplicate release, then refund ──────────
  heading('Case 5/10 — release + payout, duplicate release, then a refund');
  const fifth = await completedBooking(fixture, fixture.full, customer, partner, partnerHeaders, 4);
  const assessmentCountBeforeRelease = (await taxEventsOf(fifth.settlement.id)).length;

  await expireDisputeWindow(fifth.settlement.id);
  const released = await until('the settlement release worker', async () => {
    const settlement = await settlementOf(fifth.booking.id);
    return settlement?.status === 'released' ? settlement : null;
  }, 90_000);
  check('release created NO additional tax event',
    (await taxEventsOf(fifth.settlement.id)).length === assessmentCountBeforeRelease,
    `${(await taxEventsOf(fifth.settlement.id)).length} vs ${assessmentCountBeforeRelease} before`);
  check('release DID create the revenue journal',
    (await prisma.ledgerEntry.count({
      where: { bookingId: fifth.booking.id, entryType: 'partner_share' },
    })) > 0);

  // Case 10 — a duplicate release request must change nothing.
  step('re-emitting settlement.release_requested');
  await prisma.outboxEvent.create({
    data: {
      tenantId: fixture.tenantId,
      eventType: 'settlement.release_requested',
      payload: { settlementId: fifth.settlement.id },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  check('duplicate release created no second tax event',
    (await taxEventsOf(fifth.settlement.id)).length === assessmentCountBeforeRelease);
  check('duplicate release created no second revenue journal',
    (await prisma.ledgerEntry.count({
      where: { bookingId: fifth.booking.id, entryType: 'partner_share' },
    })) === 1);

  step('POST /tenant/finance/payouts + mark-paid');
  const payout = await request<{ id: string; amount: string }>(
    'POST',
    '/tenant/finance/payouts',
    {
      session: owner,
      headers: { 'x-tenant-id': fixture.tenantId },
      body: { payeeType: 'partner', payeeId: fixture.partnerId },
    },
  );
  await request('POST', `/tenant/finance/payouts/${payout.id}/mark-paid`, {
    session: owner,
    headers: { 'x-tenant-id': fixture.tenantId },
    body: { reference: `PAYOUT-${RUN_NONCE}` },
  });
  check('payout was paid out to the partner', BigInt(payout.amount) > 0n, `${payout.amount} ₫`);

  // Case 5 — the refund arrives AFTER the money already left.
  const postPayoutRefund = released.onlineHeldAmount / 4n;
  await refundAndConfirm(
    { tenantId: fixture.tenantId, owner, bookingId: fifth.booking.id, label: 'Case 5' },
    postPayoutRefund,
  );
  const postPayoutReversal = await until('the post-payout tax reversal', async () => {
    const totals = reversalTotals(await taxEventsOf(fifth.settlement.id));
    return totals.count > 0 ? totals : null;
  }, 60_000);

  const payoutRow = await prisma.payout.findUnique({ where: { id: payout.id } });
  check('the PAID payout was not deleted or rolled back',
    payoutRow !== null && payoutRow.status === 'paid',
    `status=${payoutRow?.status ?? 'missing'}`);
  check('a tax reversal was recorded instead',
    postPayoutReversal.vat > 0n || postPayoutReversal.pit > 0n);
  check('the original assessment survived the post-payout refund',
    (await prisma.taxWithholdingEvent.findUnique({ where: { id: fifth.assessment.id } })) !== null);
  const clawbackLegs = await prisma.ledgerEntry.count({
    where: { bookingId: fifth.booking.id, entryType: 'clawback' },
  });
  check('a clawback journal reversed the recognized revenue', clawbackLegs > 0,
    `${clawbackLegs} clawback leg(s)`);

  // The recovery mechanism: the partner's balance is now short, and the next
  // payout run nets it off rather than a bespoke receivable table.
  const account = await prisma.ledgerAccount.findFirst({
    where: { tenantId: fixture.tenantId, ownerType: 'partner', ownerId: fixture.partnerId },
    select: { id: true },
  });
  const balance = await prisma.ledgerEntry.aggregate({
    where: { accountId: account?.id },
    _sum: { debit: true, credit: true },
  });
  const partnerBalance = (balance._sum.credit ?? 0n) - (balance._sum.debit ?? 0n);
  check('recovery goes through the partner ledger balance, not a new mechanism',
    account !== null,
    `partner balance now ${vnd(partnerBalance)} ₫`);
  console.log(`    partner ledger balance after clawback: ${vnd(partnerBalance)} ₫`);

  report();
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** Create → pay → complete one booking, returning its assessment. */
async function completedBooking(
  fixture: Fixture,
  listing: Listing,
  customer: Session,
  partner: Session,
  partnerHeaders: Record<string, string>,
  index: number,
): Promise<{
  booking: BookingHandle;
  settlement: NonNullable<Awaited<ReturnType<typeof settlementOf>>>;
  assessment: NonNullable<Awaited<ReturnType<typeof taxEventsOf>>[number]>;
}> {
  const booking = await createAndPayBooking(listing, customer, index);
  const settlement = await until('settlement held', async () => {
    const row = await settlementOf(booking.id);
    return row?.status === 'held' ? row : null;
  });
  const onsite =
    settlement.onlineHeldAmount >= booking.totalAmount
      ? 0n
      : booking.totalAmount - settlement.onlineHeldAmount;
  await timeTravelPastEnd(booking.id, pastDayOffset(index));
  step(`POST /partner/bookings/${booking.id}/complete (onsite ${vnd(onsite)} ₫)`);
  await request('POST', `/partner/bookings/${booking.id}/complete`, {
    session: partner,
    headers: partnerHeaders,
    body: { onsiteCollectedAmount: onsite.toString() },
  });
  const assessment = await until('the tax assessment', async () => {
    const events = await taxEventsOf(settlement.id);
    return events.find((event) => event.eventType === 'withholding') ?? null;
  });
  const opened = await until('settlement in dispute_window', async () => {
    const row = await settlementOf(booking.id);
    return row?.status === 'dispute_window' ? row : null;
  });
  void fixture;
  return { booking, settlement: opened, assessment };
}

function report(): void {
  console.log('');
  if (failures === 0) {
    console.log('verify-tax: OK — every scenario assertion held.');
    return;
  }
  console.error(`verify-tax: ${failures} failed assertion(s); last scenario: ${scenario}`);
  process.exit(1);
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main()
  .catch((error: unknown) => {
    console.error('\nverify-tax: aborted —', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
