#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const API = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const HOST = process.env.TENANT_HOST ?? 'studiohub.localhost';
const DB = process.env.MIGRATE_DATABASE_URL;
const TENANT_ID = process.env.TENANT_ID;
const HOUSE_ID = process.env.HOUSE_ID;
const LISTING_ID = process.env.LISTING_ID;
const LISTING_SLUG = process.env.LISTING_SLUG;
const MOCK_SECRET = process.env.MOCK_WEBHOOK_SECRET ?? 'payment-ops-mock-secret';
const ZALO_KEY2 = process.env.ZALO_KEY2 ?? 'diagnostic-zalopay-key2-0123456789';
const ZALO_MODE_FILE = '/tmp/zalo-refund-mode';

for (const [name, value] of Object.entries({ DB, TENANT_ID, HOUSE_ID, LISTING_ID, LISTING_SLUG })) {
  if (!value) throw new Error(`Missing required env ${name}`);
}

const results = [];
let ownerCookie = '';
let offsetCursor = 6;
let zpTxnCounter = 9000000000000n;

function log(msg) { console.log(msg); }
function sql(query) {
  return execFileSync('psql', [DB, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query], {
    encoding: 'utf8',
  }).trim();
}
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function asBig(v) { return BigInt(String(v).trim()); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function eq(actual, expected, label) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function request(path, { method = 'GET', headers = {}, body, expected = [200, 201] } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!expected.includes(res.status)) {
    throw new Error(`${method} ${path} -> HTTP ${res.status}; ${text.slice(0, 1000)}`);
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function waitSql(query, predicate, label, timeoutMs = 45000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = sql(query);
    if (predicate(last)) return last;
    await sleep(intervalMs);
  }
  throw new Error(`${label} timed out; last=${last}`);
}

async function scenario(name, fn) {
  const started = Date.now();
  log(`\n=== ${name} ===`);
  try {
    const detail = await fn();
    const durationMs = Date.now() - started;
    results.push({ name, passed: true, durationMs, detail: detail ?? '' });
    log(`PASS ${name} (${durationMs}ms)${detail ? ` :: ${detail}` : ''}`);
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    results.push({ name, passed: false, durationMs, detail: message });
    log(`FAIL ${name} (${durationMs}ms)\n${message}`);
  }
}

async function loginOwner() {
  const res = await request('/auth/login', {
    method: 'POST',
    body: { email: 'owner@studiohub.vn', password: 'demo-password' },
  });
  const setCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);
  ownerCookie = setCookies.map((x) => x.split(';')[0]).join('; ');
  assert(ownerCookie.includes('sid='), `owner login missing sid cookie: ${ownerCookie}`);
}

function tenantHeaders(extra = {}) {
  return { cookie: ownerCookie, 'x-tenant-id': TENANT_ID, ...extra };
}
function partnerHeaders(extra = {}) {
  return tenantHeaders({ 'x-partner-id': HOUSE_ID, ...extra });
}

async function setRefundPolicy(strategy) {
  const res = await request('/tenant/refund-policy', {
    method: 'PUT',
    headers: tenantHeaders(),
    body: { refundStrategy: strategy, manualRefundSlaHours: 72 },
  });
  eq(res.json?.refundStrategy, strategy, 'refund policy');
}

async function setRouting(routes) {
  const res = await request('/tenant/payment-routing', {
    method: 'PUT',
    headers: tenantHeaders(),
    body: { routes },
  });
  assert(Array.isArray(res.json?.routes), 'routing response missing routes');
}

async function ensureZaloConfig() {
  await request('/tenant/gateway-config', {
    method: 'PUT',
    headers: tenantHeaders(),
    body: {
      gateway: 'zalopay',
      environment: 'sandbox',
      credentials: {
        appId: '2554',
        key1: 'diagnostic-zalopay-key1-0123456789',
        key2: ZALO_KEY2,
      },
    },
  });
}

