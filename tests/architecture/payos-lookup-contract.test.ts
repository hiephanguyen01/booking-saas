import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const adapterPath = resolve(
  process.cwd(),
  'apps/api/src/modules/payments/infrastructure/gateways/payos-gateway.adapter.ts',
);

/**
 * payOS may return HTTP 200 with a non-success business code. Lookup-before-create
 * may treat only known "payment request not found" codes as a cache miss; any
 * other business error must fail closed instead of silently falling through to
 * POST /v2/payment-requests.
 */
describe('PayOS lookup contract architecture', () => {
  it('does not collapse unknown business errors with null data into not-found', () => {
    const source = readFileSync(adapterPath, 'utf8');
    const start = source.indexOf('function parseLookupData');
    const end = source.indexOf('function parseCreateData');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const lookupParser = source.slice(start, end);

    expect(lookupParser).toContain("value.code === '101'");
    expect(lookupParser).toContain("value.code === '231'");
    expect(lookupParser).toContain("value.code === '20'");
    expect(lookupParser).not.toMatch(
      /value\.data\s*===\s*null\s*\|\|\s*value\.data\s*===\s*undefined[\s\S]*?return null;/,
    );
  });
});
