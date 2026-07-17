import type { PartnerResponse, UpdatePayoutInfoInput } from '@booking/contracts';
import { updatePayoutInfoInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { SuccessBanner } from '~/components/action-feedback';
import type { PartnerProfileActionResult } from '../../server/profile-actions.server';

const payoutFields: FieldConfig<UpdatePayoutInfoInput>[] = [
  { name: 'bank', type: 'text', label: 'Ngân hàng', required: true },
  { name: 'accountNumber', type: 'text', label: 'Số tài khoản', required: true },
  { name: 'holderName', type: 'text', label: 'Chủ tài khoản', required: true },
];

/** `payoutInfo` is untrusted jsonb; defaults need `''` (never null) for inputs. */
function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** "Tài khoản nhận tiền" — the payout bank account the platform pays out to. */
export function ProfilePayoutCard({
  partner,
  result,
}: {
  partner: PartnerResponse;
  result: PartnerProfileActionResult | null;
}) {
  const payout = partner.payoutInfo as Record<string, unknown>;
  const payoutDefaults = {
    bank: readString(payout.bank),
    accountNumber: readString(payout.accountNumber),
    holderName: readString(payout.holderName),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tài khoản nhận tiền</CardTitle>
        <CardDescription>Nền tảng chi trả doanh thu về tài khoản này.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {result?.ok ? <SuccessBanner message="Đã lưu tài khoản nhận tiền." /> : null}
        <GenericForm
          schema={updatePayoutInfoInputSchema}
          fields={payoutFields}
          defaultValues={payoutDefaults}
          columns={2}
          submitLabel="Lưu tài khoản"
          method="patch"
          transform={(v) => ({ ...v, intent: 'payout' })}
          serverError={result?.error ?? null}
          fieldErrors={result?.fieldErrors ?? null}
        />
      </CardContent>
    </Card>
  );
}
