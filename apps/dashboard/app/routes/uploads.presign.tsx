/**
 * Presign proxy (resource route, §4.2). The backend `POST /uploads/presign` is
 * `@AuthenticatedOnly`, but the browser only holds an httpOnly cookie — so the
 * `ImageUpload` component POSTs here, this action replays the auth cookie
 * server-side, and returns the presigned grant. The browser then PUTs the bytes
 * straight to storage. Action-only: no default export, so it renders no UI.
 */
import { presignUploadInputSchema, type PresignUploadResponse } from '@booking/contracts';
import type { Route } from './+types/uploads.presign';
import { requireUser } from '~/lib/auth.server';
import { apiPost, type ApiAuth } from '~/lib/api.server';

/** Native JSON Response — this route is fetched directly by the browser's
 *  ImageUpload (not via an RR fetcher), so the body must be plain JSON. */
function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const user = await requireUser(request);

  const parsed = presignUploadInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ message: 'Yêu cầu tải lên không hợp lệ.' }, 400, {});
  }

  const auth: ApiAuth = {
    token: user.accessToken,
  };

  const res = await apiPost<PresignUploadResponse>('/uploads/presign', parsed.data, auth);

  if (!res.ok || !res.data) {
    return json({ message: res.error ?? 'Không thể tạo liên kết tải lên.' }, res.status || 400, {});
  }
  return json(res.data, 200, {});
}
