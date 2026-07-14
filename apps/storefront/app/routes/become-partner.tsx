import { partnerRegistrationSchema, type PartnerRegistrationInput } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { CheckCircle2 } from 'lucide-react';
import { data, Link, useRouteLoaderData } from 'react-router';
import { useT } from '../lib/i18n';
import { applyAsPartner, registerOrLogin, type PartnerApplyPayload } from '../lib/partner.server';
import { resolveTenant } from '../lib/tenant.server';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/become-partner';

export function meta() {
  return [{ title: 'Đăng ký trở thành đối tác' }, { name: 'robots', content: 'noindex' }];
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

/** Split the newline-separated license URLs into a clean list. */
function parseLicenseDocs(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function action({ request }: Route.ActionArgs) {
  const tenant = await resolveTenant(request);

  const parsed = partnerRegistrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ fieldErrors: parsed.error.flatten().fieldErrors, error: null, ok: false }, { status: 400 });
  }
  const v = parsed.data;

  const businessInfo: Record<string, unknown> = {};
  if (v.partnerType === 'company') {
    if (v.legalName?.trim()) businessInfo.legalName = v.legalName.trim();
    businessInfo.taxId = v.taxId!.trim();
    businessInfo.businessRegistrationNo = v.businessRegistrationNo!.trim();
  } else if (v.licenseNo?.trim()) {
    businessInfo.licenseNo = v.licenseNo.trim();
  }
  const licenseDocs = parseLicenseDocs(v.licenseDocs);
  if (licenseDocs.length > 0) businessInfo.licenseDocs = licenseDocs;

  const auth = await registerOrLogin({
    email: v.email.trim(),
    password: v.password,
    fullName: v.fullName.trim(),
    ...(v.phone?.trim() ? { phone: v.phone.trim() } : {}),
  });
  if (!auth.ok) return data({ fieldErrors: null, error: auth.code, ok: false }, { status: 400 });

  const apply: PartnerApplyPayload = {
    tenantId: tenant.id,
    name: v.name.trim(),
    slug: v.slug,
    partnerType: v.partnerType,
    ...(v.description?.trim() ? { description: v.description.trim() } : {}),
    ...(Object.keys(businessInfo).length > 0 ? { businessInfo } : {}),
  };
  const applied = await applyAsPartner(auth.token, apply);
  if (!applied.ok) return data({ fieldErrors: null, error: applied.code, ok: false }, { status: 400 });

  return { fieldErrors: null, error: null, ok: true as const };
}

const isCompany = (v: PartnerRegistrationInput) => v.partnerType === 'company';

function buildFields(t: ReturnType<typeof useT>['t']): FieldConfig<PartnerRegistrationInput>[] {
  return [
    { name: 'fullName', type: 'text', label: t('common.becomePartner.fullName'), placeholder: 'Nguyễn Văn A', autoComplete: 'name' },
    { name: 'phone', type: 'text', label: t('common.becomePartner.phone'), placeholder: '0912 345 678', autoComplete: 'tel' },
    {
      name: 'partnerType',
      type: 'radio',
      variant: 'segmented',
      label: t('common.becomePartner.partnerType'),
      colSpan: 2,
      options: [
        { label: t('common.becomePartner.typeIndividual'), value: 'individual' },
        { label: t('common.becomePartner.typeCompany'), value: 'company' },
      ],
    },
    { name: 'name', type: 'text', label: t('common.becomePartner.partnerName') },
    { name: 'slug', type: 'text', label: t('common.becomePartner.slug'), description: t('common.becomePartner.slugHint') },
    { name: 'email', type: 'email', label: t('common.becomePartner.email'), autoComplete: 'email' },
    { name: 'password', type: 'password', label: t('common.becomePartner.password'), autoComplete: 'new-password' },
    { name: 'description', type: 'textarea', label: t('common.becomePartner.description'), colSpan: 2 },
    // Company-only
    { name: 'legalName', type: 'text', label: t('common.becomePartner.legalName'), colSpan: 2, hidden: (v) => !isCompany(v) },
    { name: 'taxId', type: 'text', label: t('common.becomePartner.taxId'), hidden: (v) => !isCompany(v) },
    { name: 'businessRegistrationNo', type: 'text', label: t('common.becomePartner.businessRegistrationNo'), hidden: (v) => !isCompany(v) },
    // Individual-only
    { name: 'licenseNo', type: 'text', label: t('common.becomePartner.licenseNo'), colSpan: 2, hidden: (v) => isCompany(v) },
    {
      name: 'licenseDocs',
      type: 'textarea',
      label: t('common.becomePartner.licenseDoc'),
      description: t('common.becomePartner.licenseDocHint'),
      colSpan: 2,
    },
  ];
}

const DEFAULTS: PartnerRegistrationInput = {
  fullName: '',
  email: '',
  password: '',
  phone: '',
  name: '',
  slug: '',
  partnerType: 'individual',
  description: '',
  legalName: '',
  taxId: '',
  businessRegistrationNo: '',
  licenseNo: '',
  licenseDocs: '',
};

export default function BecomePartner({ loaderData, actionData }: Route.ComponentProps) {
  const { tenantName, tenantLogoUrl, dashboardUrl } = loaderData;
  const { t } = useT();
  const rootData = useRouteLoaderData<typeof rootLoader>('root');
  const logoUrl = tenantLogoUrl ?? rootData?.tenant?.logoUrl ?? null;

  const serverError = actionData?.error ? t(`common.becomePartner.errors.${actionData.error}`) : null;

  const Nav = (
    <nav className="flex h-[72px] items-center justify-between border-b border-gray-100 px-6 lg:px-10">
      <Link to="/" className="flex items-center">
        {logoUrl ? (
          <img src={logoUrl} alt={tenantName} className="h-9 w-auto max-w-40 object-contain" />
        ) : (
          <span className="text-lg font-bold tracking-tight text-primary">{tenantName}</span>
        )}
      </Link>
      <Link
        to="/"
        className="flex h-10 items-center rounded-lg border border-gray-200 px-5 text-sm font-medium text-gray-700 transition-all hover:border-primary hover:text-primary"
      >
        Đăng nhập
      </Link>
    </nav>
  );

  if (actionData?.ok) {
    return (
      <div className="min-h-dvh bg-white">
        {Nav}
        <main className="flex min-h-[calc(100dvh-72px)] items-center justify-center px-6 py-20">
          <div className="w-full max-w-[570px] rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-6 flex size-[104px] items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="size-14 text-green-500" strokeWidth={1.5} />
            </div>
            <h1 className="mb-3 text-2xl font-bold uppercase tracking-widest text-gray-900">
              Hoàn tất đăng ký tài khoản
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-gray-500">
              Hợp đồng đối tác và thông tin tài khoản của bạn đã được gửi tới địa chỉ email đăng ký.
            </p>
            <a
              href={`${dashboardUrl}/auth/login`}
              className="inline-flex h-14 w-full items-center justify-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Đến trang quản trị
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white">
      {Nav}
      <main className="mx-auto max-w-292.5 px-6 py-10 lg:px-10">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="p-8 lg:p-10">
            <h1 className="mb-8 text-2xl font-bold uppercase tracking-widest text-gray-900">
              {t('common.becomePartner.title')}
            </h1>
            <GenericForm
              schema={partnerRegistrationSchema}
              fields={buildFields(t)}
              defaultValues={DEFAULTS}
              columns={2}
              submitLabel={t('common.becomePartner.submit')}
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
