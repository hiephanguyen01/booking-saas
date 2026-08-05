import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { z } from 'zod';
import { geocodeAdministrativeAddressResponseSchema } from '@booking/contracts';
import { REDIS } from '../../../../shared/redis/redis.module';
import type {
  GeocodingProviderQuery,
  GeocodingProviderResult,
  IGeocodingProvider,
} from '../../domain/ports/geocoding-provider.port';

const PUBLIC_NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OSM_ATTRIBUTION = {
  label: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
};
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const EMPTY_CACHE_TTL_SECONDS = 60 * 60;
const RATE_LOCK_MS = 1_100;
const RATE_WAIT_MS = 2_500;

const nominatimResponseSchema = z
  .array(
    z.object({
      display_name: z.string().min(1).max(1_000),
      lat: z.string(),
      lon: z.string(),
    }),
  )
  .max(5);

@Injectable()
export class NominatimGeocodingProvider implements IGeocodingProvider {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async geocode(query: GeocodingProviderQuery): Promise<GeocodingProviderResult> {
    const normalizedQuery = [query.address, query.wardName, query.provinceName, 'Việt Nam']
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ');
    const cacheKey = `geocoding:nominatim:${createHash('sha256').update(normalizedQuery).digest('hex')}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          const parsed = geocodeAdministrativeAddressResponseSchema.safeParse(JSON.parse(cached));
          if (parsed.success) return { status: 'ok', ...parsed.data };
        } catch {
          await this.redis.del(cacheKey);
        }
      }

      const hasRateSlot = await this.acquireRateSlot();
      if (!hasRateSlot) return { status: 'busy' };

      const endpoint = new URL(
        process.env.GEOCODING_NOMINATIM_URL?.trim() || PUBLIC_NOMINATIM_ENDPOINT,
      );
      if (!['http:', 'https:'].includes(endpoint.protocol)) return { status: 'unavailable' };

      const userAgent =
        process.env.GEOCODING_USER_AGENT?.trim() ||
        (process.env.NODE_ENV === 'production' ? '' : 'BookingOS-development/1.0');
      if (!userAgent) return { status: 'unavailable' };

      endpoint.searchParams.set('q', normalizedQuery);
      endpoint.searchParams.set('format', 'jsonv2');
      endpoint.searchParams.set('countrycodes', 'vn');
      endpoint.searchParams.set('layer', 'address');
      endpoint.searchParams.set('addressdetails', '0');
      endpoint.searchParams.set('limit', '5');
      endpoint.searchParams.set('accept-language', 'vi');
      const contactEmail = process.env.GEOCODING_CONTACT_EMAIL?.trim();
      if (contactEmail) endpoint.searchParams.set('email', contactEmail);

      const response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'vi',
          'User-Agent': userAgent,
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 429) return { status: 'busy' };
      if (!response.ok) return { status: 'unavailable' };

      const parsed = nominatimResponseSchema.safeParse(await response.json());
      if (!parsed.success) return { status: 'unavailable' };

      const candidates = parsed.data.flatMap((item) => {
        const latitude = Number(item.lat);
        const longitude = Number(item.lon);
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          return [];
        }
        return [
          {
            displayName: item.display_name,
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
          },
        ];
      });
      const result = { candidates, attribution: OSM_ATTRIBUTION };
      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        candidates.length > 0 ? CACHE_TTL_SECONDS : EMPTY_CACHE_TTL_SECONDS,
      );
      return { status: 'ok', ...result };
    } catch {
      return { status: 'unavailable' };
    }
  }

  private async acquireRateSlot(): Promise<boolean> {
    const deadline = Date.now() + RATE_WAIT_MS;
    do {
      const acquired = await this.redis.set(
        'geocoding:nominatim:rate-lock',
        '1',
        'PX',
        RATE_LOCK_MS,
        'NX',
      );
      if (acquired === 'OK') return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return false;
  }
}
