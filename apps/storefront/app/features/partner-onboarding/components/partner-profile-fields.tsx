import type { PartnerOnboardingProfileInput } from '@booking/contracts';
import { FieldRenderer } from '@booking/ui/components/form/field-renderer';
import type { FieldConfig } from '@booking/ui/components/form/types';
import type { Path } from 'react-hook-form';
import type { NsI18n, ScopedI18n, ScopedTranslationKey } from '@booking/i18n';

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
  businessLicenseFrontUrl: '',
  businessLicenseBackUrl: '',
  identityCardFrontUrl: '',
  identityCardBackUrl: '',
  acceptedTerms: false,
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

const partnerDocumentField = (
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

export function PartnerDocumentPair({ company, t }: { company: boolean; t: PartnerProfileI18n }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <FieldRenderer
        field={partnerDocumentField(
          company ? 'businessLicenseFrontUrl' : 'identityCardFrontUrl',
          t(
            company
              ? 'common:becomePartner.businessLicenseFront'
              : 'common:becomePartner.identityDocumentFront',
          ),
        )}
      />
      <FieldRenderer
        field={partnerDocumentField(
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
