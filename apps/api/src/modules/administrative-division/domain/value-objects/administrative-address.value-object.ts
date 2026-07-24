import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';
import { InvalidAdministrativeDivision } from '../errors/administrative-division-errors';

export class AdministrativeAddress {
  private constructor(
    readonly province: Readonly<AdministrativeProvince>,
    readonly ward: Readonly<AdministrativeWard>,
  ) {}

  static resolve(
    province: AdministrativeProvince | null,
    ward: AdministrativeWard | null,
  ): AdministrativeAddress {
    if (!province || !ward || ward.provinceCode !== province.code) {
      throw new InvalidAdministrativeDivision();
    }
    return Object.freeze(
      new AdministrativeAddress(Object.freeze({ ...province }), Object.freeze({ ...ward })),
    );
  }
}
