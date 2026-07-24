import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FEATURED_LISTINGS_PAGE_SIZE,
  MAX_FEATURED_LISTINGS_PAGE_SIZE,
  featuredListingsPageSize,
} from './featured-catalog.ts';

test('uses the default for absent and invalid page sizes', () => {
  assert.equal(featuredListingsPageSize(null), DEFAULT_FEATURED_LISTINGS_PAGE_SIZE);
  assert.equal(featuredListingsPageSize(''), DEFAULT_FEATURED_LISTINGS_PAGE_SIZE);
  assert.equal(featuredListingsPageSize('nope'), DEFAULT_FEATURED_LISTINGS_PAGE_SIZE);
  assert.equal(featuredListingsPageSize(0), DEFAULT_FEATURED_LISTINGS_PAGE_SIZE);
  assert.equal(featuredListingsPageSize(1.5), DEFAULT_FEATURED_LISTINGS_PAGE_SIZE);
});

test('accepts valid page sizes and clamps oversized requests', () => {
  assert.equal(featuredListingsPageSize('12'), 12);
  assert.equal(featuredListingsPageSize(24), MAX_FEATURED_LISTINGS_PAGE_SIZE);
  assert.equal(featuredListingsPageSize('999'), MAX_FEATURED_LISTINGS_PAGE_SIZE);
});