async function getSlot(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  const { json } = await request(
    `/public/listings/${encodeURIComponent(LISTING_SLUG)}/availability?mode=hourly&from=${date}&to=${date}`,
    { headers: { 'x-forwarded-host': HOST } },
  );
  const slot = json?.days?.flatMap((d) => d.slots ?? []).find((s) => s.available);
  if (!slot) throw new Error(`No available slot at +${offsetDays}d (${date})`);
  return { from: slot.startUtc, to: slot.endUtc, date };
}

async function createBooking(label, { offsetDays, exactSlot } = {}) {
  const offset = offsetDays ?? offsetCursor++;
  const slot = exactSlot ?? await getSlot(offset);
  const idem = `ops-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${idem}@example.com`;
  const { json } = await request('/public/bookings', {
    method: 'POST',
    headers: { 'x-forwarded-host': HOST, 'idempotency-key': idem },
    body: {
      listingId: LISTING_ID,
      mode: 'hourly',
      from: slot.from,
      to: slot.to,
      quantity: 1,
      guestCount: 1,
      guest: { fullName: `Ops ${label}`, email, phone: '0901234567' },
    },
  });
  assert(json?.id && json?.code && json?.accessGrant, `create ${label} missing id/code/accessGrant`);
  eq(sql(`select count(*) from bookings where idempotency_key=${q(idem)}`), '1', `${label} idempotency row count`);
  return { label, id: json.id, code: json.code, access: json.accessGrant, slot, idem };
}

async function checkout(booking, paymentMethod = 'bank_transfer') {
  const { json } = await request(`/public/bookings/${booking.id}/checkout`, {
    method: 'POST',
    headers: {
      'x-forwarded-host': HOST,
      'x-booking-code': booking.code,
      'x-booking-access-grant': booking.access,
    },
    body: { paymentMethod },
  });
  assert(json?.paymentId, `${booking.label} checkout missing paymentId`);
  const row = sql(`select gateway::text||'|'||kind::text||'|'||amount::text||'|'||coalesce(gateway_txn_id,'')||'|'||coalesce(gateway_order_ref,'')||'|'||status::text from payments where id=${q(json.paymentId)}`);
  const [gateway, kind, amount, txn, orderRef, status] = row.split('|');
  return { id: json.paymentId, gateway, kind, amount: asBig(amount), txn, orderRef, status, destination: json.destination };
}

function signMock(txn, event, amount) {
  return createHmac('sha256', MOCK_SECRET).update(`${txn}.${event}.${amount}`).digest('hex');
}
async function mockWebhook(payment, event, amount = payment.amount) {
  const value = asBig(amount);
  return request('/webhooks/mock', {
    method: 'POST',
    body: {
      gatewayTxnId: payment.txn,
      event,
      amountVnd: value.toString(),
      signature: signMock(payment.txn, event, value),
    },
  });
}

function signZaloData(dataString) {
  return createHmac('sha256', ZALO_KEY2).update(dataString).digest('hex');
}
async function zaloWebhook(payment, amount = payment.amount) {
  zpTxnCounter += 1n;
  const data = JSON.stringify({
    app_trans_id: payment.orderRef,
    zp_trans_id: Number(zpTxnCounter),
    amount: Number(amount),
  });
  return request('/webhooks/zalopay', {
    method: 'POST',
    body: { data, mac: signZaloData(data) },
  });
}

async function paymentStatus(booking) {
  return (await request(`/public/bookings/${booking.code}/payment-status`, {
    headers: { 'x-forwarded-host': HOST, 'x-booking-access-grant': booking.access },
  })).json;
}

async function waitBooking(id, status, timeoutMs = 45000) {
  await waitSql(`select status::text from bookings where id=${q(id)}`, (v) => v === status, `booking ${id} -> ${status}`, timeoutMs);
}

async function payMockSuccess(booking) {
  const p = await checkout(booking, 'bank_transfer');
  eq(p.gateway, 'mock', `${booking.label} gateway`);
  await mockWebhook(p, 'succeeded');
  await waitBooking(booking.id, 'confirmed');
  return p;
}

