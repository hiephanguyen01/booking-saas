import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';

export const ADMINISTRATIVE_DIVISION_REPOSITORY = Symbol('ADMINISTRATIVE_DIVISION_REPOSITORY');

export interface ResolvedAdministrativeAddress {
  province: AdministrativeProvince;
  ward: AdministrativeWard;
}

export interface AdministrativeAddressCandidates {
  province: AdministrativeProvince | null;
  ward: AdministrativeWard | null;
}

export interface IAdministrativeDivisionRepository {
  listProvinces(): Promise<AdministrativeProvince[]>;
  listWards(provinceCode: string): Promise<AdministrativeWard[]>;
  findAddressCandidates(
    provinceCode: string,
    wardCode: string,
  ): Promise<AdministrativeAddressCandidates>;
}
