import type { PartnerResponse, SubmitIdentityInput } from '@booking/contracts';
import { submitIdentityInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { SuccessBanner } from '~/components/action-feedback';
import { EnumValue } from '~/components/enum-value';
import { formatDate } from '~/lib/format';
import { IDENTITY_DOCUMENT_LABEL } from '~/constants/partner';
import type { PartnerProfileActionResult } from '../../server/profile-actions.server';

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

/** "Danh tính" — current identity details + the submit/resubmit form. */
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
    <Card>
      <CardHeader>
        <CardTitle>Danh tính</CardTitle>
        <CardDescription>
          Gửi thông tin giấy tờ tuỳ thân để tenant xác minh. Cần thiết cho các loại listing gắn
          với con người.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DetailGrid columns={2}>
          <DetailField
            label="Loại giấy tờ"
            value={
              identity.documentType ? (
                <EnumValue map={IDENTITY_DOCUMENT_LABEL} value={identity.documentType} />
              ) : null
            }
          />
          <DetailField label="Số giấy tờ" value={identity.documentNumber} />
          <DetailField label="Họ tên trên giấy tờ" value={identity.holderName} />
          <DetailField
            label="Ngày sinh"
            value={partner.dateOfBirth ? formatDate(partner.dateOfBirth) : null}
          />
        </DetailGrid>

        {result?.ok ? (
          <SuccessBanner message="Đã gửi thông tin định danh, chờ tenant xác minh." />
        ) : null}

        <div>
          <h3 className="mb-4 text-sm font-semibold">
            {identity.documentNumber ? 'Cập nhật / gửi lại định danh' : 'Gửi thông tin định danh'}
          </h3>
          <GenericForm
            schema={submitIdentityInputSchema}
            fields={identityFields}
            defaultValues={identityDefaults}
            columns={2}
            submitLabel="Gửi xác minh"
            method="post"
            transform={(v) => ({ ...v, intent: 'identity' })}
            serverError={result?.error ?? null}
            fieldErrors={result?.fieldErrors ?? null}
          />
        </div>
      </CardContent>
    </Card>
  );
}
