import type { CancellationPolicyResponse, CreateListingInput } from '@booking/contracts';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
import { Button } from '@booking/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { CancellationTiers } from '~/components/cancellation-tiers';
import { dashboardPaths } from '~/constants/paths';
import { Section } from '~/components/form-layout';

const USE_DEFAULT = '__use_default__';

export function ListingCancellationPolicyField({
  form,
  policies,
  embedded = false,
}: {
  form: UseFormReturn<CreateListingInput>;
  policies: CancellationPolicyResponse[];
  embedded?: boolean;
}) {
  const defaultPolicy = policies.find((policy) => policy.isDefault) ?? null;

  const field = (
    <>
      <Controller
        control={form.control}
        name="cancellationPolicyId"
        render={({ field, fieldState }) => {
          const explicitlySelected = policies.find((policy) => policy.id === field.value) ?? null;
          const preview = explicitlySelected ?? defaultPolicy;
          const errorId = 'listing-cancellation-policy-error';

          return (
            <div className="space-y-4">
              {policies.length > 0 ? (
                <Select
                  value={field.value ?? USE_DEFAULT}
                  onValueChange={(value) =>
                    field.onChange(value === USE_DEFAULT ? undefined : value)
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? errorId : undefined}
                  >
                    <SelectValue placeholder="Chọn chính sách hủy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={USE_DEFAULT}>Dùng chính sách mặc định</SelectItem>
                    {policies.map((policy) => (
                      <SelectItem key={policy.id} value={policy.id}>
                        {policy.name}
                        {policy.isDefault ? ' · Mặc định' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {fieldState.error?.message ? (
                <p id={errorId} className="text-xs text-destructive" role="alert">
                  {fieldState.error.message}
                </p>
              ) : null}

              {preview ? (
                <div className="rounded-lg bg-muted/40 p-4">
                  <div className="mb-3">
                    <p className="font-medium">{preview.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {explicitlySelected ? 'Áp dụng riêng cho tin này' : 'Đang dùng mặc định'}
                      {' · '}
                      {preview.partnerId === null ? 'Chính sách hệ thống' : 'Chính sách của bạn'}
                    </p>
                  </div>
                  <CancellationTiers rules={preview.rules} />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4">
                  <p className="text-sm font-medium">
                    {policies.length > 0
                      ? 'Chưa chọn chính sách hủy'
                      : 'Chưa có chính sách hủy để áp dụng'}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {policies.length > 0
                      ? 'Chọn một chính sách ở phía trên để xem trước các mốc hoàn tiền.'
                      : 'Tạo chính sách với các mốc hoàn tiền cụ thể rồi quay lại chọn cho tin đăng.'}
                  </p>
                </div>
              )}

              {policies.length === 0 ? (
                <div className="space-y-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link
                      to={dashboardPaths.partner.newCancellationPolicy}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tạo chính sách hủy
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Trang tạo sẽ mở ở tab mới. Tải lại form này sau khi hoàn tất.
                  </p>
                </div>
              ) : null}
            </div>
          );
        }}
      />
    </>
  );

  if (embedded) return field;

  return (
    <Section
      title="Chính sách hủy"
      description="Khách sẽ thấy rõ các mốc hoàn tiền này trước khi xác nhận đặt chỗ."
    >
      {field}
    </Section>
  );
}
