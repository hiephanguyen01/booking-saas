import {
  createCancellationPolicyInputSchema,
  type CancellationPolicyResponse,
  type CreateCancellationPolicyInput,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { CancellationTierFields } from './cancellation-tier-fields';

const fields: FieldConfig<CreateCancellationPolicyInput>[] = [
  {
    name: 'name',
    type: 'text',
    label: 'Tên chính sách',
    placeholder: 'Ví dụ: Huỷ linh hoạt',
    colSpan: 2,
  },
];

export function cancellationPolicyFormDefaultValues(
  policy?: CancellationPolicyResponse,
): CreateCancellationPolicyInput {
  return {
    name: policy?.name ?? '',
    rules: policy?.rules?.length ? policy.rules : [{ hoursBefore: 24, refundPercent: 100 }],
  };
}

export function CancellationPolicyForm({
  policy,
  serverError,
  fieldErrors,
  intent,
}: {
  policy?: CancellationPolicyResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
  intent?: string;
}) {
  const isEdit = Boolean(policy);

  return (
    <GenericForm
      schema={createCancellationPolicyInputSchema}
      fields={fields}
      columns={2}
      defaultValues={cancellationPolicyFormDefaultValues(policy)}
      submitLabel={isEdit ? 'Lưu thay đổi' : 'Tạo chính sách'}
      submitPendingLabel={isEdit ? 'Đang lưu...' : 'Đang tạo...'}
      serverError={serverError}
      fieldErrors={fieldErrors}
      extraFields={(form) => <CancellationTierFields form={form} />}
      transform={(data) => ({
        ...(intent ? { intent } : {}),
        ...(policy ? { policyId: policy.id } : {}),
        name: data.name.trim(),
        rules: data.rules.map((rule) => ({
          hoursBefore: Math.max(0, Math.round(Number(rule.hoursBefore) || 0)),
          refundPercent: Math.max(0, Math.min(100, Math.round(Number(rule.refundPercent) || 0))),
        })),
      })}
    />
  );
}
