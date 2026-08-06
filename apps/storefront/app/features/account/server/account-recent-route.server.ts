import type { PublicListingResponse } from '@booking/contracts';
import { data } from 'react-router';
import {
  groupDetailToCard,
  listingDetailToCard,
} from '~/features/account/lib/recently-viewed-item';
import { viewedRefKey, type ViewedRef } from '~/features/account/lib/recently-viewed-ref';
import {
  clearViewedCookie,
  readViewedKeys,
  readViewedRefs,
  writeViewedCookie,
} from '~/features/account/server/recently-viewed.server';
import { fetchListing, fetchListingGroup } from '~/features/catalog/server/catalog.server';
import { requireCustomerAuth } from '~/lib/server/auth.server';
import { mapWithConcurrency } from '~/lib/server/concurrency.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { isAbortLikeError } from '~/lib/server/optional-data.server';

/** One page of history is one read per entry; keep the fan-out bounded. */
const READ_CONCURRENCY = 6;
const MAX_RECENT_FORM_BYTES = 8 * 1024;

type Resolved =
  | { state: 'ok'; card: PublicListingResponse }
  | { state: 'gone' }
  | { state: 'unavailable' };

export async function loadAccountRecentRoute(request: Request, locale: 'vi' | 'en') {
  // The account layout already guards the area; repeating it keeps this loader
  // correct on its own, the way `loadAccountFavoritesRoute` does.
  requireCustomerAuth(request, locale);

  const refs = await readViewedRefs(request);
  const resolved = await mapWithConcurrency(refs, READ_CONCURRENCY, (ref) =>
    resolveRef(request, ref),
  );

  const items = resolved.flatMap((entry) => (entry.state === 'ok' ? [entry.card] : []));
  const kept = refs.filter((_, index) => resolved[index]!.state !== 'gone').map(viewedRefKey);

  const payload = { locale, items };
  if (kept.length === refs.length) return payload;

  // Self-heal: an entry whose listing was unpublished or deleted leaves the
  // cookie. An entry that merely failed to load stays — a backend hiccup must
  // never erase someone's history.
  return data(payload, { headers: { 'Set-Cookie': await writeViewedCookie(kept) } });
}

/**
 * `publicGetData` returns null only on 404 and throws on everything else, so
 * every read needs a guard.
 *
 * Not `optionalData`: that helper rethrows any Response with status >= 500 so
 * React Router can render the right boundary, which is correct for one optional
 * section of a page but wrong here — this page issues up to twelve independent
 * reads, and a single upstream timeout would 5xx a list whose whole purpose is
 * convenience. Cancellation still propagates.
 */
async function resolveRef(request: Request, ref: ViewedRef): Promise<Resolved> {
  try {
    if (ref.kind === 'group') {
      const group = await fetchListingGroup(request, ref.slug);
      return group ? { state: 'ok', card: groupDetailToCard(group) } : { state: 'gone' };
    }
    const listing = await fetchListing(request, ref.slug);
    return listing ? { state: 'ok', card: listingDetailToCard(listing) } : { state: 'gone' };
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    return { state: 'unavailable' };
  }
}

/**
 * Clear the whole history, or drop one entry. Both only rewrite the cookie, so
 * neither touches the backend; the fetcher's revalidation re-runs the loader
 * and the grid follows.
 */
export async function handleAccountRecentAction(request: Request) {
  const body = await readFormRequestBody(request, MAX_RECENT_FORM_BYTES);
  if (!body.ok) {
    return data({ ok: false as const }, { status: formRequestFailureStatus(body.code) });
  }

  const form = body.value;
  const intent = form.get('intent');

  if (intent === 'clear') {
    return data({ ok: true as const }, { headers: { 'Set-Cookie': await clearViewedCookie() } });
  }

  if (intent !== 'remove') {
    return data({ ok: false as const }, { status: 400 });
  }

  // An unknown key is a no-op rather than an error: the entry may already be
  // gone from a pruning load or from another tab.
  const key = form.get('key');
  const kept = (await readViewedKeys(request)).filter((item) => item !== key);
  return data({ ok: true as const }, { headers: { 'Set-Cookie': await writeViewedCookie(kept) } });
}
