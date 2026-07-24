import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PublicListingRecord } from '../domain/ports/listing-read-repository.port';
import {
  MAX_FEATURED_LISTINGS,
  featuredListingLimit,
  uniquePublicListingRecords,
} from './featured-listings.ts';

const record = (id: string, groupId?: string): PublicListingRecord =>
  ({ id, group: groupId ? { id: groupId } : null }) as PublicListingRecord;

test('bounds featured listing limits', () => {
  assert.equal(featuredListingLimit(0), 1);
  assert.equal(featuredListingLimit(12), 12);
  assert.equal(featuredListingLimit(999), MAX_FEATURED_LISTINGS);
});

test('keeps database order while deduplicating groups and enforcing the limit', () => {
  const rows = [
    record('room-a', 'group-1'),
    record('room-b', 'group-1'),
    record('listing-2'),
    record('listing-3'),
  ];
  const selected = uniquePublicListingRecords(rows, 2);
  assert.deepEqual(
    selected.map((item) => item.id),
    ['room-a', 'listing-2'],
  );
});
