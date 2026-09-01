#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const API = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const DB = process.env.MIGRATE_DATABASE_URL;
const TENANT_ID = process.env.TENANT_ID;
const HOUSE_ID = process.env.HOUSE_ID;
if (!DB || !TENANT_ID || !HOUSE_ID) throw new Error('missing diagnostic env');

function sql(query) {
  return execFileSync('psql', [DB, '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }
async function raw(path, { method='GET', headers={}, body }={}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined ? {'content-type':'application/json'} : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, text, json, headers: res.headers };
}

const login = await raw('/auth/login', { method:'POST', body:{ email:'owner@studiohub.vn', password:'demo-password' } });
if (login.status !== 200 && login.status !== 201) throw new Error(`login ${login.status}: ${login.text}`);
const cookies = typeof login.headers.getSetCookie === 'function' ? login.headers.getSetCookie() : [login.headers.get('set-cookie')].filter(Boolean);
const cookie = cookies.map((x)=>x.split(';')[0]).join('; ');
if (!cookie.includes('sid=')) throw new Error('missing owner sid');
const headers = { cookie, 'x-tenant-id': TENANT_ID, 'x-partner-id': HOUSE_ID };

const findings = { lateRefund: {}, guards: {} };
let failed = false;

// Re-observe scenario 13 from the same lifecycle run. It is the completed cancellation refund
// whose booking reached refunded but did not persist the normal cancellation snapshot metadata.
const lateId = sql(`select b.id from bookings b join refund_batches rb on rb.booking_id=b.id where b.status='refunded' and b.refund_percent is null and rb.reason='booking_cancellation' and rb.status='completed' order by rb.created_at desc limit 1`);
if (!lateId) {
  findings.lateRefund = { passed: false, reason: 'late refunded booking with null refund_percent not found' };
  failed = true;
} else {
  const booking = sql(`select status::text||'|'||paid_amount::text||'|'||coalesce(refund_due_amount::text,'')||'|'||coalesce(refund_percent::text,'') from bookings where id=${q(lateId)}`).split('|');
  const refund = sql(`select status::text||'|'||amount::text||'|'||coalesce(gateway_refund_id,'') from refunds where booking_id=${q(lateId)} and reason='booking_cancellation' order by created_at desc limit 1`).split('|');
  const batch = sql(`select status::text||'|'||requested_amount::text from refund_batches where booking_id=${q(lateId)} and reason='booking_cancellation' order by created_at desc limit 1`).split('|');
  const settlement = sql(`select status::text||'|'||refunded_amount::text||'|'||retained_amount::text from booking_settlements where booking_id=${q(lateId)}`).split('|');
  const competitor = sql(`select id||'|'||status::text from bookings where id<>${q(lateId)} and listing_id=(select listing_id from bookings where id=${q(lateId)}) and timeslot=(select timeslot from bookings where id=${q(lateId)}) and status in ('pending_payment','confirmed') order by created_at desc limit 1`).split('|');
  const moneyAndStatePass = booking[0] === 'refunded' && booking[1] === '0' && refund[0] === 'succeeded' && batch[0] === 'completed' && batch[1] === refund[1] && settlement[0] === 'refunded' && settlement[1] === refund[1] && competitor[0] && ['pending_payment','confirmed'].includes(competitor[1]);
  const metadataPass = booking[3] === '100' && booking[2] === refund[1];
  findings.lateRefund = {
    bookingId: lateId,
    bookingStatus: booking[0], paidAmount: booking[1], refundDueAmount: booking[2] || null, refundPercent: booking[3] || null,
    refundStatus: refund[0], refundAmount: refund[1], gatewayRefundId: refund[2] || null,
    batchStatus: batch[0], batchRequested: batch[1],
    settlementStatus: settlement[0], settlementRefunded: settlement[1], settlementRetained: settlement[2],
    competitorId: competitor[0] || null, competitorStatus: competitor[1] || null,
    moneyAndStatePass, metadataPass,
  };
  if (!moneyAndStatePass || !metadataPass) failed = true;
}

// Run all three terminal guards independently so one 500 cannot hide the others.
const terminalId = sql(`select booking_id from refund_batches where reason='booking_cancellation' and status='completed' order by created_at asc limit 1`);
if (!terminalId) throw new Error('no refunded booking for terminal guard');
for (const [name, path, body] of [
  ['cancel', `/partner/bookings/${terminalId}/cancel`, { reason:'repeat guard' }],
  ['noShow', `/partner/bookings/${terminalId}/no-show`, { reason:'repeat guard' }],
  ['complete', `/partner/bookings/${terminalId}/complete`, { onsiteCollectedAmount:'0', note:'repeat guard' }],
]) {
  const res = await raw(path, { method:'POST', headers, body });
  findings.guards[name] = { status: res.status, body: res.json ?? res.text };
  if (![400,409,422].includes(res.status)) failed = true;
}
findings.guards.terminalBookingId = terminalId;
findings.guards.finalStatus = sql(`select status::text from bookings where id=${q(terminalId)}`);
if (findings.guards.finalStatus !== 'refunded') failed = true;

console.log(JSON.stringify(findings, null, 2));
fs.writeFileSync('/tmp/payment-ops-followup.json', JSON.stringify(findings, null, 2));
if (failed) process.exit(1);
