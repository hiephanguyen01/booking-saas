import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ADMINISTRATIVE_DIVISION_REPOSITORY,
  type IAdministrativeDivisionRepository,
  type ResolvedAdministrativeAddress,
} from '../../domain/ports/administrative-division-repository.port';

@Injectable()
export class ResolveAdministrativeAddressUseCase {
  constructor(
    @Inject(ADMINISTRATIVE_DIVISION_REPOSITORY)
    private readonly divisions: IAdministrativeDivisionRepository,
  ) {}

  async execute(provinceCode: string, wardCode: string): Promise<ResolvedAdministrativeAddress> {
    const resolved = await this.divisions.findWardInProvince(provinceCode, wardCode);
    if (!resolved) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_ADMINISTRATIVE_DIVISION',
        message: 'The selected ward does not belong to the selected province',
      });
    }
    return resolved;
  }
}
