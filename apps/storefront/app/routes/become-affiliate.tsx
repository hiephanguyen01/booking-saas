import { affiliateRegistrationSchema, type AffiliateRegistrationInput } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { CheckCircle2 } from 'lucide-react';
import { data, Link, useRouteLoaderData } from 'react-router';
import { applyAsAffiliate } from '../lib/affiliate.server';
import { registerOrLogin } from '../lib/partner.server';
import { resolveTenant } from '../lib/tenant.server';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/become-affiliate';

export function meta() {
  return [{ title: 'Đăng ký trở thành cộng tác viên' }, { name: 'robots', content: 'noindex' }];
}

/** Tells root.tsx to hide the SiteHeader and SiteFooter on this page. */
export const handle = { standalone: true };

export async function loader({ request }: Route.LoaderArgs) {
  const tenant = await resolveTenant(request);
  return {
    tenantName: tenant.name,
    tenantLogoUrl: tenant.logoUrl ?? null,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
  };
}

const APPLY_ERROR_MESSAGES: Record<string, string> = {
  emailTakenWrongPassword: 'Email đã tồn tại nhưng mật khẩu không đúng.',
  TENANT_INACTIVE: 'Cửa hàng hiện không nhận đăng ký cộng tác viên.',
  generic: 'Có lỗi xảy ra, vui lòng thử lại.',
};

export async function action({ request }: Route.ActionArgs) {
  const tenant = await resolveTenant(request);

  const parsed = affiliateRegistrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ fieldErrors: parsed.error.flatten().fieldErrors, error: null, ok: false }, { status: 400 });
  }
  const v = parsed.data;

  const auth = await registerOrLogin({
    email: v.email.trim(),
    password: v.password,
    fullName: v.fullName.trim(),
    ...(v.phone?.trim() ? { phone: v.phone.trim() } : {}),
  });
  if (!auth.ok) return data({ fieldErrors: null, error: auth.code, ok: false }, { status: 400 });

  const payoutInfo: { bankName?: string; accountNo?: string; accountHolder?: string } = {};
  if (v.bankName?.trim()) payoutInfo.bankName = v.bankName.trim();
  if (v.accountNo?.trim()) payoutInfo.accountNo = v.accountNo.trim();
  if (v.accountHolder?.trim()) payoutInfo.accountHolder = v.accountHolder.trim();

  const applied = await applyAsAffiliate(auth.token, { tenantId: tenant.id, payoutInfo });
  if (!applied.ok) return data({ fieldErrors: null, error: applied.code, ok: false }, { status: 400 });

  return { fieldErrors: null, error: null, ok: true as const };
}

const FIELDS: FieldConfig<AffiliateRegistrationInput>[] = [
  { name: 'fullName', type: 'text', label: 'Họ và tên', autoComplete: 'name', colSpan: 2 },
  { name: 'email', type: 'email', label: 'Email', autoComplete: 'email' },
  { name: 'phone', type: 'text', label: 'Số điện thoại', autoComplete: 'tel' },
  { name: 'password', type: 'password', label: 'Mật khẩu', autoComplete: 'new-password', colSpan: 2 },
  { name: 'bankName', type: 'text', label: 'Ngân hàng (tuỳ chọn)' },
  { name: 'accountNo', type: 'text', label: 'Số tài khoản (tuỳ chọn)' },
  { name: 'accountHolder', type: 'text', label: 'Chủ tài khoản (tuỳ chọn)', colSpan: 2 },
];

function BrandHeader({ logoUrl, tenantName }: { logoUrl: string | null; tenantName: string }) {
  return (
    <header className="flex h-[72px] items-center border-b border-gray-100 px-6 lg:px-10">
      <Link to="/" className="flex items-center gap-2">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-9 w-auto max-w-40 object-contain" />
        ) : (
          <span className="text-lg font-semibold text-gray-900">{tenantName}</span>
        )}
      </Link>
    </header>
  );
}

export default function BecomeAffiliate({ loaderData, actionData }: Route.ComponentProps) {
  const { tenantName, dashboardUrl } = loaderData;
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const logoUrl = loaderData.tenantLogoUrl ?? rootData?.tenant?.logoUrl ?? null;

  const serverError = actionData?.error
    ? (APPLY_ERROR_MESSAGES[actionData.error] ?? APPLY_ERROR_MESSAGES.generic)
    : null;

  if (actionData?.ok) {
    return (
      <div className="min-h-dvh bg-white">
        <BrandHeader logoUrl={logoUrl} tenantName={tenantName} />
        <main className="flex min-h-[calc(100dvh-72px)] items-center justify-center px-6 py-20">
          <div className="w-full max-w-[570px] rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-6 flex size-[104px] items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="size-12 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Đăng ký thành công</h1>
            <p className="mt-3 text-sm text-gray-600">
              Yêu cầu cộng tác viên của bạn tại {tenantName} đang chờ được duyệt. Sau khi được duyệt, bạn có
              thể tạo link giới thiệu và theo dõi hoa hồng trong bảng điều khiển.
            </p>
            <a
              href={`${dashboardUrl}/auth/login`}
              className="mt-6 inline-flex h-14 w-full items-center justify-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Đến bảng điều khiển
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white">
      <BrandHeader logoUrl={logoUrl} tenantName={tenantName} />
      <main className="mx-auto max-w-[640px] px-6 py-10 lg:px-10">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm lg:p-10">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Trở thành cộng tác viên</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Giới thiệu khách hàng cho {tenantName} và nhận hoa hồng trên mỗi lượt đặt thành công.
          </p>

          <div className="mt-8">
            <GenericForm
              schema={affiliateRegistrationSchema}
              fields={FIELDS}
              columns={2}
              submitLabel="Đăng ký"
              submitFullWidth
              serverError={serverError}
              fieldErrors={actionData?.fieldErrors ?? null}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
