import {
  presignUploadInputSchema,
  presignUploadResponseSchema,
  type PresignUploadResponse,
} from '@booking/contracts';
import { requestBodyFailureStatus } from '~/lib/server/request-body.server';
import { apiFailureStatus, publicPost } from '~/lib/server/api.server';
import { readJsonRequestBody } from '~/lib/server/json-request.server';
import { allowedStorageUploadUrl } from '~/features/storage/server/upload-origin.server';
import { MAX_PRESIGN_REQUEST_BYTES, uploadRouteJson } from './upload-route-response.server';
import { apiPaths } from '~/constants/api-paths';

/**
 * Public partner-application upload proxy. Applicants have no dashboard
 * session, so this calls the API endpoint hard-scoped to `partners`.
 */
export async function handlePartnerUploadPresignAction(request: Request): Promise<Response> {
  const body = await readJsonRequestBody(request, MAX_PRESIGN_REQUEST_BYTES);
  if (!body.ok) {
    return uploadRouteJson(
      {
        code: body.code,
        message:
          body.code === 'PAYLOAD_TOO_LARGE'
            ? 'Yêu cầu tải lên vượt quá kích thước cho phép.'
            : 'Yêu cầu tải lên không hợp lệ.',
      },
      requestBodyFailureStatus(body.code),
    );
  }

  const parsed = presignUploadInputSchema.safeParse(body.value);
  if (!parsed.success || parsed.data.target !== 'partners') {
    return uploadRouteJson(
      { code: 'INVALID_UPLOAD_REQUEST', message: 'Yêu cầu tải lên không hợp lệ.' },
      400,
    );
  }

  const result = await publicPost<PresignUploadResponse>(
    request,
    apiPaths.partner.uploadPresign,
    parsed.data,
    { schema: presignUploadResponseSchema, timeoutMs: 10_000 },
  );
  if (!result.ok || !result.data) {
    const status = apiFailureStatus(result);
    const code =
      status === 504
        ? 'UPLOAD_SERVICE_TIMEOUT'
        : status === 503
          ? 'UPLOAD_SERVICE_UNAVAILABLE'
          : 'UPLOAD_PRESIGN_FAILED';
    const message =
      status === 504
        ? 'Dịch vụ tải lên phản hồi quá thời gian cho phép.'
        : status === 503
          ? 'Dịch vụ tải lên hiện không khả dụng.'
          : 'Không thể tạo liên kết tải lên.';
    return uploadRouteJson({ code, message }, status);
  }

  const uploadUrl = allowedStorageUploadUrl(result.data.uploadUrl);
  if (!uploadUrl) {
    return uploadRouteJson(
      {
        code: 'UNAPPROVED_UPLOAD_ORIGIN',
        message: 'Dịch vụ tải lên trả về máy chủ lưu trữ chưa được cho phép.',
      },
      502,
    );
  }

  return uploadRouteJson({ ...result.data, uploadUrl }, 200);
}
