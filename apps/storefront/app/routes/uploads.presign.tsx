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
import { storefrontEnv } from '../lib/env.server';
import { allowedStorageUploadUrl } from '../lib/upload-origin.server';

const backendUrl = (): string => storefrontEnv.backendUrl;
const PRESIGN_TIMEOUT_MS = 10_000;

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
  const parsed = presignUploadInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || parsed.data.target !== 'partners') {
    return json(
      { code: 'INVALID_UPLOAD_REQUEST', message: 'Yêu cầu tải lên không hợp lệ.' },
      400,
    );
  }

  const timeoutSignal = AbortSignal.timeout(PRESIGN_TIMEOUT_MS);
  const signal = AbortSignal.any([request.signal, timeoutSignal]);
  let response: Response;
  try {
    response = await fetch(`${backendUrl()}/uploads/partner-applications/presign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(parsed.data),
      signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    if (timeoutSignal.aborted) {
      return json(
        { code: 'UPLOAD_SERVICE_TIMEOUT', message: 'Dịch vụ tải lên phản hồi quá thời gian cho phép.' },
        504,
      );
    }
    return json(
      { code: 'UPLOAD_SERVICE_UNAVAILABLE', message: 'Dịch vụ tải lên hiện không khả dụng.' },
      503,
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Never expose free-form upstream messages from a public unauthenticated
    // proxy. They may contain storage implementation or validation details.
    const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
    return json(
      { code: 'UPLOAD_PRESIGN_FAILED', message: 'Không thể tạo liên kết tải lên.' },
      status,
    );
  }

  const grant = presignUploadResponseSchema.safeParse(body);
  if (!grant.success) {
    return json(
      {
        code: 'INVALID_UPLOAD_SERVICE_RESPONSE',
        message: 'Dịch vụ tải lên trả về dữ liệu không hợp lệ.',
      },
      502,
    );
  }

  const uploadUrl = allowedStorageUploadUrl(grant.data.uploadUrl);
  if (!uploadUrl) {
    return json(
      {
        code: 'UNAPPROVED_UPLOAD_ORIGIN',
        message: 'Dịch vụ tải lên trả về máy chủ lưu trữ chưa được cho phép.',
      },
      502,
    );
  }

  const payload: PresignUploadResponse = { ...grant.data, uploadUrl };
  return json(payload, 200);
}
