import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatDiscount,
  formatPercent,
  formatTime,
  formatVnd,
  formatVndCompact,
} from './format';

describe('formatVnd', () => {
  it('groups đồng with dots and appends the unit', () => {
    expect(formatVnd('1234567')).toBe('1.234.567 ₫');
    expect(formatVnd('0')).toBe('0 ₫');
    expect(formatVnd('-50000')).toBe('-50.000 ₫');
  });

  it('parses with BigInt so precision survives past 2^53', () => {
    // 9_007_199_254_740_993 is not representable as a JS number.
    expect(formatVnd('9007199254740993')).toBe('9.007.199.254.740.993 ₫');
    expect(formatVnd(9_007_199_254_740_993n)).toBe('9.007.199.254.740.993 ₫');
  });

  it('renders blank/nullish as 0 ₫', () => {
    expect(formatVnd(null)).toBe('0 ₫');
    expect(formatVnd(undefined)).toBe('0 ₫');
    expect(formatVnd('')).toBe('0 ₫');
  });
});

describe('formatVndCompact', () => {
  it('produces the tỷ/tr/N shape with one decimal', () => {
    expect(formatVndCompact('1234567')).toBe('1,2 tr');
    expect(formatVndCompact('950000')).toBe('950 N');
    expect(formatVndCompact('12000000000')).toBe('12 tỷ');
    expect(formatVndCompact('-1234567')).toBe('-1,2 tr');
  });

  it('falls back to the full format below one thousand', () => {
    expect(formatVndCompact('500')).toBe('500 ₫');
    expect(formatVndCompact('0')).toBe('0 ₫');
  });
});

describe('formatDiscount', () => {
  it('keeps a percent whole and formats a fixed amount as VND', () => {
    expect(formatDiscount('percent', '20')).toBe('20%');
    expect(formatDiscount('fixed', '50000')).toBe('50.000 ₫');
  });
});

describe('formatPercent', () => {
  it('uses a comma decimal', () => {
    expect(formatPercent(12.5)).toBe('12,5%');
    expect(formatPercent(30)).toBe('30%');
  });
});

describe('timezone-pinned dates', () => {
  it('renders an instant on its Asia/Ho_Chi_Minh wall-clock day, not the host tz', () => {
    // 2026-07-15T22:00Z is already 2026-07-16 05:00 in +07:00.
    const iso = '2026-07-15T22:00:00.000Z';
    expect(formatDate(iso)).toBe('16/07/2026');
    // vi-VN renders a combined date+time time-first — the same order the former
    // tenant/admin formatDateTime produced (identical locale + fields).
    expect(formatDateTime(iso)).toBe('05:00 16/07/2026');
    expect(formatTime(iso)).toBe('05:00');
  });

  it('renders nullish/invalid as an em dash', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatTime('not-a-date')).toBe('—');
  });
});
