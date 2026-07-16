import { describe, expect, it } from 'vitest';
import { maskPhone } from './mask-phone';

describe('maskPhone', () => {
  it('masks the middle of a normal VN 10-digit mobile', () => {
    expect(maskPhone('0912345678')).toBe('0912•••678');
  });

  it('keeps the output the same length as the input', () => {
    expect(maskPhone('0912345678')).toHaveLength('0912345678'.length);
  });

  it('masks an 11-digit number, growing the mask rather than revealing more', () => {
    expect(maskPhone('09123456789')).toBe('0912••••789');
  });

  describe('short numbers', () => {
    it('masks a short number completely rather than revealing head+tail', () => {
      expect(maskPhone('12345')).toBe('•••••');
    });

    it('masks a number of exactly HEAD+TAIL length completely', () => {
      // 7 chars: revealing 4 + 3 would leak the whole thing.
      expect(maskPhone('1234567')).toBe('•••••••');
    });

    it('reveals nothing at all for a 1-character value', () => {
      expect(maskPhone('7')).toBe('•');
    });

    it('starts masking the middle only once there is a middle to mask', () => {
      expect(maskPhone('12345678')).toBe('1234•678');
    });
  });

  describe('null / empty', () => {
    it('returns null for null', () => {
      expect(maskPhone(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(maskPhone(undefined)).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(maskPhone('')).toBeNull();
    });

    it('returns null for a whitespace-only string', () => {
      expect(maskPhone('   ')).toBeNull();
    });
  });

  describe('non-digits', () => {
    it('masks a formatted international number into a non-contactable string', () => {
      expect(maskPhone('+84 912 345 678')).toBe('+84 ••••••••678');
    });

    it('masks separators positionally, never revealing the middle digits', () => {
      const masked = maskPhone('0912-345-678');
      expect(masked).toBe('0912•••••678');
      expect(masked).not.toContain('345');
    });

    it('trims surrounding whitespace before masking', () => {
      expect(maskPhone('  0912345678  ')).toBe('0912•••678');
    });
  });

  it('never leaks the full number for any plausible input', () => {
    for (const raw of ['0912345678', '+84912345678', '84.912.345.678', '0987654321']) {
      expect(maskPhone(raw)).not.toBe(raw);
    }
  });
});
