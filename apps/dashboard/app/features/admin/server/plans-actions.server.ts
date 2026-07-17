import { data } from 'react-router';
import { createPlanInputSchema, updatePlanInputSchema, type PlanResponse } from '@booking/contracts';
import { apiDelete, apiPatch, apiPost } from '~/lib/api.server';
import { requirePlatform } from './admin.server';

/** Which form/action a result belongs to, so an error stays in its own surface. */
export interface PlansActionResult {
  scope: 'create' | 'update' | 'delete';
  id?: string;
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Partial<Record<string, string[] | undefined>>;
}

/**
 * The full `/admin/plans` action: create/update submit JSON (the edit form
 * injects the plan `id`, which discriminates update from create); delete
 * submits urlencoded FormData with `intent=delete`.
 */
export async function handlePlansAction(request: Request) {
  const { auth } = await requirePlatform(request, 'platform.plans.manage');
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();

    // The edit form injects the plan `id`; its presence discriminates update from create.
    if (body && typeof body === 'object' && 'id' in body) {
      const { id, ...rest } = body as { id: string } & Record<string, unknown>;
      const parsed = updatePlanInputSchema.safeParse(rest);
      if (!parsed.success) {
        return data<PlansActionResult>(
          { scope: 'update', id, fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPatch<PlanResponse>(`/admin/plans/${id}`, parsed.data, auth);
      if (!res.ok) {
        return data<PlansActionResult>(
          { scope: 'update', id, error: res.error, fieldErrors: res.errors },
          { status: 400 },
        );
      }
      return data<PlansActionResult>({
        scope: 'update',
        id,
        ok: true,
        message: `Đã cập nhật gói “${res.data?.name}”.`,
      });
    }

    const parsed = createPlanInputSchema.safeParse(body);
    if (!parsed.success) {
      return data<PlansActionResult>(
        { scope: 'create', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPost<PlanResponse>('/admin/plans', parsed.data, auth);
    if (!res.ok) {
      return data<PlansActionResult>(
        { scope: 'create', error: res.error, fieldErrors: res.errors },
        { status: 400 },
      );
    }
    return data<PlansActionResult>({
      scope: 'create',
      ok: true,
      message: `Đã tạo gói “${res.data?.name}”.`,
    });
  }

  // Delete submits urlencoded FormData.
  const form = await request.formData();
  if (String(form.get('intent')) === 'delete') {
    const id = String(form.get('id') ?? '');
    const res = await apiDelete(`/admin/plans/${id}`, auth);
    if (!res.ok) {
      const message =
        res.code === 'PLAN_HAS_SUBSCRIBERS' || res.code === 'PLAN_HAS_SUBSCRIPTION_HISTORY'
          ? 'Không thể xoá gói đang (hoặc đã từng) có người đăng ký. Hãy tắt gói thay vì xoá.'
          : (res.error ?? 'Không xoá được gói.');
      return data<PlansActionResult>({ scope: 'delete', id, error: message }, { status: 400 });
    }
    return data<PlansActionResult>({ scope: 'delete', id, ok: true, message: 'Đã xoá gói.' });
  }

  return data<PlansActionResult>(
    { scope: 'create', error: 'Hành động không hợp lệ.' },
    { status: 400 },
  );
}
