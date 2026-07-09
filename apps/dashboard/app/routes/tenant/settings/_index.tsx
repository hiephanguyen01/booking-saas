import { Form, useNavigation, data as routeData } from 'react-router';
import {
  addDomainInputSchema,
  type AddDomainInput,
  type DomainResponse,
} from '@booking/shared';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Badge } from '@booking/ui/components/ui/badge';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { CheckCircle2, CircleAlert, Clock, Globe } from 'lucide-react';
import type { Route } from './+types/_index';
import { apiGet, apiPatch, apiPost } from '~/lib/api.server';
import { requireTenant } from '../tenant.server';
import { formatDate } from '../format';
import { PageHeader } from '../components/page';

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
  const [themeRes, domainsRes] = await Promise.all([
    can('tenant.theme.manage') ? apiGet<TenantThemeResponse>('/tenant/theme', auth) : Promise.resolve(null),
    can('tenant.settings.manage') ? apiGet<DomainResponse[]>('/tenant/domains', auth) : Promise.resolve(null),
  ]);
  return {
    theme: themeRes?.ok ? themeRes.data : null,
    domains: domainsRes?.ok ? (domainsRes.data ?? []) : null,
    canTheme: can('tenant.theme.manage'),
    canDomains: can('tenant.settings.manage'),
  };
}

const str = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? undefined : s;
};

export async function action({ request }: Route.ActionArgs) {
  const { auth } = await requireTenant(request);
  const contentType = request.headers.get('content-type') ?? '';

  // GenericForm (domain add) submits JSON.
  if (contentType.includes('application/json')) {
    const parsed = addDomainInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return routeData({ form: 'domain', fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const res = await apiPost<DomainResponse>('/tenant/domains', parsed.data, auth);
    if (!res.ok) return routeData({ form: 'domain', error: res.error ?? 'Không thêm được tên miền.' }, { status: 400 });
    return { form: 'domain', ok: true };
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent'));

  if (intent === 'verify-domain') {
    const id = String(formData.get('domainId'));
    const res = await apiPost<DomainResponse>(`/tenant/domains/${id}/verify`, {}, auth);
    if (!res.ok) return routeData({ form: 'verify', error: res.error ?? 'Xác minh thất bại. Kiểm tra bản ghi TXT.' }, { status: 400 });
    return { form: 'verify', ok: true };
  }

  if (intent === 'update-theme') {
    let base: Record<string, unknown> = {};
    try {
      base = JSON.parse(String(formData.get('base') ?? '{}')) as Record<string, unknown>;
    } catch {
      base = {};
    }
    const themeConfig: Record<string, unknown> = {
      ...base,
      brandName: str(formData.get('brandName')) ?? null,
      primaryColor: str(formData.get('primaryColor')) ?? null,
      logoUrl: str(formData.get('logoUrl')) ?? null,
      tagline: str(formData.get('tagline')) ?? null,
    };
    const res = await apiPatch<TenantThemeResponse>('/tenant/theme', { themeConfig }, auth);
    if (!res.ok) return routeData({ form: 'theme', error: res.error ?? 'Không lưu được giao diện.' }, { status: 400 });
    return { form: 'theme', ok: true };
  }

  return routeData({ error: 'Hành động không hợp lệ.' }, { status: 400 });
}

const domainFields: FieldConfig<AddDomainInput>[] = [
  { name: 'hostname', type: 'text', label: 'Tên miền', placeholder: 'booking.cuahang.vn', colSpan: 2 },
  { name: 'isPrimary', type: 'switch', label: 'Đặt làm tên miền chính' },
];

export default function TenantSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { theme, domains, canTheme, canDomains } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== 'idle';

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

  const themeError = errFor('theme');
  const themeSaved = okFor('theme');
  const verifyError = errFor('verify');
  const domainError = errFor('domain');
  const domainFieldErrors =
    actionData && 'form' in actionData && actionData.form === 'domain' && 'fieldErrors' in actionData
      ? (actionData.fieldErrors as Record<string, string[]> | undefined)
      : null;

  const tc = theme?.themeConfig ?? {};
  const val = (k: string) => (typeof tc[k] === 'string' ? (tc[k] as string) : '');

  return (
    <div className="space-y-6">
      <PageHeader title="Cài đặt" description="Tuỳ chỉnh giao diện storefront và tên miền của cửa hàng." />

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
            {themeError ? (
              <Alert variant="destructive" className="mb-4"><CircleAlert className="size-4" /><AlertDescription>{themeError}</AlertDescription></Alert>
            ) : null}
            <Form method="post" className="space-y-6">
              <input type="hidden" name="intent" value="update-theme" />
              <input type="hidden" name="base" value={JSON.stringify(tc)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="brandName">Tên thương hiệu</Label>
                  <Input id="brandName" name="brandName" defaultValue={val('brandName')} placeholder={theme.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Màu chủ đạo</Label>
                  <div className="flex items-center gap-2">
                    <Input id="primaryColor" name="primaryColor" defaultValue={val('primaryColor') || '#0f172a'} className="font-mono" placeholder="#0f172a" />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="logoUrl">URL logo</Label>
                  <Input id="logoUrl" name="logoUrl" type="url" defaultValue={val('logoUrl')} placeholder="https://cdn.cuahang.vn/logo.png" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="tagline">Khẩu hiệu</Label>
                  <Input id="tagline" name="tagline" defaultValue={val('tagline')} placeholder="Đặt chỗ nhanh chóng, tiện lợi" />
                </div>
              </div>
              <Button type="submit" disabled={busy}>Lưu giao diện</Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {canDomains ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Globe className="size-4" /> Tên miền</CardTitle>
            <CardDescription>Ánh xạ tên miền riêng tới storefront của bạn (§6.1).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {verifyError ? (
              <Alert variant="destructive"><CircleAlert className="size-4" /><AlertDescription>{verifyError}</AlertDescription></Alert>
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
                          <CheckCircle2 className="size-3.5" /> Đã xác minh · {formatDate(d.verifiedAt)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <Clock className="size-3.5" /> Chờ xác minh TXT
                        </span>
                      )}
                      {!d.verifiedAt && d.verificationToken ? (
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">TXT: {d.verificationToken}</p>
                      ) : null}
                    </div>
                    {!d.verifiedAt ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="verify-domain" />
                        <input type="hidden" name="domainId" value={d.id} />
                        <Button type="submit" variant="outline" size="sm" disabled={busy}>Xác minh</Button>
                      </Form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có tên miền riêng nào.</p>
            )}

            <div className="space-y-3 rounded-md border border-dashed p-4">
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
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!canTheme && !canDomains ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Bạn không có quyền chỉnh sửa cài đặt.</CardContent></Card>
      ) : null}
    </div>
  );
}
