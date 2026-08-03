import type { PartnerResponse, SubmitIdentityInput } from '@booking/contracts';
import { submitIdentityInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { SuccessBanner } from '~/components/action-feedback';
import { IDENTITY_DOCUMENT_LABEL } from '~/constants/partner';
import type { PartnerProfileActionResult } from '~/features/partner/server/profile-actions.server';
import { Section } from '~/components/form-layout';

const identityFields: FieldConfig<SubmitIdentityInput>[] = [
  {
    name: 'documentType',
    type: 'select',
    label: 'Loại giấy tờ',
    required: true,
    options: [
      { value: 'national_id', label: IDENTITY_DOCUMENT_LABEL.national_id },
      { value: 'passport', label: IDENTITY_DOCUMENT_LABEL.passport },
      { value: 'driver_license', label: IDENTITY_DOCUMENT_LABEL.driver_license },
    ],
  },
  { name: 'documentNumber', type: 'text', label: 'Số giấy tờ', required: true },
  { name: 'holderName', type: 'text', label: 'Họ tên trên giấy tờ', required: true },
  {
    name: 'dateOfBirth',
    type: 'text',
    label: 'Ngày sinh',
    placeholder: 'YYYY-MM-DD',
    description: 'Định dạng năm-tháng-ngày, ví dụ 1998-05-20.',
    required: true,
  },
];

/** Identity verification editor inside the shared profile settings surface. */
export function ProfileIdentityCard({
  partner,
  result,
}: {
  partner: PartnerResponse;
  result: PartnerProfileActionResult | null;
}) {
  const identity = partner.identityInfo;
  const identityDefaults = {
    documentType: identity.documentType ?? undefined,
    documentNumber: identity.documentNumber ?? '',
    holderName: identity.holderName ?? '',
    dateOfBirth: partner.dateOfBirth ? partner.dateOfBirth.slice(0, 10) : '',
  };

  return (
    <Section title="Định danh" description="Thông tin giấy tờ để tenant xác minh danh tính.">
      {result?.ok ? (
        <SuccessBanner message="Đã gửi thông tin định danh, chờ tenant xác minh." />
      ) : null}
      <GenericForm
        schema={submitIdentityInputSchema}
        fields={identityFields}
        defaultValues={identityDefaults}
        columns={2}
        submitLabel={identity.documentNumber ? 'Gửi lại xác minh' : 'Gửi xác minh'}
        method="post"
        transform={(v) => ({ ...v, intent: 'identity' })}
        serverError={result?.error ?? null}
        fieldErrors={result?.fieldErrors ?? null}
        warnOnUnsavedChanges
      />
    </Section>
  );
}
