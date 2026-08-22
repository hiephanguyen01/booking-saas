import { describe, expect, it } from 'vitest';
import type { GeocodeAdministrativeAddressInput } from '@booking/contracts';
import { fakeCollaborator, fakePort } from '~testing';
import type { IGeocodingProvider } from '../../domain/ports/geocoding-provider.port';
import { GeocodingBusyException, GeocodingUnavailableException } from '../geocoding-http-errors';
import { GeocodeAdministrativeAddressUseCase } from './geocode-administrative-address.use-case';
import type { ResolveAdministrativeAddressUseCase } from './resolve-administrative-address.use-case';

const input = {
  provinceCode: '79',
  wardCode: '26734',
  address: '12 Nguyễn Huệ',
} as GeocodeAdministrativeAddressInput;

function harness(status: 'ok' | 'busy' | 'unavailable' = 'ok') {
  const queries: unknown[] = [];
  const useCase = new GeocodeAdministrativeAddressUseCase(
    fakeCollaborator<ResolveAdministrativeAddressUseCase>({
      execute: () =>
        Promise.resolve({
          province: { code: '79', name: 'TP. Hồ Chí Minh' },
          ward: { code: '26734', name: 'Phường Bến Nghé' },
        }),
    }),
    fakePort<IGeocodingProvider>({
      geocode: (query) => {
        queries.push(query);
        return Promise.resolve({
          status,
          candidates: status === 'ok' ? [{ lat: 10.77, lng: 106.7 }] : [],
          attribution: 'OpenStreetMap',
        } as never);
      },
    }),
  );
  return { useCase, queries };
}

describe('GeocodeAdministrativeAddressUseCase', () => {
  it('sends the resolved official names, not the codes, to the provider', async () => {
    // A geocoder matches on text; handing it "79" instead of "TP. Hồ Chí Minh"
    // silently degrades every result.
    const { useCase, queries } = harness();

    await expect(useCase.execute(input)).resolves.toMatchObject({ attribution: 'OpenStreetMap' });
    expect(queries).toEqual([
      {
        address: '12 Nguyễn Huệ',
        wardName: 'Phường Bến Nghé',
        provinceName: 'TP. Hồ Chí Minh',
      },
    ]);
  });

  it('surfaces provider rate-limiting as its own error', async () => {
    // Busy is retryable and unavailable is not; collapsing them would have the
    // client give up on a request that would succeed a second later.
    const { useCase } = harness('busy');

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(GeocodingBusyException);
  });

  it('surfaces a provider outage as its own error', async () => {
    const { useCase } = harness('unavailable');

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(GeocodingUnavailableException);
  });
});
