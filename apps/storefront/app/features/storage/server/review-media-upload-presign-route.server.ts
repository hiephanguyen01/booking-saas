import {
  presignUploadResponseSchema,
  reviewMediaPresignInputSchema,
  type PresignUploadResponse,
} from '@booking/contracts';
import { apiPost } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { allowedStorageUploadUrl } from '~/features/storage/server/upload-origin.server';
import { uploadRouteJson } from './upload-route-response.server';

const MAX_PRESIGN_REQUEST_BYTES = 16 * 1024;

export async function handleReviewMediaUploadPresignAction(request: Request): Promise<Response> {
  const auth = getOptionalAuth();
  if (!auth) return uploadRouteJson({ message: 'Authentication required.' }, 401);

  const body = await readJsonRequestBody(request, MAX_PRESIGN_REQUEST_BYTES);
  if (!body.ok) {
    return uploadRouteJson(
      {
        message:
          body.code === 'PAYLOAD_TOO_LARGE'
            ? 'Review media upload request is too large.'
            : 'Invalid review media upload request.',
      },
      body.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400,
    );
  }

  const parsed = reviewMediaPresignInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return uploadRouteJson({ message: 'Invalid review media upload request.' }, 400);
  }

  const result = await apiPost<PresignUploadResponse>(
    request,
    '/customer/reviews/media/presign',
    parsed.data,
    auth.session.accessToken,
    { schema: presignUploadResponseSchema },
  );
  if (!result.ok || !result.data) {
    return uploadRouteJson(
      { message: result.error ?? 'Unable to prepare the upload.' },
      result.status || 400,
    );
  }

  const uploadUrl = allowedStorageUploadUrl(result.data.uploadUrl);
  if (!uploadUrl) {
    return uploadRouteJson(
      { message: 'The upload service returned an unapproved storage origin.' },
      502,
    );
  }

  return uploadRouteJson({ ...result.data, uploadUrl }, 200);
}
