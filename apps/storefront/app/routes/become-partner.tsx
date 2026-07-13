import { data, Link } from 'react-router';
import { partnerRegistrationSchema, type PartnerRegistrationInput } from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { CheckCircle2 } from 'lucide-react';
import type { Route } from './+types/become-partner';
import { resolveTenant } from '../lib/tenant.server';
import { registerOrLogin, applyAsPartner, type PartnerApplyPayload } from '../lib/partner.server';
import { useT, type I18n } from '../lib/i18n';

export function meta() {
  return [{ title: 'Trở thành đối tác' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const tenant = await resolveTenant(request);
  return {
    tenantName: tenant.name,
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

  // GenericForm submits the values as JSON; re-validate with the same shared schema.
  const parsed = partnerRegistrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return data({ fieldErrors: parsed.error.flatten().fieldErrors, error: null, ok: false }, { status: 400 });
  }
  const v = parsed.data;

  // Build businessInfo (§7.3) from the licenses/documents section.
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

/** Field config (labels come from i18n; validation messages come from the schema). */
function buildFields(t: I18n['t']): FieldConfig<PartnerRegistrationInput>[] {
  const isCompany = (v: PartnerRegistrationInput): boolean => v.partnerType === 'company';
  return [
    { name: 'fullName', type: 'text', label: t('becomePartner.fullName'), autoComplete: 'name', colSpan: 2 },
    { name: 'email', type: 'email', label: t('becomePartner.email'), autoComplete: 'email' },
    { name: 'phone', type: 'text', label: t('becomePartner.phone'), autoComplete: 'tel' },
    { name: 'password', type: 'password', label: t('becomePartner.password'), autoComplete: 'new-password', colSpan: 2 },
    { name: 'name', type: 'text', label: t('becomePartner.partnerName') },
    { name: 'slug', type: 'text', label: t('becomePartner.slug'), description: t('becomePartner.slugHint') },
    {
      name: 'partnerType',
      type: 'select',
      label: t('becomePartner.partnerType'),
      colSpan: 2,
      options: [
        { label: t('becomePartner.typeIndividual'), value: 'individual' },
        { label: t('becomePartner.typeCompany'), value: 'company' },
      ],
    },
    { name: 'description', type: 'textarea', label: t('becomePartner.description'), colSpan: 2 },
    { name: 'legalName', type: 'text', label: t('becomePartner.legalName'), colSpan: 2, hidden: (v) => !isCompany(v) },
    { name: 'taxId', type: 'text', label: t('becomePartner.taxId'), hidden: (v) => !isCompany(v) },
    {
      name: 'businessRegistrationNo',
      type: 'text',
      label: t('becomePartner.businessRegistrationNo'),
      hidden: (v) => !isCompany(v),
    },
    { name: 'licenseNo', type: 'text', label: t('becomePartner.licenseNo'), colSpan: 2, hidden: (v) => isCompany(v) },
    {
      name: 'licenseDocs',
      type: 'textarea',
      label: t('becomePartner.licenseDoc'),
      description: t('becomePartner.licenseDocHint'),
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
  const { tenantName, dashboardUrl } = loaderData;
  const { t } = useT();

  if (actionData?.ok) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <CheckCircle2 className="mx-auto mb-4 size-12 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">{t('becomePartner.successTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('becomePartner.successBody', { tenant: tenantName })}</p>
        <Button asChild className="mt-6 h-11">
          <a href={`${dashboardUrl}/auth/login`}>{t('becomePartner.goToDashboard')}</a>
        </Button>
      </div>
    );
  }

  const serverError = actionData?.error ? t(`becomePartner.errors.${actionData.error}`) : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← {tenantName}
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('becomePartner.title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('becomePartner.subtitle', { tenant: tenantName })}</p>
      </div>

      <GenericForm
        schema={partnerRegistrationSchema}
        fields={buildFields(t)}
        defaultValues={DEFAULTS}
        columns={2}
        submitLabel={t('becomePartner.submit')}
        serverError={serverError}
        fieldErrors={actionData?.fieldErrors ?? null}
      />
    </div>
  );
}
