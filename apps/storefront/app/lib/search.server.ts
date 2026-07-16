import type { PublicListingResponse } from '@booking/contracts';

/** Suggestions are derived from the batched catalog response; no detail-page fan-out. */
export async function deriveLocationSuggestions(
  _request: Request,
  candidates: PublicListingResponse[],
): Promise<string[]> {
  return [
    ...new Set(
      candidates
        .flatMap((item) => [item.wardName, item.provinceName, item.address])
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 20);
}
