import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import type * as ContractsModule from '@booking/contracts';

const require = createRequire(import.meta.url);
const contracts = require('@booking/contracts') as typeof ContractsModule;

test('accepts an exclusive booking range up to 31 days', () => {
  assert.equal(
    contracts.bookingDateRangeSchema.safeParse({ from: '2026-01-01', to: '2026-02-01' })
      .success,
    true,
  );
  assert.equal(
    contracts.bookingDateRangeSchema.safeParse({ from: '2026-01-01', to: '2026-02-02' })
      .success,
    false,
  );
});

test('bounds inclusive availability queries to 31 calendar days', () => {
  assert.equal(
    contracts.availabilityQuerySchema.safeParse({
      mode: 'daily',
      from: '2026-01-01',
      to: '2026-01-31',
    }).success,
    true,
  );
  assert.equal(
    contracts.availabilityQuerySchema.safeParse({
      mode: 'daily',
      from: '2026-01-01',
      to: '2026-02-01',
    }).success,
    false,
  );
});

test('rejects impossible calendar dates and malformed wall-clock values', () => {
  assert.equal(contracts.dateOnlySchema.safeParse('2026-02-29').success, false);
  assert.equal(contracts.dateOnlySchema.safeParse('2028-02-29').success, true);
  assert.equal(contracts.timeOfDaySchema.safeParse('23:59').success, true);
  assert.equal(contracts.timeOfDaySchema.safeParse('24:00').success, false);
  assert.equal(contracts.timeOfDaySchema.safeParse('9:00').success, false);
});

test('accepts only canonical non-negative integer VND strings', () => {
  assert.equal(contracts.moneyStringSchema.safeParse('0').success, true);
  assert.equal(contracts.moneyStringSchema.safeParse('2500000').success, true);
  assert.equal(contracts.moneyStringSchema.safeParse('1e3').success, false);
  assert.equal(contracts.moneyStringSchema.safeParse('-100').success, false);
  assert.equal(contracts.moneyStringSchema.safeParse('1,000').success, false);
  assert.equal(contracts.moneyStringSchema.safeParse('01').success, false);
});
