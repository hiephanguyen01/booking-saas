import { Inject, Injectable } from '@nestjs/common';
import type {
  GeocodeAdministrativeAddressInput,
  GeocodeAdministrativeAddressResponse,
} from '@booking/contracts';
import {
  GEOCODING_PROVIDER,
  type IGeocodingProvider,
} from '../../domain/ports/geocoding-provider.port';
import { ResolveAdministrativeAddressUseCase } from './resolve-administrative-address.use-case';
import { GeocodingBusyException, GeocodingUnavailableException } from '../geocoding-http-errors';

@Injectable()
export class GeocodeAdministrativeAddressUseCase {
  constructor(
    private readonly resolveAddress: ResolveAdministrativeAddressUseCase,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: IGeocodingProvider,
  ) {}

  async execute(
    input: GeocodeAdministrativeAddressInput,
  ): Promise<GeocodeAdministrativeAddressResponse> {
    const resolved = await this.resolveAddress.execute(input.provinceCode, input.wardCode);
    const result = await this.geocoding.geocode({
      address: input.address,
      wardName: resolved.ward.name,
      provinceName: resolved.province.name,
    });

    if (result.status === 'busy') throw new GeocodingBusyException();
    if (result.status === 'unavailable') throw new GeocodingUnavailableException();

    return {
      candidates: result.candidates,
      attribution: result.attribution,
    };
  }
}
