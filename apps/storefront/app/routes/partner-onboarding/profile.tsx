import {
  partnerOnboardingProfileSchema,
  type AdministrativeWard,
  type PartnerOnboardingProfileInput,
} from '@booking/contracts';
import { FORM_CONTROL } from '@booking/ui/components/form/control';
import { FieldRenderer } from '@booking/ui/components/form/field-renderer';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Button } from '@booking/ui/components/ui/button';
import { Field, FieldLabel } from '@booking/ui/components/ui/field';
import { Form } from '@booking/ui/components/ui/form';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { cn } from '@booking/ui/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef } from 'react';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { useActionData, useFetcher, useLoaderData, useNavigation, useSubmit } from 'react-router';
import { NsI18n, useTranslation, type ScopedI18n, type ScopedTranslationKey } from '../../lib/i18n';
import {
  loadPartnerProfile,
  submitPartnerProfile,
  type PartnerOnboardingActionData,
} from '../../lib/partner-onboarding.server';
import type { Route } from './+types/profile';
import { FormAlert, partnerMeta } from './shared';

export function meta({ matches, params }: Route.MetaArgs): Route.MetaDescriptors {
  return partnerMeta(matches[0].loaderData.tenant.name, params.locale, 'profile');
}
export const loader = ({ request, params }: Route.LoaderArgs) =>
  loadPartnerProfile(request, params.locale);
export const action = ({ request, params }: Route.ActionArgs) =>
  submitPartnerProfile(request, params.locale);

const BANKS = [
  'Vietcombank',
  'BIDV',
  'VietinBank',
  'Agribank',
  'Techcombank',
  'MB Bank',
  'ACB',
  'VPBank',
  'Sacombank',
].map((value) => ({ label: value, value }));

const DEFAULTS: PartnerOnboardingProfileInput = {
  name: '',
  partnerType: 'company',
  representativeName: '',
  companyName: '',
  businessRegistrationNo: '',
  identityNumber: '',
  provinceCode: '',
  wardCode: '',
  address: '',
  phone: '',
  bank: '',
  bankAccountNumber: '',
  bankAccountHolder: '',
  businessLicenseFrontUrl: '',
  businessLicenseBackUrl: '',
  identityCardFrontUrl: '',
  identityCardBackUrl: '',
  acceptedTerms: false,
};

/** Backend application codes → the message shown above the form. */
const APPLY_ERRORS = {
  slugTaken: 'common:becomePartner.errors.slugTaken',
  planLimit: 'common:becomePartner.errors.planLimit',
  tenantInactive: 'common:becomePartner.errors.tenantInactive',
  invalidLocation: 'auth:partner.errors.invalidLocation',
} as const satisfies Record<string, ScopedTranslationKey<[NsI18n.Auth, NsI18n.Common]>>;

type ProfileI18n = ScopedI18n<[NsI18n.Auth, NsI18n.Common]>['t'];

const textField = (
  name: Path<PartnerOnboardingProfileInput>,
  label: string,
  t: ProfileI18n,
): FieldConfig<PartnerOnboardingProfileInput> => ({
  name,
  label,
  type: 'text',
  required: true,
  placeholder: t('auth:partner.enterPlaceholder'),
});

const documentField = (
  name: Path<PartnerOnboardingProfileInput>,
  label: string,
): FieldConfig<PartnerOnboardingProfileInput> => ({
  name,
  label,
  type: 'file',
  required: true,
  target: 'partners',
  presignEndpoint: '/uploads/presign',
  variant: 'document',
});

function DocumentPair({ company, t }: { company: boolean; t: ProfileI18n }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <FieldRenderer
        field={documentField(
          company ? 'businessLicenseFrontUrl' : 'identityCardFrontUrl',
          t(
            company
              ? 'common:becomePartner.businessLicenseFront'
              : 'common:becomePartner.identityDocumentFront',
          ),
        )}
      />
      <FieldRenderer
        field={documentField(
          company ? 'businessLicenseBackUrl' : 'identityCardBackUrl',
          t(
            company
              ? 'common:becomePartner.businessLicenseBack'
              : 'common:becomePartner.identityDocumentBack',
          ),
        )}
      />
    </div>
  );
}

