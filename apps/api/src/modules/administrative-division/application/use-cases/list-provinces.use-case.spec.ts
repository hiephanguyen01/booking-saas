import { describe, expect, it } from 'vitest';
import type { AdministrativeProvince } from '@booking/contracts';
import { fakePort } from '~testing';
import type { IAdministrativeDivisionRepository } from '../../domain/ports/administrative-division-repository.port';
import { ListProvincesUseCase } from './list-provinces.use-case';

describe('ListProvincesUseCase', () => {
  it('reads the national list with no tenant scope at all', async () => {
    // Administrative divisions are global reference data: no `tenant_id`, no RLS,
    // and therefore no `forTenant`. Scoping this would empty it.
    const rows = [] as AdministrativeProvince[];
    const useCase = new ListProvincesUseCase(
      fakePort<IAdministrativeDivisionRepository>({ listProvinces: () => Promise.resolve(rows) }),
    );

    await expect(useCase.execute()).resolves.toBe(rows);
  });
});
