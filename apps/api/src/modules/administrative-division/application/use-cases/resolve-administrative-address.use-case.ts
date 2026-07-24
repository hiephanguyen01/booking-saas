import { Inject, Injectable } from '@nestjs/common';
import {
  ADMINISTRATIVE_DIVISION_REPOSITORY,
  type IAdministrativeDivisionRepository,
  type ResolvedAdministrativeAddress,
} from '../../domain/ports/administrative-division-repository.port';
import { AdministrativeAddress } from '../../domain/value-objects/administrative-address.value-object';

@Injectable()
export class ResolveAdministrativeAddressUseCase {
  constructor(
    @Inject(ADMINISTRATIVE_DIVISION_REPOSITORY)
    private readonly divisions: IAdministrativeDivisionRepository,
  ) {}

  async execute(provinceCode: string, wardCode: string): Promise<ResolvedAdministrativeAddress> {
    const candidates = await this.divisions.findAddressCandidates(provinceCode, wardCode);
    return AdministrativeAddress.resolve(candidates.province, candidates.ward);
  }
}
