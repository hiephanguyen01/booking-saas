import { favoriteToggleResponseSchema, toggleFavoriteInputSchema } from '@booking/contracts';
import { data } from 'react-router';
import { apiPost } from '../lib/api.server';
import { getOptionalAuth } from '../lib/auth.server';
import { errorStatus } from '../lib/http-status';
import type { Route } from './+types/favorites-toggle';

/**
 * Resource route (action only) that persists a heart toggle. The client only
 * reaches here when authenticated (logged-out clicks open a dialog), but we
 * still guard: an unauthenticated POST returns 401 rather than redirecting a
 * fetcher. `intent` (add|remove) is honoured idempotently by the backend.
 */
export async function action({ request }: Route.ActionArgs) {
  const auth = getOptionalAuth();
  if (!auth) return data({ ok: false as const, error: 'unauthorized' }, { status: 401 });

  const form = await request.formData();
  const parsed = toggleFavoriteInputSchema.safeParse({
    target: form.get('target'),
    targetId: form.get('targetId'),
    intent: form.get('intent'),
  });
  if (!parsed.success) return data({ ok: false as const, error: 'invalid' }, { status: 400 });

  const result = await apiPost(request, '/customer/favorites', parsed.data, auth.session.accessToken, {
    schema: favoriteToggleResponseSchema,
  });
  if (!result.ok) {
    return data({ ok: false as const, error: 'failed' }, { status: errorStatus(result.status) });
  }
  return data({ ok: true as const, favorited: result.data?.favorited ?? null });
}
