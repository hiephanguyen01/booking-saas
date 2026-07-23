import {
  presignUploadResponseSchema,
  reviewMediaPresignInputSchema,
  type PresignUploadResponse,
} from '@booking/contracts';
import { apiPost } from '../lib/api.server';
import { getOptionalAuth } from '../lib/auth.server';
import { allowedStorageUploadUrl } from '../lib/upload-origin.server';
import type { Route } from './+types/uploads.reviews.presign';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const auth = getOptionalAuth();
  if (!auth) return json({ message: 'Authentication required.' }, 401);

  const parsed = reviewMediaPresignInputSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) return json({ message: 'Invalid review media upload request.' }, 400);

  const result = await apiPost<PresignUploadResponse>(
    request,
    '/customer/reviews/media/presign',
    parsed.data,
    auth.session.accessToken,
    { schema: presignUploadResponseSchema },
  );
  if (!result.ok || !result.data) {
    return json({ message: result.error ?? 'Unable to prepare the upload.' }, result.status || 400);
  }

  const uploadUrl = allowedStorageUploadUrl(result.data.uploadUrl);
  if (!uploadUrl) {
    return json({ message: 'The upload service returned an unapproved storage origin.' }, 502);
  }

  return json({ ...result.data, uploadUrl }, 200);
}
