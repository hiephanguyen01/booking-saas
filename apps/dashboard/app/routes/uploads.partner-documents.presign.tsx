import {
  partnerDocumentUploadInputSchema,
  privateDocumentUploadResponseSchema,
  type PrivateDocumentUploadResponse,
} from '@booking/contracts';
import type { Route } from './+types/uploads.partner-documents.presign';
import { apiPaths } from '~/constants/api-paths';
import { requirePartner } from '~/features/partner/server/partner.server';
import { apiPost } from '~/lib/api.server';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const { auth } = await requirePartner(request);
  const parsed = partnerDocumentUploadInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ message: 'Yêu cầu tải tài liệu không hợp lệ.' }, 400);
  }

  const res = await apiPost<PrivateDocumentUploadResponse>(
    apiPaths.partner.profileDocumentPresign,
    parsed.data,
    auth,
    { signal: request.signal, schema: privateDocumentUploadResponseSchema },
  );
  if (!res.ok || !res.data) {
    return json({ message: res.error ?? 'Không thể tạo liên kết tải tài liệu.' }, res.status || 400);
  }
  return json(res.data, 200);
}
