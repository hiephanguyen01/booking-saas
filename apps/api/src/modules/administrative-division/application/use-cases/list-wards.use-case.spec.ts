import { describe, expect, it } from 'vitest';
import type { AdministrativeWard } from '@booking/contracts';
import { fakePort } from '~testing';
import type { IAdministrativeDivisionRepository } from '../../domain/ports/administrative-division-repository.port';
import { ListWardsUseCase } from './list-wards.use-case';

describe('ListWardsUseCase', () => {
  it('narrows the wards to the requested province', async () => {
    const asked: string[] = [];
    const rows = [] as AdministrativeWard[];
    const useCase = new ListWardsUseCase(
      fakePort<IAdministrativeDivisionRepository>({
        listWards: (provinceCode) => {
          asked.push(provinceCode);
          return Promise.resolve(rows);
        },
      }),
    );

    await expect(useCase.execute('79')).resolves.toBe(rows);
    expect(asked).toEqual(['79']);
  });
});
