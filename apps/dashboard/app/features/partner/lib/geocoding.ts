import type { GeocodeAdministrativeAddressInput, GeocodingCandidate } from '@booking/contracts';

export interface GeocodeActionResult {
  query: GeocodeAdministrativeAddressInput | null;
  candidates: GeocodingCandidate[];
  attribution: { label: string; url: string } | null;
  error: string | null;
}
