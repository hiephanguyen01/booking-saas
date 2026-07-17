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
    placeholder: 'VD: Huỷ linh hoạt',
    colSpan: 2,
  },
];

export function cancellationPolicyFormDefaultValues(
  p?: CancellationPolicyResponse,
): CreateCancellationPolicyInput {
  return {
    name: p?.name ?? '',
    rules: p?.rules?.length ? p.rules : [{ hoursBefore: 24, refundPercent: 100 }],
  };
}

export function CancellationPolicyForm({
  policy,
  serverError,
  fieldErrors,
}: {
  policy?: CancellationPolicyResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
}) {
  const isEdit = Boolean(policy);

  return (
    <GenericForm
      schema={createCancellationPolicyInputSchema}
      fields={fields}
      columns={2}
      defaultValues={cancellationPolicyFormDefaultValues(policy)}
      submitLabel={isEdit ? 'Lưu thay đổi' : 'Tạo chính sách'}
      serverError={serverError}
      fieldErrors={fieldErrors}
      extraFields={(form) => <CancellationTierFields form={form} />}
      transform={(d) => ({
        name: d.name.trim(),
        rules: d.rules.map((r) => ({
          hoursBefore: Math.max(0, Math.round(Number(r.hoursBefore) || 0)),
          refundPercent: Math.max(0, Math.min(100, Math.round(Number(r.refundPercent) || 0))),
        })),
      })}
    />
  );
}
