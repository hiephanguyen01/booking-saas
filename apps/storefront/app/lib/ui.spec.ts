import { describe, expect, it } from 'vitest';
import { formatListingLocation } from './ui';

describe('formatListingLocation', () => {
  it('shows the administrative area on cards', () => {
    expect(
      formatListingLocation({
        address: '12 Nguyễn Huệ',
        wardName: 'Phường Sài Gòn',
        provinceName: 'Thành phố Hồ Chí Minh',
      }),
    ).toBe('Phường Sài Gòn, Thành phố Hồ Chí Minh');
  });

  it('includes the detailed address on detail pages', () => {
    expect(
      formatListingLocation(
        {
          address: '12 Nguyễn Huệ',
          wardName: 'Phường Sài Gòn',
          provinceName: 'Thành phố Hồ Chí Minh',
        },
        'full',
      ),
    ).toBe('12 Nguyễn Huệ, Phường Sài Gòn, Thành phố Hồ Chí Minh');
  });

  it('falls back to the legacy working area without duplicates', () => {
    expect(
      formatListingLocation({
        workingArea: 'Quận 1',
        wardName: 'Quận 1',
      }),
    ).toBe('Quận 1');
  });
});
