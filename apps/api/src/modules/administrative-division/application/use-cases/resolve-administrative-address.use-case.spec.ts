import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { IAdministrativeDivisionRepository } from '../../domain/ports/administrative-division-repository.port';
import { ResolveAdministrativeAddressUseCase } from './resolve-administrative-address.use-case';

const resolved = {
  province: { code: '79', name: 'Thành phố Hồ Chí Minh', type: 'municipality' as const },
  ward: {
    code: '26740',
    provinceCode: '79',
    name: 'Phường Sài Gòn',
    type: 'ward' as const,
  },
};

describe('ResolveAdministrativeAddressUseCase', () => {
  it('returns the canonical province and ward pair', async () => {
    const repository = {
      findWardInProvince: vi.fn().mockResolvedValue(resolved),
    } as unknown as IAdministrativeDivisionRepository;
    const useCase = new ResolveAdministrativeAddressUseCase(repository);

    await expect(useCase.execute('79', '26740')).resolves.toEqual(resolved);
    expect(repository.findWardInProvince).toHaveBeenCalledWith('79', '26740');
  });

  it('rejects an unknown or cross-province ward pair with a stable error code', async () => {
    const repository = {
      findWardInProvince: vi.fn().mockResolvedValue(null),
    } as unknown as IAdministrativeDivisionRepository;
    const useCase = new ResolveAdministrativeAddressUseCase(repository);

    const error = await useCase.execute('79', '00004').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_ADMINISTRATIVE_DIVISION',
    });
  });
});
