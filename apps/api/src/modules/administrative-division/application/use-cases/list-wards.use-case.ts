import { Inject, Injectable } from '@nestjs/common';
import type { AdministrativeWard } from '@booking/contracts';
import {
  ADMINISTRATIVE_DIVISION_REPOSITORY,
  type IAdministrativeDivisionRepository,
} from '../../domain/ports/administrative-division-repository.port';

@Injectable()
export class ListWardsUseCase {
  constructor(
    @Inject(ADMINISTRATIVE_DIVISION_REPOSITORY)
    private readonly divisions: IAdministrativeDivisionRepository,
  ) {}

  execute(provinceCode: string): Promise<AdministrativeWard[]> {
    return this.divisions.listWards(provinceCode);
  }
}
