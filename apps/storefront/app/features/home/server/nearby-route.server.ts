import {
  nearbyPublicListingsInputSchema,
  nearbyPublicListingsResponseSchema,
  type NearbyPublicListingsResponse,
} from '@booking/contracts';
import { data } from 'react-router';
import { apiPaths } from '~/constants/api-paths';
import { apiFailureStatus, publicPost } from '~/lib/server/api.server';
import { readJsonRequestBody } from '~/lib/server/json-request.server';

const MAX_NEARBY_REQUEST_BYTES = 2_048;

export type NearbyRouteResult = NearbyPublicListingsResponse & {
  type: string;
  error: string | null;
};

export async function handleNearbyAction(request: Request) {
  const body = await readJsonRequestBody(request, MAX_NEARBY_REQUEST_BYTES);
  if (!body.ok) {
    return data<NearbyRouteResult>(
      { type: '', items: [], error: 'INVALID_NEARBY_REQUEST' },
      { status: 400 },
    );
  }
  const parsed = nearbyPublicListingsInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return data<NearbyRouteResult>(
      { type: '', items: [], error: 'INVALID_NEARBY_REQUEST' },
      { status: 400 },
    );
  }

  const result = await publicPost<NearbyPublicListingsResponse>(
    request,
    apiPaths.public.nearbyListings,
    parsed.data,
    { schema: nearbyPublicListingsResponseSchema, timeoutMs: 10_000 },
  );
  if (!result.ok || !result.data) {
    return data<NearbyRouteResult>(
      { type: parsed.data.type, items: [], error: result.error ?? 'NEARBY_UNAVAILABLE' },
      { status: apiFailureStatus(result) },
    );
  }
  return data<NearbyRouteResult>({ type: parsed.data.type, ...result.data, error: null });
}
