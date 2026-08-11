import {
  createTaxDocumentUploadInputSchema,
  taxDocumentUploadResponseSchema,
  type TaxDocumentUploadResponse,
} from '@booking/contracts';
import type { Route } from './+types/tax-documents.presign';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiPost } from '~/lib/api.server';
import { apiPaths } from '~/constants/api-paths';

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export async function action({ request }: Route.ActionArgs): Promise<Response> {
  const { auth, can } = await requireTenant(request);
  if (!can('tenant.payouts.manage')) {
    return json({ message: 'Bạn không có quyền tải chứng từ thuế.' }, 403);
  }

  const parsed = createTaxDocumentUploadInputSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return json({ message: 'Chỉ chấp nhận tệp PDF tối đa 10 MB.' }, 400);
  }

  const result = await apiPost<TaxDocumentUploadResponse>(
    apiPaths.tenant.taxDocumentUpload,
    parsed.data,
    auth,
    { signal: request.signal, schema: taxDocumentUploadResponseSchema },
  );
  if (!result.ok || !result.data) {
    return json(
      { message: result.error ?? 'Không thể tạo liên kết tải chứng từ.' },
      result.status || 400,
    );
  }
  return json(result.data, 200);
}
