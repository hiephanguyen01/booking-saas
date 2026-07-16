import {
  addDomainInputSchema,
  themeConfigSchema,
  type AddDomainInput,
  type DomainResponse,
  type ThemeConfigInput,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { FAVICON_ACCEPT } from '@booking/ui/components/form/image-upload';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { CheckCircle2, CircleAlert, Clock, Globe, Trash2 } from 'lucide-react';
import { Form, data as routeData, useNavigation, useSubmit } from 'react-router';
import { Switch } from '@booking/ui/components/ui/switch';
import { apiDelete, apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { useTenantArea } from '../area-context';
import { PageHeader } from '~/components/page-header';
import { formatDate } from '~/lib/format';
import { requireTenant } from '../tenant.server';
import { TENANT_FLAGS_PATH, toPartnerPromotionsState, type TenantFlags } from './flags';
import type { Route } from './+types/_index';

interface TenantThemeResponse {
  name: string;
  vertical: string;
  defaultLocale: string;
  themeConfig: Record<string, unknown>;
}

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Cài đặt · Tenant · Bookify' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request);
  const [themeRes, domainsRes, flagsRes] = await Promise.all([
    can('tenant.theme.manage')
      ? apiGet<TenantThemeResponse>('/tenant/theme', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<DomainResponse[]>('/tenant/domains', auth)
      : Promise.resolve(null),
    can('tenant.settings.manage')
      ? apiGet<TenantFlags>(TENANT_FLAGS_PATH, auth)
      : Promise.resolve(null),
  ]);
  return {
    theme: themeRes?.ok ? themeRes.data : null,
    domains: domainsRes?.ok ? (domainsRes.data ?? []) : null,
    canTheme: can('tenant.theme.manage'),
    canDomains: can('tenant.settings.manage'),
    // An explicit read state, never a bare boolean: a failed read must not be
    // indistinguishable from a flag that is genuinely off.
    partnerPromotions: toPartnerPromotionsState(flagsRes),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request);
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
      return routeData({ form: 'flags', error: res.error ?? 'Không lưu được cài đặt.' }, { status: 400 });
    return { form: 'flags', ok: true };
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

const domainFields: FieldConfig<AddDomainInput>[] = [
  {
    name: 'hostname',
    type: 'text',
    label: 'Tên miền',
    placeholder: 'booking.cuahang.vn',
    colSpan: 2,
  },
  { name: 'isPrimary', type: 'switch', label: 'Đặt làm tên miền chính' },
];

const themeFields: FieldConfig<ThemeConfigInput>[] = [
  {
    name: 'logoUrl',
    type: 'file',
    target: 'tenants',
    label: 'Logo',
    description: 'PNG/WebP nền trong suốt hoạt động tốt nhất.',
    colSpan: 2,
  },
  {
    name: 'faviconUrl',
    type: 'file',
    target: 'tenants',
    accept: FAVICON_ACCEPT,
    label: 'Favicon',
    description: 'Chấp nhận .ico, .png hoặc .webp.',
    colSpan: 2,
  },
  { name: 'colors.primary', type: 'text', label: 'Màu chủ đạo', placeholder: '#0f172a' },
  { name: 'colors.accent', type: 'text', label: 'Màu nhấn', placeholder: '#f59e0b' },
  { name: 'colors.background', type: 'text', label: 'Màu nền', placeholder: '#ffffff' },
  { name: 'font', type: 'text', label: 'Phông chữ', placeholder: 'Inter' },
  {
    name: 'hero.title',
    type: 'text',
    label: 'Hero — Tiêu đề',
    placeholder: 'Đặt chỗ nhanh chóng',
    colSpan: 2,
  },
  { name: 'hero.subtitle', type: 'textarea', label: 'Hero — Mô tả', rows: 2, colSpan: 2 },
  { name: 'hero.imageUrl', type: 'file', target: 'tenants', label: 'Hero — Ảnh nền', colSpan: 2 },
  {
    name: 'carousel',
    type: 'file',
    target: 'tenants',
    multiple: true,
    maxFiles: 10,
    label: 'Carousel trang chủ',
    description: 'Tối đa 10 ảnh — hiển thị dạng băng chuyền trên trang chủ.',
    colSpan: 2,
  },
  {
    name: 'contact.email',
    type: 'email',
    label: 'Email liên hệ',
    placeholder: 'lienhe@cuahang.vn',
  },
  { name: 'contact.phone', type: 'text', label: 'Số điện thoại', placeholder: '0900000000' },
  { name: 'contact.address', type: 'text', label: 'Địa chỉ', colSpan: 2 },
  { name: 'seo.title', type: 'text', label: 'SEO — Tiêu đề', colSpan: 2 },
  { name: 'seo.description', type: 'textarea', label: 'SEO — Mô tả', rows: 2, colSpan: 2 },
  {
    name: 'socialLinks.facebook',
    type: 'url',
    label: 'Facebook',
    placeholder: 'https://facebook.com/…',
  },
  {
    name: 'socialLinks.instagram',
    type: 'url',
    label: 'Instagram',
    placeholder: 'https://instagram.com/…',
  },
  {
    name: 'socialLinks.tiktok',
    type: 'url',
    label: 'TikTok',
    placeholder: 'https://tiktok.com/@…',
  },
  {
    name: 'socialLinks.youtube',
    type: 'url',
    label: 'YouTube',
    placeholder: 'https://youtube.com/@…',
  },
];

/** Reads `theme_config` (a free-form JSON blob) into typed form defaults. */
function toThemeDefaults(tc: Record<string, unknown>): ThemeConfigInput {
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const colors = obj(tc.colors);
  const hero = obj(tc.hero);
  const contact = obj(tc.contact);
  const seo = obj(tc.seo);
  const social = obj(tc.socialLinks);
  const carousel = Array.isArray(tc.carousel)
    ? tc.carousel.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    logoUrl: s(tc.logoUrl),
    faviconUrl: s(tc.faviconUrl),
    colors: {
      primary: s(colors.primary),
      accent: s(colors.accent),
      background: s(colors.background),
    },
    font: s(tc.font),
    hero: { title: s(hero.title), subtitle: s(hero.subtitle), imageUrl: s(hero.imageUrl) },
    carousel,
    contact: { email: s(contact.email), phone: s(contact.phone), address: s(contact.address) },
    seo: { title: s(seo.title), description: s(seo.description) },
    socialLinks: {
      facebook: s(social.facebook),
      instagram: s(social.instagram),
      tiktok: s(social.tiktok),
      youtube: s(social.youtube),
    },
  };
}

export default function TenantSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { theme, domains, canTheme, canDomains, partnerPromotions } = loaderData;
  const { readOnly } = useTenantArea();
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  const submit = useSubmit();

  const errFor = (form: string): string | null => {
    if (
      actionData &&
      'form' in actionData &&
      actionData.form === form &&
      'error' in actionData &&
      typeof actionData.error === 'string'
    ) {
      return actionData.error;
    }
    return null;
  };
  const okFor = (form: string): boolean =>
    !!actionData && 'form' in actionData && actionData.form === form && 'ok' in actionData;

  const fieldErrorsFor = (form: string): Record<string, string[]> | null =>
    actionData && 'form' in actionData && actionData.form === form && 'fieldErrors' in actionData
      ? ((actionData.fieldErrors as Record<string, string[]> | undefined) ?? null)
      : null;

  const themeError = errFor('theme');
  const themeSaved = okFor('theme');
  const themeFieldErrors = fieldErrorsFor('theme');
  const verifyError = errFor('verify');
  const domainError = errFor('domain');
  const domainFieldErrors = fieldErrorsFor('domain');

  const themeDefaults = toThemeDefaults(theme?.themeConfig ?? {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description="Tuỳ chỉnh giao diện storefront và tên miền của cửa hàng."
      />

      {canTheme && theme ? (
        <Card>
          <CardHeader>
            <CardTitle>Giao diện storefront</CardTitle>
            <CardDescription>
              Thương hiệu hiển thị trên trang đặt chỗ công khai ({theme.name} · {theme.vertical}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {themeSaved ? (
              <Alert className="mb-4 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                <AlertDescription>Đã lưu giao diện.</AlertDescription>
              </Alert>
            ) : null}
            {readOnly ? (
              <Alert className="mb-4 border-warning/40 bg-warning/10 text-warning-foreground dark:bg-warning/15 dark:text-warning [&>svg]:text-warning">
                <CircleAlert className="size-4" />
                <AlertDescription>
                  Chế độ chỉ đọc — gia hạn gói dịch vụ để chỉnh sửa giao diện.
                </AlertDescription>
              </Alert>
            ) : null}
            <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-60">
              <GenericForm
                schema={themeConfigSchema}
                fields={themeFields}
                columns={2}
                defaultValues={themeDefaults}
                submitLabel="Lưu giao diện"
                method="patch"
                serverError={themeError}
                fieldErrors={themeFieldErrors}
              />
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {canDomains ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" /> Tên miền
            </CardTitle>
            <CardDescription>Ánh xạ tên miền riêng tới storefront của bạn (§6.1).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {verifyError ? (
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertDescription>{verifyError}</AlertDescription>
              </Alert>
            ) : null}

            {domains && domains.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {domains.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{d.hostname}</span>
                        {d.isPrimary ? <Badge variant="secondary">Chính</Badge> : null}
                      </div>
                      {d.verifiedAt ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" /> Đã xác minh ·{' '}
                          {formatDate(d.verifiedAt)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-warning">
                          <Clock className="size-3.5" /> Chờ xác minh TXT
                        </span>
                      )}
                      {!d.verifiedAt && d.verificationToken ? (
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          TXT: {d.verificationToken}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {!d.verifiedAt ? (
                        <Form method="post">
                          <input type="hidden" name="intent" value="verify-domain" />
                          <input type="hidden" name="domainId" value={d.id} />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            disabled={busy || readOnly}
                          >
                            Xác minh
                          </Button>
                        </Form>
                      ) : null}
                      <Form
                        method="post"
                        onSubmit={(e) => {
                          if (!confirm(`Xoá tên miền ${d.hostname}?`)) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="intent" value="delete-domain" />
                        <input type="hidden" name="domainId" value={d.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={busy || readOnly}
                          aria-label={`Xoá ${d.hostname}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </Form>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có tên miền riêng nào.</p>
            )}

            <fieldset
              disabled={readOnly}
              className="min-w-0 space-y-3 rounded-md border border-dashed p-4 disabled:opacity-60"
            >
              <h3 className="text-sm font-medium">Thêm tên miền</h3>
              <GenericForm
                schema={addDomainInputSchema}
                fields={domainFields}
                columns={2}
                defaultValues={{ isPrimary: false }}
                submitLabel="Thêm tên miền"
                serverError={domainError}
                fieldErrors={domainFieldErrors}
              />
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {canDomains && partnerPromotions ? (
        <Card>
          <CardHeader>
            <CardTitle>Marketplace</CardTitle>
            <CardDescription>
              Cho phép đối tác tự tạo mã khuyến mãi cho listing của họ (đối tác chịu chi phí, §12.2).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errFor('flags') ? (
              <Alert variant="destructive" className="mb-4">
                <CircleAlert className="size-4" />
                <AlertDescription>{errFor('flags')}</AlertDescription>
              </Alert>
            ) : null}
            {partnerPromotions.ok ? (
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm">
                  Đối tác được tạo khuyến mãi
                  <span className="block text-muted-foreground">
                    {partnerPromotions.enabled ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </span>
                <Switch
                  checked={partnerPromotions.enabled}
                  disabled={readOnly || busy}
                  onCheckedChange={(checked) => {
                    const fd = new FormData();
                    fd.set('intent', 'toggle-partner-promos');
                    fd.set('partnerPromotionsEnabled', checked ? 'true' : 'false');
                    submit(fd, { method: 'post' });
                  }}
                />
              </label>
            ) : (
              // No Switch at all on a failed read: any rendered toggle would have to
              // pick a checked state, and picking one would state a setting we do
              // not actually know.
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertDescription>{partnerPromotions.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!canTheme && !canDomains ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Bạn không có quyền chỉnh sửa cài đặt.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