async function payZaloSuccess(booking) {
  const p = await checkout(booking, 'zalopay_wallet');
  eq(p.gateway, 'zalopay', `${booking.label} gateway`);
  assert(p.orderRef, `${booking.label} zalopay order ref missing`);
  await zaloWebhook(p);
  await waitBooking(booking.id, 'confirmed');
  const gatewayTxn = sql(`select coalesce(gateway_txn_id,'') from payments where id=${q(p.id)}`);
  assert(/^\d+$/.test(gatewayTxn), `${booking.label} zalopay gateway txn missing after webhook`);
  return { ...p, txn: gatewayTxn };
}

async function partnerCancel(booking, reason = 'ops diagnostic cancel') {
  return (await request(`/partner/bookings/${booking.id}/cancel`, {
    method: 'POST',
    headers: partnerHeaders(),
    body: { reason },
  })).json;
}

async function customerCancel(booking, reason = 'ops customer cancel') {
  return (await request(`/public/bookings/${booking.code}/cancel`, {
    method: 'POST',
    headers: { 'x-forwarded-host': HOST, 'x-booking-access-grant': booking.access },
    body: { reason },
  })).json;
}

function setZaloRefundMode(mode) {
  fs.writeFileSync(ZALO_MODE_FILE, `${mode}\n`);
}

async function waitRefundBatch(bookingId, status, timeoutMs = 60000) {
  return waitSql(
    `select status::text from refund_batches where booking_id=${q(bookingId)} and reason='booking_cancellation' order by created_at desc limit 1`,
    (v) => v === status,
    `refund batch ${bookingId} -> ${status}`,
    timeoutMs,
  );
}

async function waitRefundStatus(bookingId, status, timeoutMs = 60000) {
  return waitSql(
    `select status::text from refunds where booking_id=${q(bookingId)} and reason='booking_cancellation' order by created_at desc limit 1`,
    (v) => v === status,
    `refund ${bookingId} -> ${status}`,
    timeoutMs,
  );
}

async function shiftBookingToPast(bookingId, hoursAgoStart = 3, hoursAgoEnd = 1) {
  sql(`update bookings set timeslot=tstzrange(now()-interval '${hoursAgoStart} hours',now()-interval '${hoursAgoEnd} hours','[)'), blocked_period=tstzrange(now()-interval '${hoursAgoStart} hours 30 minutes',now()-interval '${Math.max(hoursAgoEnd - 0.5, 0.5)} hours','[)') where id=${q(bookingId)}`);
}

async function prepare() {
  await loginOwner();
  await ensureZaloConfig();
  await setRefundPolicy('manual');
  await setRouting([
    { method: 'bank_transfer', gateway: 'mock', enabled: true },
    { method: 'zalopay_wallet', gateway: 'zalopay', enabled: true },
  ]);
  setZaloRefundMode('success');
}

await prepare();

await scenario('01 deposit success -> confirmed + held settlement', async () => {
  const b = await createBooking('deposit-success');
  const p = await checkout(b);
  assert(['deposit', 'full'].includes(p.kind), `unexpected initial payment kind ${p.kind}`);
  await mockWebhook(p, 'succeeded');
  await waitBooking(b.id, 'confirmed');
  eq(sql(`select status::text from payments where id=${q(p.id)}`), 'succeeded', 'payment status');
  eq(sql(`select status::text from booking_settlements where booking_id=${q(b.id)}`), 'held', 'settlement status');
  return `payment=${p.kind}/${p.amount}`;
});

await scenario('02 checkout pending remains pending_payment', async () => {
  const b = await createBooking('pending');
  const p = await checkout(b);
  const status = await paymentStatus(b);
  eq(status.paymentStatus, 'pending', 'public payment status');
  eq(status.bookingStatus, 'pending_payment', 'booking status');
  eq(sql(`select status::text from payments where id=${q(p.id)}`), 'pending', 'db payment');
});

await scenario('03 failed webhook is terminal without confirming booking', async () => {
  const b = await createBooking('failed');
  const p = await checkout(b);
  await mockWebhook(p, 'failed');
  eq(sql(`select status::text from payments where id=${q(p.id)}`), 'failed', 'db payment');
  eq(sql(`select status::text from bookings where id=${q(b.id)}`), 'pending_payment', 'db booking');
  eq((await paymentStatus(b)).paymentStatus, 'failed', 'public payment status');
});