export default function PartnerProfile() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<PartnerOnboardingActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const { t } = useTranslation([NsI18n.Auth, NsI18n.Common]);
  const wardsFetcher = useFetcher<{
    provinceCode: string;
    wards: AdministrativeWard[];
  }>();
  const form = useForm<PartnerOnboardingProfileInput>({
    resolver: zodResolver(partnerOnboardingProfileSchema),
    defaultValues: DEFAULTS,
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    shouldUnregister: true,
  });
  const partnerType = useWatch({
    control: form.control,
    name: 'partnerType',
    defaultValue: 'company',
  });
  const provinceCode = useWatch({
    control: form.control,
    name: 'provinceCode',
    defaultValue: '',
  });
  const previousProvinceCode = useRef(provinceCode);
  const loadWards = wardsFetcher.load;
  useEffect(() => {
    if (previousProvinceCode.current !== provinceCode) {
      form.setValue('wardCode', '', { shouldDirty: true, shouldValidate: false });
      previousProvinceCode.current = provinceCode;
    }
    if (provinceCode) {
      void loadWards(
        `/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
      );
    }
  }, [form, loadWards, provinceCode]);
  useEffect(() => {
    if (!actionData?.fieldErrors) return;
    for (const [name, messages] of Object.entries(actionData.fieldErrors)) {
      if (messages?.[0])
        form.setError(name as Path<PartnerOnboardingProfileInput>, {
          type: 'server',
          message: messages[0],
        });
    }
  }, [actionData?.fieldErrors, form]);

  const errorCode = actionData?.error;
  const errorMessage = errorCode
    ? t(
        APPLY_ERRORS[errorCode as keyof typeof APPLY_ERRORS] ??
          'common:becomePartner.errors.generic',
      )
    : undefined;

  const partnerTypeField = useMemo<FieldConfig<PartnerOnboardingProfileInput>>(
    () => ({
      name: 'partnerType',
      label: t('common:becomePartner.partnerType'),
      type: 'radio',
      variant: 'segmented',
      required: true,
      options: [
        { label: t('common:becomePartner.typeCompany'), value: 'company' },
        { label: t('common:becomePartner.typeIndividual'), value: 'individual' },
      ],
    }),
    [t],
  );

  const provinceOptions = loaderData.provinces.map((province) => ({
    label: province.name,
    value: province.code,
  }));
  const wardsData = wardsFetcher.data;
  const wards = wardsData?.provinceCode === provinceCode ? wardsData.wards : [];
  const wardOptions = wards.map((ward) => ({ label: ward.name, value: ward.code }));
  const wardsLoading = wardsFetcher.state !== 'idle';
  const submitting = navigation.state === 'submitting';

  return (
    <main className="mx-auto w-full max-w-[1170px] px-4 pb-16 sm:px-6 lg:px-0">
      <section className="bg-card p-6 text-card-foreground shadow-sm sm:p-10">
        <h1 className="mb-6 text-2xl font-semibold uppercase leading-9">
          {t('common:becomePartner.title')}
        </h1>
        <FormAlert>{errorMessage}</FormAlert>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) =>
              submit(values as never, { method: 'post', encType: 'application/json' }),
            )}
            noValidate
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10">
              <Field>
                <FieldLabel htmlFor="partner-email">{t('common:becomePartner.email')}</FieldLabel>
                <output
                  id="partner-email"
                  className={cn(
                    'flex items-center rounded-md border border-input bg-muted text-base text-muted-foreground md:text-sm',
                    FORM_CONTROL,
                  )}
                >
                  {loaderData.email}
                </output>
              </Field>
              <FieldRenderer field={textField('name', t('common:becomePartner.partnerName'), t)} />
            </div>
            <div className="mt-6">
              <FieldRenderer field={partnerTypeField} />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10">
              <div className="space-y-4">
                {partnerType === 'company' ? (
                  <>
                    <FieldRenderer
                      field={textField('companyName', t('common:becomePartner.companyName'), t)}
                    />
                    <FieldRenderer
                      field={textField(
                        'businessRegistrationNo',
                        t('common:becomePartner.businessRegistrationNo'),
                        t,
                      )}
                    />
                  </>
                ) : null}
                <FieldRenderer
                  field={textField(
                    'representativeName',
                    t('common:becomePartner.representative'),
                    t,
                  )}
                />
                <FieldRenderer
                  field={textField('identityNumber', t('common:becomePartner.identityNumber'), t)}
                />
                <FieldRenderer
                  field={{
                    name: 'provinceCode',
                    label: t('common:becomePartner.province'),
                    type: 'combobox',
                    required: true,
                    placeholder: t('auth:partner.selectProvince'),
                    searchPlaceholder: t('auth:partner.searchProvince'),
                    options: provinceOptions,
                  }}
                />
                <FieldRenderer
                  field={{
                    name: 'wardCode',
                    label: t('auth:partner.wardLabel'),
                    type: 'combobox',
                    required: true,
                    disabled: !provinceCode || wardsLoading,
                    placeholder: wardsLoading
                      ? t('auth:partner.wardLoading')
                      : provinceCode
                        ? t('auth:partner.selectWard')
                        : t('auth:partner.wardNeedsProvince'),
                    searchPlaceholder: t('auth:partner.searchWard'),
                    options: wardOptions,
                  }}
                />
                <FieldRenderer field={textField('address', t('common:becomePartner.address'), t)} />
                <div className="space-y-4 pt-1 text-base leading-6 text-foreground">
                  <p>{t('auth:partner.privacyNotice', { tenant: loaderData.tenantName })}</p>
                  <FieldRenderer
                    field={{
                      name: 'acceptedTerms',
                      type: 'checkbox',
                      label: t('auth:partner.acceptTerms', { tenant: loaderData.tenantName }),
                      required: true,
                    }}
                  />
                </div>
              </div>
              <div className="space-y-4">
                <DocumentPair company={partnerType === 'company'} t={t} />
                {partnerType === 'company' ? <DocumentPair company={false} t={t} /> : null}
                <FieldRenderer field={textField('phone', t('common:becomePartner.phone'), t)} />
                <FieldRenderer
                  field={{
                    name: 'bank',
                    label: t('common:becomePartner.bank'),
                    type: 'combobox',
                    required: true,
                    placeholder: t('auth:partner.selectBank'),
                    searchPlaceholder: t('auth:partner.searchBank'),
                    options: BANKS,
                  }}
                />
                <FieldRenderer
                  field={textField(
                    'bankAccountNumber',
                    t('common:becomePartner.bankAccountNumber'),
                    t,
                  )}
                />
                <FieldRenderer
                  field={textField(
                    'bankAccountHolder',
                    t('common:becomePartner.bankAccountHolder'),
                    t,
                  )}
                />
              </div>
            </div>
            <div className="mt-10 flex justify-center">
              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full max-w-[400px] text-base"
              >
                {submitting ? <Spinner data-icon="inline-start" /> : null}
                {t('common:becomePartner.submit')}
              </Button>
            </div>
          </form>
        </Form>
      </section>
    </main>
  );
}
