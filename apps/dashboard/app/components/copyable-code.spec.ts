import { describe, expect, it, vi } from 'vitest';

import { copyAriaLabel, copyText } from './copyable-code';

describe('copyAriaLabel', () => {
  it('names what is copied and reflects the copied state', () => {
    expect(copyAriaLabel(false)).toBe('Sao chép');
    expect(copyAriaLabel(true)).toBe('Đã sao chép');
    expect(copyAriaLabel(false, 'mã đặt chỗ')).toBe('Sao chép mã đặt chỗ');
    expect(copyAriaLabel(true, 'mã đặt chỗ')).toBe('Đã sao chép mã đặt chỗ');
  });
});

describe('copyText', () => {
  it('writes the value and resolves true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyText('BK-123', { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('BK-123');
  });

  it('resolves false when the clipboard rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    await expect(copyText('BK-123', { writeText })).resolves.toBe(false);
  });

  it('resolves false when no clipboard is available', async () => {
    await expect(copyText('BK-123', undefined)).resolves.toBe(false);
  });
});