await scenario('04 expired payment can retry with a new payment and succeed', async () => {
  const b = await createBooking('expired-retry');
  const p1 = await checkout(b);
  await mockWebhook(p1, 'expired');
  eq(sql(`select status::text from payments where id=${q(p1.id)}`), 'expired', 'first payment');
  const p2 = await checkout(b);
  assert(p2.id !== p1.id, 'retry reused terminal payment id');
  await mockWebhook(p2, 'succeeded');
  await waitBooking(b.id, 'confirmed');
  return `old=${p1.id} new=${p2.id}`;
});

await scenario('05 duplicate succeeded webhook emits payment.succeeded once', async () => {
  const b = await createBooking('duplicate-webhook');
  const p = await checkout(b);
  await mockWebhook(p, 'succeeded');
  await waitBooking(b.id, 'confirmed');
  await mockWebhook(p, 'succeeded');
  await sleep(1000);
  eq(sql(`select count(*) from outbox_events where event_type='payment.succeeded' and payload->>'paymentId'=${q(p.id)}`), '1', 'payment.succeeded outbox count');
});

await scenario('06 under/over capture quarantined; exact amount later succeeds', async () => {
  const b = await createBooking('amount-mismatch');
  const p = await checkout(b);
  const under = p.amount - 1n;
  const over = p.amount + 1n;
  await mockWebhook(p, 'succeeded', under);
  eq(sql(`select status::text from payments where id=${q(p.id)}`), 'pending', 'after underpay status');
  eq(sql(`select captured_amount::text from payments where id=${q(p.id)}`), under.toString(), 'underpay captured');
  await mockWebhook(p, 'succeeded', over);
  eq(sql(`select status::text from payments where id=${q(p.id)}`), 'pending', 'after overpay status');
  eq(sql(`select captured_amount::text from payments where id=${q(p.id)}`), over.toString(), 'overpay captured');
  eq(sql(`select count(*) from outbox_events where event_type='payment.succeeded' and payload->>'paymentId'=${q(p.id)}`), '0', 'no success outbox before exact amount');
  await mockWebhook(p, 'succeeded', p.amount);
  await waitBooking(b.id, 'confirmed');
});

await scenario('07 balance payment brings paid_amount to final_amount without reconfirm reset', async () => {
  const b = await createBooking('balance');
  await payMockSuccess(b);
  const before = sql(`select final_amount::text||'|'||paid_amount::text from bookings where id=${q(b.id)}`);
  const [finalAmount, paidBefore] = before.split('|').map(asBig);
  assert(finalAmount > paidBefore, `fixture has no balance: final=${finalAmount} paid=${paidBefore}`);
  const balance = await checkout(b);
  eq(balance.kind, 'balance', 'balance payment kind');
  eq(balance.amount.toString(), (finalAmount - paidBefore).toString(), 'balance amount');
  await mockWebhook(balance, 'succeeded');
  await waitSql(`select paid_amount::text from bookings where id=${q(b.id)}`, (v) => v === finalAmount.toString(), 'paid amount reaches final');
  eq(sql(`select status::text from bookings where id=${q(b.id)}`), 'confirmed', 'booking remains confirmed');
});

await setRefundPolicy('automatic_preferred');

await scenario('08 partner cancellation -> 100% automatic ZaloPay refund -> refunded', async () => {
  setZaloRefundMode('success');
  const b = await createBooking('full-auto-refund');
  const p = await payZaloSuccess(b);
  const cancelled = await partnerCancel(b);
  eq(cancelled.refundPercent, 100, 'refund percent');
  await waitRefundBatch(b.id, 'completed');
  await waitBooking(b.id, 'refunded');
  eq(await waitRefundStatus(b.id, 'succeeded'), 'succeeded', 'refund status');
  eq(sql(`select execution_mode::text from refunds where booking_id=${q(b.id)} order by created_at desc limit 1`), 'automatic', 'execution mode');
  return `paid=${p.amount}`;
});

