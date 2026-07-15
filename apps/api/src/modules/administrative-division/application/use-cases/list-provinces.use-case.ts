import { Inject, Injectable } from '@nestjs/common';
import type { AdministrativeProvince } from '@booking/contracts';
import {
  ADMINISTRATIVE_DIVISION_REPOSITORY,
  type IAdministrativeDivisionRepository,
} from '../../domain/ports/administrative-division-repository.port';

@Injectable()
export class ListProvincesUseCase {
  constructor(
    @Inject(ADMINISTRATIVE_DIVISION_REPOSITORY)
    private readonly divisions: IAdministrativeDivisionRepository,
  ) {}

  execute(): Promise<AdministrativeProvince[]> {
    return this.divisions.listProvinces();
  }
}
