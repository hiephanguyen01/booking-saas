import { useState } from 'react';
import { Form, useNavigation } from 'react-router';
import type { PromotionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@booking/ui/components/ui/select';

/**
 * Dedicated (non-GenericForm) promotion editor. The shared create/update schema
 * uses `.default()` + `superRefine`, so per CLAUDE §6 we hand-roll the form and
 * re-validate with the same shared zod schema in the route `action`. Money and
 * percent values are submitted as digit strings.
 */
export function PromotionForm({
  mode,
  promotion,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  promotion?: PromotionResponse;
  submitLabel: string;
}) {
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  const [discountType, setDiscountType] = useState<string>(promotion?.discountType ?? 'percent');
  const [appliesTo, setAppliesTo] = useState<string>(
    promotion?.appliesTo === 'listing' ? 'listing' : 'all',
  );
  const [status, setStatus] = useState<string>(promotion?.status && promotion.status !== 'ended' ? promotion.status : 'draft');

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="intent" value={mode === 'create' ? 'create' : 'update'} />
      <input type="hidden" name="discountType" value={discountType} />
      <input type="hidden" name="appliesTo" value={appliesTo} />
      <input type="hidden" name="status" value={status} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên chương trình" htmlFor="name">
          <Input id="name" name="name" required maxLength={200} defaultValue={promotion?.name} placeholder="Khuyến mãi cuối tuần" />
        </Field>
        <Field label="Mã giảm giá" htmlFor="code">
          <Input id="code" name="code" required maxLength={50} defaultValue={promotion?.code ?? ''} placeholder="WEEKEND20" className="uppercase" />
        </Field>

        <Field label="Loại giảm giá" htmlFor="discountType">
          <Select value={discountType} onValueChange={setDiscountType}>
            <SelectTrigger id="discountType"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Theo phần trăm (%)</SelectItem>
              <SelectItem value="fixed">Số tiền cố định (₫)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={discountType === 'percent' ? 'Phần trăm giảm (1–100)' : 'Số tiền giảm (₫)'}
          htmlFor="discountValue"
        >
          <Input id="discountValue" name="discountValue" required inputMode="numeric" defaultValue={promotion?.discountValue} placeholder={discountType === 'percent' ? '20' : '50000'} />
        </Field>

        {discountType === 'percent' ? (
          <Field label="Giảm tối đa (₫, tuỳ chọn)" htmlFor="maxDiscount">
            <Input id="maxDiscount" name="maxDiscount" inputMode="numeric" defaultValue={promotion?.maxDiscount ?? ''} placeholder="100000" />
          </Field>
        ) : null}

        <Field label="Áp dụng cho" htmlFor="appliesTo">
          <Select value={appliesTo} onValueChange={setAppliesTo}>
            <SelectTrigger id="appliesTo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toàn bộ cửa hàng</SelectItem>
              <SelectItem value="listing">Một listing cụ thể</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {appliesTo === 'listing' ? (
          <Field label="ID listing" htmlFor="appliesToId">
            <Input id="appliesToId" name="appliesToId" defaultValue={promotion?.appliesToId ?? ''} placeholder="UUID của listing" />
          </Field>
        ) : null}

        <Field label="Đơn tối thiểu (₫, tuỳ chọn)" htmlFor="minOrderAmount">
          <Input id="minOrderAmount" name="minOrderAmount" inputMode="numeric" defaultValue={promotion?.minOrderAmount ?? ''} placeholder="200000" />
        </Field>
        <Field label="Giới hạn lượt dùng (tuỳ chọn)" htmlFor="usageLimitTotal">
          <Input id="usageLimitTotal" name="usageLimitTotal" inputMode="numeric" defaultValue={promotion?.usageLimitTotal ?? ''} placeholder="500" />
        </Field>

        <Field label="Trạng thái" htmlFor="status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Nháp</SelectItem>
              <SelectItem value="active">Đang chạy</SelectItem>
              <SelectItem value="paused">Tạm dừng</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Button type="submit" disabled={busy}>{submitLabel}</Button>
    </Form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Builds a promotion input object from submitted form data (blanks → undefined). */
export function readPromotionForm(form: FormData): Record<string, unknown> {
  const str = (k: string) => {
    const v = form.get(k);
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? undefined : s;
  };
  const num = (k: string) => {
    const s = str(k);
    return s === undefined ? undefined : Number(s);
  };
  return {
    name: str('name'),
    code: str('code'),
    discountType: str('discountType'),
    discountValue: str('discountValue'),
    maxDiscount: str('maxDiscount'),
    appliesTo: str('appliesTo'),
    appliesToId: str('appliesToId'),
    minOrderAmount: str('minOrderAmount'),
    usageLimitTotal: num('usageLimitTotal'),
    status: str('status'),
  };
}