await scenario('09 customer 48-168h cancellation -> 50% automatic partial refund', async () => {
  setZaloRefundMode('success');
  const b = await createBooking('partial-refund', { offsetDays: 3 });
  const p = await payZaloSuccess(b);
  const cancelled = await customerCancel(b);
  eq(cancelled.refundPercent, 50, 'customer refund percent');
  const expected = p.amount / 2n;
  eq(String(cancelled.refundAmount), expected.toString(), 'customer partial refund amount');
  await waitRefundBatch(b.id, 'completed');
  await waitBooking(b.id, 'refunded');
  eq(sql(`select amount::text from refunds where booking_id=${q(b.id)} and reason='booking_cancellation' order by created_at desc limit 1`), expected.toString(), 'refund row amount');
});

await scenario('10 manual refund requires evidence then finalizes booking', async () => {
  await setRefundPolicy('manual');
  const b = await createBooking('manual-refund');
  await payMockSuccess(b);
  const cancelled = await partnerCancel(b);
  eq(cancelled.refundPercent, 100, 'manual refund percent');
  await waitRefundBatch(b.id, 'manual_required');
  eq(sql(`select status::text from bookings where id=${q(b.id)}`), 'cancelled', 'booking waits in cancelled');
  const refundId = sql(`select id from refunds where booking_id=${q(b.id)} and reason='booking_cancellation' order by created_at desc limit 1`);
  await request(`/tenant/payments/refunds/${refundId}/confirm`, {
    method: 'POST',
    headers: tenantHeaders(),
    body: { reference: `OPS-${Date.now()}`, note: 'diagnostic manual refund' },
  });
  await waitRefundBatch(b.id, 'completed');
  await waitBooking(b.id, 'refunded');
  eq(sql(`select status::text from refunds where id=${q(refundId)}`), 'succeeded', 'manual refund row');
});

await setRefundPolicy('automatic_preferred');

await scenario('11 automatic refund pending -> reconciliation -> succeeded', async () => {
  setZaloRefundMode('pending');
  const b = await createBooking('auto-pending');
  await payZaloSuccess(b);
  await partnerCancel(b);
  await waitRefundStatus(b.id, 'pending', 30000);
  eq(sql(`select status::text from refund_batches where booking_id=${q(b.id)} and reason='booking_cancellation'`), 'processing', 'batch while provider pending');
  setZaloRefundMode('success');
  await waitRefundBatch(b.id, 'completed', 75000);
  await waitBooking(b.id, 'refunded', 30000);
});

await scenario('12 automatic refund provider failure -> batch failed; booking not falsely refunded', async () => {
  setZaloRefundMode('failed');
  const b = await createBooking('auto-failed');
  await payZaloSuccess(b);
  await partnerCancel(b);
  await waitRefundBatch(b.id, 'failed', 30000);
  eq(sql(`select status::text from refunds where booking_id=${q(b.id)} and reason='booking_cancellation' order by created_at desc limit 1`), 'failed', 'failed refund');
  eq(sql(`select status::text from bookings where id=${q(b.id)}`), 'cancelled', 'booking not falsely refunded');
});

await scenario('13 late ZaloPay webhook after expiry + slot takeover -> auto-refund, competitor preserved', async () => {
  setZaloRefundMode('success');
  const slot = await getSlot(offsetCursor++);
  const original = await createBooking('late-original', { exactSlot: slot });
  const p = await checkout(original, 'zalopay_wallet');
  eq(p.gateway, 'zalopay', 'late payment gateway');
  sql(`update bookings set status='expired'::booking_status, expires_at=now()-interval '1 minute' where id=${q(original.id)}`);
  const competitor = await createBooking('late-competitor', { exactSlot: slot });
  eq(sql(`select status::text from bookings where id=${q(competitor.id)}`), 'pending_payment', 'competitor active');
  await zaloWebhook(p);
  await waitRefundBatch(original.id, 'completed', 60000);
  await waitBooking(original.id, 'refunded', 30000);
  eq(sql(`select status::text from bookings where id=${q(competitor.id)}`), 'pending_payment', 'competitor preserved');
  eq(sql(`select refund_percent::text from bookings where id=${q(original.id)}`), '100', 'late refund percent');
});

