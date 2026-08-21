import {
  MAX_PARTNER_DOCUMENT_SIZE_BYTES,
  PARTNER_DOCUMENT_UPLOAD_ACCEPT,
  type PartnerOnboardingProfileInput,
} from '@booking/contracts';
import { PrivateDocumentUpload } from '@booking/ui/components/form/private-document-upload';
import type { FieldConfig } from '@booking/ui/components/form/types';
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@booking/ui/components/ui/form';
import type { Path } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';
import type { NsI18n, ScopedI18n, ScopedTranslationKey } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';

export const PARTNER_PROFILE_BANKS = [
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

export const PARTNER_PROFILE_DEFAULTS: PartnerOnboardingProfileInput = {
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
  businessLicenseFrontKey: '',
  businessLicenseBackKey: '',
  identityCardFrontKey: '',
  identityCardBackKey: '',
  acceptedTerms: false,
  // Placeholders — `usePartnerProfilePageController` overrides both from the
  // loader's `legalConsent` (the tenant's current document versions) before
  // this constant ever reaches `useForm`.
  acceptedVersionIds: [],
  acceptedLocale: 'vi',
};

/** Backend application codes → the message shown above the form. */
export const PARTNER_PROFILE_APPLY_ERRORS = {
  slugTaken: 'common:becomePartner.errors.slugTaken',
  planLimit: 'common:becomePartner.errors.planLimit',
  tenantInactive: 'common:becomePartner.errors.tenantInactive',
  invalidLocation: 'auth:partner.errors.invalidLocation',
} as const satisfies Record<string, ScopedTranslationKey<[NsI18n.Auth, NsI18n.Common]>>;

export type PartnerProfileI18n = ScopedI18n<[NsI18n.Auth, NsI18n.Common]>['t'];

export const partnerProfileTextField = (
  name: Path<PartnerOnboardingProfileInput>,
  label: string,
  t: PartnerProfileI18n,
): FieldConfig<PartnerOnboardingProfileInput> => ({
  name,
  label,
  type: 'text',
  required: true,
  placeholder: t('auth:partner.enterPlaceholder'),
});

const DOCUMENT_MAX_SIZE_MB = MAX_PARTNER_DOCUMENT_SIZE_BYTES / (1024 * 1024);

type PartnerDocumentFieldName =
  | 'businessLicenseFrontKey'
  | 'businessLicenseBackKey'
  | 'identityCardFrontKey'
  | 'identityCardBackKey';

function PartnerPrivateDocumentField({
  name,
  label,
}: {
  name: PartnerDocumentFieldName;
  label: string;
}) {
  const { control } = useFormContext<PartnerOnboardingProfileInput>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            <span aria-hidden="true" className="mr-1 text-destructive">
              *
            </span>
          </FormLabel>
          <PrivateDocumentUpload
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={field.onChange}
            presignEndpoint={storefrontPaths.partnerDocumentUploadPresign}
            accept={PARTNER_DOCUMENT_UPLOAD_ACCEPT}
            maxSizeMb={DOCUMENT_MAX_SIZE_MB}
            label={label}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function PartnerDocumentPair({ company, t }: { company: boolean; t: PartnerProfileI18n }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <PartnerPrivateDocumentField
        name={company ? 'businessLicenseFrontKey' : 'identityCardFrontKey'}
        label={t(
          company
            ? 'common:becomePartner.businessLicenseFront'
            : 'common:becomePartner.identityDocumentFront',
        )}
      />
      <PartnerPrivateDocumentField
        name={company ? 'businessLicenseBackKey' : 'identityCardBackKey'}
        label={t(
          company
            ? 'common:becomePartner.businessLicenseBack'
            : 'common:becomePartner.identityDocumentBack',
        )}
      />
    </div>
  );
}
