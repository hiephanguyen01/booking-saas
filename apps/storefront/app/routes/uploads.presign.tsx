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

const backendUrl = (): string => storefrontEnv.backendUrl;
const PRESIGN_TIMEOUT_MS = 10_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const parsed = presignUploadInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || parsed.data.target !== 'partners') {
    return json({ message: 'Yêu cầu tải lên không hợp lệ.' }, 400);
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
      return json({ message: 'Dịch vụ tải lên phản hồi quá thời gian cho phép.' }, 504);
    }
    return json({ message: 'Dịch vụ tải lên hiện không khả dụng.' }, 503);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'Không thể tạo liên kết tải lên.';
    return json({ message }, response.status);
  }

  const grant = presignUploadResponseSchema.safeParse(body);
  if (!grant.success) {
    return json({ message: 'Dịch vụ tải lên trả về dữ liệu không hợp lệ.' }, 502);
  }

  const payload: PresignUploadResponse = grant.data;
  return json(payload, 200);
}