await scenario('14 no-show only after service end -> dispute window/customer_no_show settlement', async () => {
  await setRefundPolicy('manual');
  const b = await createBooking('no-show');
  await payMockSuccess(b);
  const early = await request(`/partner/bookings/${b.id}/no-show`, {
    method: 'POST',
    headers: partnerHeaders(),
    body: { reason: 'too early guard' },
    expected: [400, 409, 422],
  });
  assert(early.status >= 400, 'early no-show unexpectedly succeeded');
  await shiftBookingToPast(b.id, 3, 1);
  const { json } = await request(`/partner/bookings/${b.id}/no-show`, {
    method: 'POST',
    headers: partnerHeaders(),
    body: { reason: 'customer absent' },
  });
  eq(json?.status, 'no_show', 'no-show response');
  await waitSql(`select status::text from booking_settlements where booking_id=${q(b.id)}`, (v) => v === 'dispute_window', 'no-show settlement window');
  eq(sql(`select kind::text from booking_settlements where booking_id=${q(b.id)}`), 'customer_no_show', 'settlement kind');
  assert(sql(`select coalesce(dispute_until::text,'') from booking_settlements where booking_id=${q(b.id)}`).length > 0, 'no-show dispute_until missing');
});

await scenario('15 completed -> dispute window -> due worker release', async () => {
  const b = await createBooking('complete-release');
  await payMockSuccess(b);
  await shiftBookingToPast(b.id, 3, 1);
  const outstanding = sql(`select greatest(final_amount + coalesce((select sum((x->>'amount')::bigint) from jsonb_array_elements(additional_charges) x where (x->>'amount') ~ '^\\d+$'),0) - paid_amount,0)::text from bookings where id=${q(b.id)}`);
  const { json } = await request(`/partner/bookings/${b.id}/complete`, {
    method: 'POST',
    headers: partnerHeaders(),
    body: { onsiteCollectedAmount: outstanding, note: 'ops completion' },
  });
  eq(json?.status, 'completed', 'complete response');
  await waitSql(`select status::text from booking_settlements where booking_id=${q(b.id)}`, (v) => v === 'dispute_window', 'completion settlement window');
  sql(`update booking_settlements set dispute_until=now()-interval '1 second' where booking_id=${q(b.id)}`);
  await waitSql(`select status::text from booking_settlements where booking_id=${q(b.id)}`, (v) => v === 'released', 'settlement release worker', 75000, 1000);
  assert(asBig(sql(`select partner_payable::text from booking_settlements where booking_id=${q(b.id)}`)) >= 0n, 'partner payable invalid');
});

await scenario('G1 repeated cancel/no-show/complete guards reject invalid transitions', async () => {
  const refunded = results.find((r) => r.name.startsWith('08 '));
  assert(refunded?.passed, 'scenario 08 prerequisite failed');
  const id = sql("select booking_id from refund_batches where reason='booking_cancellation' and status='completed' order by created_at asc limit 1");
  assert(id, 'no refunded booking available');
  for (const [path, body] of [
    [`/partner/bookings/${id}/cancel`, { reason: 'repeat' }],
    [`/partner/bookings/${id}/no-show`, { reason: 'repeat' }],
    [`/partner/bookings/${id}/complete`, { onsiteCollectedAmount: '0', note: 'repeat' }],
  ]) {
    const res = await request(path, { method: 'POST', headers: partnerHeaders(), body, expected: [409] });
    eq(res.status, 409, `${path} invalid transition status`);
  }
  eq(sql(`select status::text from bookings where id=${q(id)}`), 'refunded', 'terminal status preserved');
});

const passed = results.filter((r) => r.passed).length;
log('\n================================================================');
log(`PAYMENT OPS LIFECYCLE RESULT: ${passed}/${results.length} scenarios passed`);
for (const r of results) log(`${r.passed ? 'PASS' : 'FAIL'} | ${r.name} | ${r.durationMs}ms${r.detail ? ` | ${String(r.detail).split('\n')[0]}` : ''}`);
log('================================================================');

fs.writeFileSync('/tmp/payment-ops-results.json', JSON.stringify({
  mainCommit: process.env.MAIN_COMMIT,
  passed,
  total: results.length,
  results,
}, null, 2));

if (passed !== results.length) process.exit(1);
