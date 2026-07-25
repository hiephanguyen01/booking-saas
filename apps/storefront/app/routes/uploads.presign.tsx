/**
 * Public partner-application upload proxy. Applicants have no dashboard session
 * yet, so this route calls the API's rate-limited endpoint that is hard-scoped to
 * the `partners` storage prefix. The browser then PUTs bytes directly to storage.
 */
import {
  presignUploadInputSchema,
  presignUploadResponseSchema,
  type PresignUploadResponse,
} from '@booking/contracts';
import type { Route } from './+types/uploads.presign';
import { apiFailureStatus, publicPost } from '../lib/api.server';
import { readJsonRequestBody } from '../lib/json-request.server';
import { allowedStorageUploadUrl } from '../lib/upload-origin.server';

const MAX_PRESIGN_REQUEST_BYTES = 16 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const body = await readJsonRequestBody(request, MAX_PRESIGN_REQUEST_BYTES);
  if (!body.ok) {
    return json(
      {
        code: body.code,
        message:
          body.code === 'PAYLOAD_TOO_LARGE'
            ? 'Yêu cầu tải lên vượt quá kích thước cho phép.'
            : 'Yêu cầu tải lên không hợp lệ.',
      },
      body.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400,
    );
  }

  const parsed = presignUploadInputSchema.safeParse(body.value);
  if (!parsed.success || parsed.data.target !== 'partners') {
    return json(
      { code: 'INVALID_UPLOAD_REQUEST', message: 'Yêu cầu tải lên không hợp lệ.' },
      400,
    );
  }

  const result = await publicPost<PresignUploadResponse>(
    request,
    '/uploads/partner-applications/presign',
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
    return json({ code, message }, status);
  }

  const uploadUrl = allowedStorageUploadUrl(result.data.uploadUrl);
  if (!uploadUrl) {
    return json(
      {
        code: 'UNAPPROVED_UPLOAD_ORIGIN',
        message: 'Dịch vụ tải lên trả về máy chủ lưu trữ chưa được cho phép.',
      },
      502,
    );
  }

  return json({ ...result.data, uploadUrl }, 200);
}
