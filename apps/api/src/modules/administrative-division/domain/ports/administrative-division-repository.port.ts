import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';

export const ADMINISTRATIVE_DIVISION_REPOSITORY = Symbol('ADMINISTRATIVE_DIVISION_REPOSITORY');

export interface ResolvedAdministrativeAddress {
  province: AdministrativeProvince;
  ward: AdministrativeWard;
}

export interface IAdministrativeDivisionRepository {
  listProvinces(): Promise<AdministrativeProvince[]>;
  listWards(provinceCode: string): Promise<AdministrativeWard[]>;
  findWardInProvince(
    provinceCode: string,
    wardCode: string,
  ): Promise<ResolvedAdministrativeAddress | null>;
}
