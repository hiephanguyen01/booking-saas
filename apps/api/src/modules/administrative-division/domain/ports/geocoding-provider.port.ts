import type { GeocodingCandidate } from '@booking/contracts';

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');

export interface GeocodingProviderQuery {
  address: string;
  wardName: string;
  provinceName: string;
}

export type GeocodingProviderResult =
  | {
      status: 'ok';
      candidates: GeocodingCandidate[];
      attribution: { label: string; url: string };
    }
  | { status: 'busy' }
  | { status: 'unavailable' };

export interface IGeocodingProvider {
  geocode(query: GeocodingProviderQuery): Promise<GeocodingProviderResult>;
}
