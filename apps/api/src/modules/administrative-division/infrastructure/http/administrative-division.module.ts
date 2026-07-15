import { Module } from '@nestjs/common';
import { ADMINISTRATIVE_DIVISION_REPOSITORY } from '../../domain/ports/administrative-division-repository.port';
import { ListProvincesUseCase } from '../../application/use-cases/list-provinces.use-case';
import { ListWardsUseCase } from '../../application/use-cases/list-wards.use-case';
import { ResolveAdministrativeAddressUseCase } from '../../application/use-cases/resolve-administrative-address.use-case';
import { PrismaAdministrativeDivisionRepository } from '../repositories/prisma-administrative-division.repository';
import { PublicAdministrativeDivisionController } from './public-administrative-division.controller';

@Module({
  controllers: [PublicAdministrativeDivisionController],
  providers: [
    {
      provide: ADMINISTRATIVE_DIVISION_REPOSITORY,
      useClass: PrismaAdministrativeDivisionRepository,
    },
    ListProvincesUseCase,
    ListWardsUseCase,
    ResolveAdministrativeAddressUseCase,
  ],
  exports: [ResolveAdministrativeAddressUseCase],
})
export class AdministrativeDivisionModule {}
