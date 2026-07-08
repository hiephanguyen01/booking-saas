import { describe, expect, it } from 'vitest';
import { buildDefaultSubdomain, domainVerificationRecord, normalizeHostname } from './hostname';

describe('normalizeHostname', () => {
  it('lowercases and strips scheme, port, path and trailing dot', () => {
    expect(normalizeHostname('HTTPS://StudioHub.VN:3000/listings/x')).toBe('studiohub.vn');
    expect(normalizeHostname('studiohub.bookify.vn.')).toBe('studiohub.bookify.vn');
    expect(normalizeHostname('  Studiohub.vn  ')).toBe('studiohub.vn');
  });
});

describe('buildDefaultSubdomain', () => {
  it('joins slug and base domain', () => {
    expect(buildDefaultSubdomain('studiohub', 'bookify.vn')).toBe('studiohub.bookify.vn');
  });
});

describe('domainVerificationRecord', () => {
  it('prefixes the verification host', () => {
    expect(domainVerificationRecord('studiohub.vn', 'tok_123')).toEqual({
      name: '_bookify-verify.studiohub.vn',
      value: 'tok_123',
    });
  });
});
