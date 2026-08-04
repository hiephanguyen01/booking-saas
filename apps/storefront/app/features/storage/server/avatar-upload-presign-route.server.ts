import {
  presignUploadResponseSchema,
  uploadContentTypeSchema,
  type PresignUploadResponse,
} from '@booking/contracts';
import { z } from 'zod';
import { requestBodyFailureStatus } from '~/lib/server/request-body.server';
import { apiPost } from '~/lib/server/api.server';
import { getOptionalAuth } from '~/lib/server/auth.server';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { allowedStorageUploadUrl } from '~/features/storage/server/upload-origin.server';
import { MAX_PRESIGN_REQUEST_BYTES, uploadRouteJson } from './upload-route-response.server';
import { apiPaths } from '~/constants/api-paths';

/**
 * Profile-photo upload proxy for the account centre. The `target` is fixed here
 * rather than read from the body: a customer session must not be able to mint a
 * grant into the listing or tenant albums.
 */
const avatarPresignInputSchema = z.object({ contentType: uploadContentTypeSchema });

export async function handleAvatarUploadPresignAction(request: Request): Promise<Response> {
  const auth = getOptionalAuth();
  if (!auth) return uploadRouteJson({ message: 'Authentication required.' }, 401);

  const body = await readJsonRequestBody(request, MAX_PRESIGN_REQUEST_BYTES);
  if (!body.ok) {
    return uploadRouteJson(
      {
        message:
          body.code === 'PAYLOAD_TOO_LARGE'
            ? 'Yêu cầu tải ảnh lên vượt quá kích thước cho phép.'
            : 'Yêu cầu tải ảnh lên không hợp lệ.',
      },
      requestBodyFailureStatus(body.code),
    );
  }

  const parsed = avatarPresignInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return uploadRouteJson({ message: 'Yêu cầu tải ảnh lên không hợp lệ.' }, 400);
  }

  const result = await apiPost<PresignUploadResponse>(
    request,
    apiPaths.uploads.presign,
    { target: 'avatars', contentType: parsed.data.contentType },
    auth.session.accessToken,
    { schema: presignUploadResponseSchema, timeoutMs: 10_000 },
  );
  if (!result.ok || !result.data) {
    return uploadRouteJson(
      { message: result.error ?? 'Không thể tạo liên kết tải ảnh lên.' },
      result.status || 400,
    );
  }

  const uploadUrl = allowedStorageUploadUrl(result.data.uploadUrl);
  if (!uploadUrl) {
    return uploadRouteJson(
      { message: 'Dịch vụ tải lên trả về máy chủ lưu trữ chưa được cho phép.' },
      502,
    );
  }

  return uploadRouteJson({ ...result.data, uploadUrl }, 200);
}
