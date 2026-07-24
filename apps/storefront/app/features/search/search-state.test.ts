import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSearchState } from './search-state.ts';

test('accepts only canonical non-negative VND integer strings', () => {
  const valid = parseSearchState(new URLSearchParams({ minPrice: '1000', maxPrice: '2500000' }));
  assert.equal(valid.minPrice, 1000);
  assert.equal(valid.maxPrice, 2_500_000);

  const scientific = parseSearchState(new URLSearchParams({ minPrice: '1e3' }));
  const negative = parseSearchState(new URLSearchParams({ minPrice: '-100' }));
  const formatted = parseSearchState(new URLSearchParams({ minPrice: '1,000' }));
  assert.equal(scientific.minPrice, null);
  assert.equal(negative.minPrice, null);
  assert.equal(formatted.minPrice, null);
});

test('rejects malformed or reversed wall-clock selections', () => {
  const malformed = parseSearchState(
    new URLSearchParams({ date: '2026-07-24', startTime: '25:00', endTime: '26:00' }),
  );
  assert.equal(malformed.hasTimeSelection, false);
  assert.equal(malformed.startTime, '09:00');
  assert.equal(malformed.endTime, '10:00');

  const reversed = parseSearchState(
    new URLSearchParams({ date: '2026-07-24', startTime: '14:00', endTime: '09:00' }),
  );
  assert.equal(reversed.hasTimeSelection, false);
});

test('exposes only daily ranges within the 31-day limit', () => {
  const maximum = parseSearchState(
    new URLSearchParams({ mode: 'daily', from: '2026-01-01', to: '2026-02-01' }),
  );
  assert.equal(maximum.hasDailyRange, true);
  assert.equal(maximum.from, '2026-01-01');
  assert.equal(maximum.to, '2026-02-01');

  const excessive = parseSearchState(
    new URLSearchParams({ mode: 'daily', from: '2026-01-01', to: '2026-02-02' }),
  );
  assert.equal(excessive.hasDailyRange, false);
});
