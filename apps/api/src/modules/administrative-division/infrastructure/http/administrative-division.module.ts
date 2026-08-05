import { Module } from '@nestjs/common';
import { ADMINISTRATIVE_DIVISION_REPOSITORY } from '../../domain/ports/administrative-division-repository.port';
import { ListProvincesUseCase } from '../../application/use-cases/list-provinces.use-case';
import { ListWardsUseCase } from '../../application/use-cases/list-wards.use-case';
import { ResolveAdministrativeAddressUseCase } from '../../application/use-cases/resolve-administrative-address.use-case';
import { GeocodeAdministrativeAddressUseCase } from '../../application/use-cases/geocode-administrative-address.use-case';
import { GEOCODING_PROVIDER } from '../../domain/ports/geocoding-provider.port';
import { PrismaAdministrativeDivisionRepository } from '../repositories/prisma-administrative-division.repository';
import { NominatimGeocodingProvider } from '../services/nominatim-geocoding.provider';
import { PartnerAdministrativeDivisionController } from './partner-administrative-division.controller';
import { PublicAdministrativeDivisionController } from './public-administrative-division.controller';

@Module({
  controllers: [PublicAdministrativeDivisionController, PartnerAdministrativeDivisionController],
  providers: [
    {
      provide: ADMINISTRATIVE_DIVISION_REPOSITORY,
      useClass: PrismaAdministrativeDivisionRepository,
    },
    ListProvincesUseCase,
    ListWardsUseCase,
    ResolveAdministrativeAddressUseCase,
    GeocodeAdministrativeAddressUseCase,
    { provide: GEOCODING_PROVIDER, useClass: NominatimGeocodingProvider },
  ],
  exports: [ResolveAdministrativeAddressUseCase],
})
export class AdministrativeDivisionModule {}
