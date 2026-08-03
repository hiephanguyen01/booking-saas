import { favoriteToggleResponseSchema, toggleFavoriteInputSchema } from '@booking/contracts';
import { data } from 'react-router';
import { apiPost } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import { formRequestFailureStatus, readFormRequestBody } from '~/lib/server/form-request.server';
import { errorStatus } from '~/lib/http-status';
import { apiPaths } from '~/constants/api-paths';

const CLIENT_MUTATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_FAVORITE_FORM_BYTES = 8 * 1024;

/**
 * Persists a heart toggle. The client only reaches here when authenticated
 * (logged-out clicks open a dialog), but an unauthenticated POST still returns
 * 401 rather than redirecting a fetcher.
 */
export async function handleFavoritesToggleAction(request: Request) {
  const body = await readFormRequestBody(request, MAX_FAVORITE_FORM_BYTES);
  if (!body.ok) {
    return data(
      { ok: false as const, error: 'invalid', clientMutationId: null },
      { status: formRequestFailureStatus(body.code) },
    );
  }

  const form = body.value;
  const rawMutationId = form.get('clientMutationId');
  const clientMutationId =
    typeof rawMutationId === 'string' && CLIENT_MUTATION_ID_RE.test(rawMutationId)
      ? rawMutationId
      : null;

  if (!clientMutationId) {
    return data({ ok: false as const, error: 'invalid', clientMutationId: null }, { status: 400 });
  }

  const auth = getOptionalAuth();
  if (!auth) {
    return data({ ok: false as const, error: 'unauthorized', clientMutationId }, { status: 401 });
  }

  const parsed = toggleFavoriteInputSchema.safeParse({
    target: form.get('target'),
    targetId: form.get('targetId'),
    intent: form.get('intent'),
  });
  if (!parsed.success) {
    return data({ ok: false as const, error: 'invalid', clientMutationId }, { status: 400 });
  }

  const result = await apiPost(
    request,
    apiPaths.customer.favorites,
    parsed.data,
    auth.session.accessToken,
    {
      schema: favoriteToggleResponseSchema,
    },
  );
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
