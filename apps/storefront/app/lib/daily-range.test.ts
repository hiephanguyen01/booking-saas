import assert from 'node:assert/strict';
import { test } from 'node:test';
import { datesInDailyRange, normalizeDailyRange } from './daily-range.ts';

test('accepts the maximum 31-day booking range', () => {
  const range = normalizeDailyRange('2026-01-01', '2026-02-01');
  assert.ok(range);
  assert.equal(range.nights, 31);
  assert.equal(datesInDailyRange(range).length, 31);
  assert.equal(datesInDailyRange(range).at(-1), '2026-01-31');
});

test('rejects a booking range longer than 31 days', () => {
  assert.equal(normalizeDailyRange('2026-01-01', '2026-02-02'), null);
});

test('normalizes a same-day selection to one bounded night', () => {
  const range = normalizeDailyRange('2026-07-24', '2026-07-24');
  assert.deepEqual(range, {
    selectedFrom: '2026-07-24',
    selectedTo: '2026-07-24',
    from: '2026-07-24',
    to: '2026-07-25',
    nights: 1,
  });
});
