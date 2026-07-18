import { data as routeData } from 'react-router';
import {
  addDomainInputSchema,
  themeConfigSchema,
  type DomainResponse,
  type TenantThemeResponse,
} from '@booking/contracts';
import { apiDelete, apiPatch, apiPost, type ApiAuth } from '~/lib/api.server';
import { TENANT_FLAGS_PATH, type TenantFlags } from '~/features/tenant/lib/flags';

/**
 * The tenant settings route's multi-intent action, kept out of the route module.
 * Handles: theme save + domain add (JSON via GenericForm), and the formData
 * intents (partner-promotions flag toggle, domain verify, domain delete).
 */
export async function handleSettingsAction(request: Request, auth: ApiAuth) {
  const contentType = request.headers.get('content-type') ?? '';

  // Both the theme editor and the domain-add form submit JSON via GenericForm.
  // They carry disjoint keys, so `hostname` disambiguates the domain payload.
  if (contentType.includes('application/json')) {
    const body: unknown = await request.json();

    if (body && typeof body === 'object' && 'hostname' in body) {
      const parsed = addDomainInputSchema.safeParse(body);
      if (!parsed.success) {
        return routeData(
          { form: 'domain', fieldErrors: parsed.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      const res = await apiPost<DomainResponse>('/tenant/domains', parsed.data, auth);
      if (!res.ok)
        return routeData(
          { form: 'domain', error: res.error ?? 'Không thêm được tên miền.' },
          { status: 400 },
        );
      return { form: 'domain', ok: true };
    }

    const parsed = themeConfigSchema.safeParse(body);
    if (!parsed.success) {
      return routeData(
        { form: 'theme', fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const res = await apiPatch<TenantThemeResponse>(
      '/tenant/theme',
      { themeConfig: parsed.data },
      auth,
    );
    if (!res.ok)
      return routeData(
        { form: 'theme', error: res.error ?? 'Không lưu được giao diện.' },
        { status: 400 },
      );
    return { form: 'theme', ok: true };
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent'));

  if (intent === 'toggle-partner-promos') {
    const enabled = formData.get('partnerPromotionsEnabled') === 'true';
    const res = await apiPatch<TenantFlags>(
      TENANT_FLAGS_PATH,
      { partnerPromotionsEnabled: enabled },
      auth,
    );
    if (!res.ok)
      return routeData(
        { form: 'flags', error: res.error ?? 'Không lưu được cài đặt.' },
        { status: 400 },
      );
    return { form: 'flags', ok: true };
  }

  if (intent === 'set-default-cancellation-policy') {
    const raw = String(formData.get('policyId') ?? '');
    const res = await apiPatch(
      '/tenant/settings/default-cancellation-policy',
      { policyId: raw === '' ? null : raw },
      auth,
    );
    if (!res.ok)
      return routeData(
        { form: 'cancellation-default', error: res.error ?? 'Không lưu được chính sách mặc định.' },
        { status: 400 },
      );
    return { form: 'cancellation-default', ok: true };
  }

  if (intent === 'verify-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPost<DomainResponse>(`/tenant/domains/${id}/verify`, {}, auth);
    if (!res.ok)
      return routeData(
        { form: 'verify', error: res.error ?? 'Xác minh thất bại. Kiểm tra bản ghi TXT.' },
        { status: 400 },
      );
    return { form: 'verify', ok: true };
  }

  if (intent === 'delete-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiDelete(`/tenant/domains/${id}`, auth);
    if (!res.ok)
      return routeData(
        { form: 'verify', error: res.error ?? 'Không xoá được tên miền.' },
        { status: 400 },
      );
    return { form: 'verify', ok: true };
  }

  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}
