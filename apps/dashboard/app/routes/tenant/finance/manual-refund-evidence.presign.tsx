import {
  createManualRefundEvidenceUploadInputSchema,
  manualRefundEvidenceUploadResponseSchema,
  uuidSchema,
  type ManualRefundEvidenceUploadResponse,
} from '@booking/contracts';
import type { Route } from './+types/manual-refund-evidence.presign';
import { apiPaths } from '~/constants/api-paths';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { apiPost } from '~/lib/api.server';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function action({ request, params }: Route.ActionArgs): Promise<Response> {
  const { auth } = await requireTenant(request, 'tenant.refunds.prepare');
  const operationId = uuidSchema.safeParse(params.operationId);
  const version = Number(new URL(request.url).searchParams.get('version'));
  const body = await request.json().catch(() => ({}));
  const parsed = createManualRefundEvidenceUploadInputSchema.safeParse({
    ...(body && typeof body === 'object' ? body : {}),
    expectedVersion: version,
  });
  if (!operationId.success || !parsed.success) {
    return json({ message: 'Chỉ chấp nhận PDF, JPEG hoặc PNG tối đa 10 MB.' }, 400);
  }

  const result = await apiPost<ManualRefundEvidenceUploadResponse>(
    apiPaths.tenant.manualRefundAction(operationId.data, 'evidence-upload'),
    parsed.data,
    auth,
    { signal: request.signal, schema: manualRefundEvidenceUploadResponseSchema },
  );
  if (!result.ok || !result.data) {
    return json(
      { message: result.error ?? 'Không thể tạo liên kết tải biên lai.' },
      result.status || 400,
    );
  }
  return json(result.data, 200);
}
