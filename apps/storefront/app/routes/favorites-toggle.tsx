import { favoriteToggleResponseSchema, toggleFavoriteInputSchema } from '@booking/contracts';
import { data } from 'react-router';
import { apiPost } from '../lib/api.server';
import { getOptionalAuth } from '../lib/auth.server';
import { errorStatus } from '../lib/http-status';
import type { Route } from './+types/favorites-toggle';

const CLIENT_MUTATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Resource route (action only) that persists a heart toggle. The client only
 * reaches here when authenticated (logged-out clicks open a dialog), but we
 * still guard: an unauthenticated POST returns 401 rather than redirecting a
 * fetcher. `intent` (add|remove) is honoured idempotently by the backend.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const rawMutationId = form.get('clientMutationId');
  const clientMutationId =
    typeof rawMutationId === 'string' && CLIENT_MUTATION_ID_RE.test(rawMutationId)
      ? rawMutationId
      : null;

  if (!clientMutationId) {
    return data(
      { ok: false as const, error: 'invalid', clientMutationId: null },
      { status: 400 },
    );
  }

  const auth = getOptionalAuth();
  if (!auth) {
    return data(
      { ok: false as const, error: 'unauthorized', clientMutationId },
      { status: 401 },
    );
  }

  const parsed = toggleFavoriteInputSchema.safeParse({
    target: form.get('target'),
    targetId: form.get('targetId'),
    intent: form.get('intent'),
  });
  if (!parsed.success) {
    return data({ ok: false as const, error: 'invalid', clientMutationId }, { status: 400 });
  }

  const result = await apiPost(request, '/customer/favorites', parsed.data, auth.session.accessToken, {
    schema: favoriteToggleResponseSchema,
  });
  if (!result.ok) {
    return data(
      { ok: false as const, error: 'failed', clientMutationId },
      { status: errorStatus(result.status) },
    );
  }
  return data({
    ok: true as const,
    favorited: result.data?.favorited ?? null,
    clientMutationId,
  });
}
