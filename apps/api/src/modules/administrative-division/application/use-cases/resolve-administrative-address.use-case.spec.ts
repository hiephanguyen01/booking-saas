import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { IAdministrativeDivisionRepository } from '../../domain/ports/administrative-division-repository.port';
import { ResolveAdministrativeAddressUseCase } from './resolve-administrative-address.use-case';

const PROVINCE = { code: '79', name: 'TP. Hồ Chí Minh' };
const WARD = { code: '26734', name: 'Phường Bến Nghé', provinceCode: '79' };

function harness(candidates: { province: unknown; ward: unknown }) {
  const asked: Array<[string, string]> = [];
  return {
    useCase: new ResolveAdministrativeAddressUseCase(
      fakePort<IAdministrativeDivisionRepository>({
        findAddressCandidates: (provinceCode, wardCode) => {
          asked.push([provinceCode, wardCode]);
          return Promise.resolve(candidates as never);
        },
      }),
    ),
    asked,
  };
}

describe('ResolveAdministrativeAddressUseCase', () => {
  it('resolves a province and the ward that belongs to it', async () => {
    const { useCase, asked } = harness({ province: PROVINCE, ward: WARD });

    await expect(useCase.execute('79', '26734')).resolves.toMatchObject({
      province: { code: '79' },
      ward: { code: '26734' },
    });
    expect(asked).toEqual([['79', '26734']]);
  });

  it('refuses an unknown province', async () => {
    const { useCase } = harness({ province: null, ward: WARD });

    await expect(useCase.execute('99', '26734')).rejects.toThrow();
  });

  it('refuses an unknown ward', async () => {
    const { useCase } = harness({ province: PROVINCE, ward: null });

    await expect(useCase.execute('79', '00000')).rejects.toThrow();
  });

  it('refuses a ward that belongs to a different province', async () => {
    // The pair is what identifies an address; accepting a mismatched ward would
    // let a listing claim a district it is not in.
    const { useCase } = harness({
      province: PROVINCE,
      ward: { ...WARD, provinceCode: '01' },
    });

    await expect(useCase.execute('79', '26734')).rejects.toThrow();
  });
});
