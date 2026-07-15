import { describe, expect, it } from 'vitest';
import {
  administrativeProvinceSchema,
  administrativeAddressInputSchema,
  administrativeWardSchema,
  listAdministrativeWardsQuerySchema,
} from './administrative-division';

describe('administrative division contracts', () => {
  it('preserves leading zeroes in official codes', () => {
    expect(
      administrativeProvinceSchema.parse({
        code: '01',
        name: 'Thành phố Hà Nội',
        type: 'municipality',
      }).code,
    ).toBe('01');
    expect(
      administrativeWardSchema.parse({
        code: '00004',
        provinceCode: '01',
        name: 'Phường Ba Đình',
        type: 'ward',
      }).code,
    ).toBe('00004');
  });

  it.each(['1', '001', 'ab'])('rejects malformed province code %s', (provinceCode) => {
    expect(listAdministrativeWardsQuerySchema.safeParse({ provinceCode }).success).toBe(false);
  });

  it('requires a complete two-level address', () => {
    expect(
      administrativeAddressInputSchema.parse({
        provinceCode: '79',
        wardCode: '26740',
        address: '12 Nguyễn Huệ',
      }),
    ).toEqual({ provinceCode: '79', wardCode: '26740', address: '12 Nguyễn Huệ' });
    expect(
      administrativeAddressInputSchema.safeParse({
        provinceCode: '79',
        wardCode: '26740',
        address: '   ',
      }).success,
    ).toBe(false);
  });
});
