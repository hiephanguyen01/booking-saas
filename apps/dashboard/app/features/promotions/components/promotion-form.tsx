import { useState, type FormEvent } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
import type { PromotionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Switch } from '@booking/ui/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { SCOPE_LABELS, type ScopeKey } from '~/constants/promotion';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { ScopeOptions } from '../server/scope-options.server';
import { TimeWindowsEditor, type TimeWindow } from './time-windows';
import { usePromotionScope } from './use-promotion-scope';

/**
 * Dedicated (non-GenericForm) promotion editor. The shared create/update schema
 * uses `.default()` + `superRefine`, so per CLAUDE §6 we hand-roll the form and
 * re-validate with the same shared zod schema in the route `action` (via
 * `readPromotionForm` in `./promotion-form.server`). Money and percent values are
 * submitted as digit strings; off-peak windows as a JSON blob.
 *
 * When `restrictPartnerFunded` is set (the partner surface) the funding selector is
 * hidden and everything is partner-funded; the tenant surface shows all options.
 */
export function PromotionForm({
  mode,
  promotion,
  submitLabel,
  scopeOptions,
  categoryOptions,
  scopeChoices,
  restrictPartnerFunded = false,
  selfPartnerId,
}: {
  mode: 'create' | 'edit';
  promotion?: PromotionResponse;
  submitLabel: string;
  scopeOptions?: ScopeOptions;
  categoryOptions?: { id: string; label: string }[];
  scopeChoices?: ScopeKey[];
  restrictPartnerFunded?: boolean;
  selfPartnerId?: string;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  const [discountType, setDiscountType] = useState<string>(
    promotion?.discountType ?? 'percent',
  );
  const [status, setStatus] = useState<string>(
    promotion?.status && promotion.status !== 'ended' ? promotion.status : 'draft',
  );
  const [isAuto, setIsAuto] = useState<boolean>(mode === 'edit' ? promotion?.code == null : false);
  const [firstBookingOnly, setFirstBookingOnly] = useState<boolean>(
    promotion?.firstBookingOnly ?? false,
  );
  const [storefrontVisible, setStorefrontVisible] = useState<boolean>(
    promotion?.storefrontVisible ?? false,
  );
  const [windows, setWindows] = useState<TimeWindow[]>(promotion?.timeWindows ?? []);
  const scope = usePromotionScope({
    promotion,
    restrictPartnerFunded,
    scopeChoices,
    scopeOptions,
    categoryOptions,
    selfPartnerId,
  });

  const cleanWindows = windows.filter((window) => window.days.length > 0 && window.from && window.to);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Form method="post" className="space-y-6" onSubmit={handleSubmit} aria-busy={busy}>
      <input type="hidden" name="intent" value={mode === 'create' ? 'create' : 'update'} />
      <input type="hidden" name="discountType" value={discountType} />
      <input type="hidden" name="fundedBy" value={scope.fundedBy} />
      <input type="hidden" name="appliesTo" value={scope.appliesTo} />
      <input type="hidden" name="appliesToId" value={scope.appliesToIdValue} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="isAuto" value={isAuto ? 'true' : 'false'} />
      <input type="hidden" name="firstBookingOnly" value={firstBookingOnly ? 'true' : 'false'} />
      <input
        type="hidden"
        name="storefrontVisible"
        value={!isAuto && storefrontVisible ? 'true' : 'false'}
      />
      <input
        type="hidden"
        name="timeWindows"
        value={cleanWindows.length ? JSON.stringify(cleanWindows) : ''}
      />

      <fieldset disabled={busy} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên chương trình" htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              maxLength={200}
              defaultValue={promotion?.name}
              placeholder="Khuyến mãi cuối tuần"
            />
          </Field>

          <div className="space-y-2">
            <Label htmlFor="code">Mã giảm giá</Label>
            {isAuto ? (
              <p className="flex h-11 items-center px-4 text-sm text-muted-foreground">
                Tự động áp dụng — không cần mã.
              </p>
            ) : (
              <Input
                id="code"
                name="code"
                required
                maxLength={50}
                defaultValue={promotion?.code ?? ''}
                placeholder="WEEKEND20"
                className="uppercase"
              />
            )}
          </div>

          <label className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={isAuto} onCheckedChange={setIsAuto} />
            <span className="text-sm">Chiến dịch tự động áp dụng (không cần khách nhập mã)</span>
          </label>

          <label className="flex items-start gap-3 sm:col-span-2">
            <Switch
              checked={!isAuto && storefrontVisible}
              disabled={isAuto}
              onCheckedChange={setStorefrontVisible}
              className="mt-0.5"
            />
            <span className="space-y-1 text-sm">
              <span className="block">Hiển thị mã trong popup checkout</span>
              <span className="block text-xs text-muted-foreground">
                Mã riêng vẫn có thể được nhập thủ công. Chiến dịch tự động không xuất hiện trong danh sách.
              </span>
            </span>
          </label>

          <Field label="Loại giảm giá" htmlFor="discountType">
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger id="discountType">
                <SelectValue />
              </SelectTrigger>
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
            <Input
              id="discountValue"
              name="discountValue"
              required
              inputMode="numeric"
              defaultValue={promotion?.discountValue}
              placeholder={discountType === 'percent' ? '20' : '50000'}
            />
          </Field>

          {discountType === 'percent' ? (
            <Field label="Giảm tối đa (₫, tuỳ chọn)" htmlFor="maxDiscount">
              <Input
                id="maxDiscount"
                name="maxDiscount"
                inputMode="numeric"
                defaultValue={promotion?.maxDiscount ?? ''}
                placeholder="100000"
              />
            </Field>
          ) : null}

          {!restrictPartnerFunded ? (
            <Field label="Bên chịu chi phí" htmlFor="fundedBy">
              <Select value={scope.fundedBy} onValueChange={scope.changeFundedBy}>
                <SelectTrigger id="fundedBy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Cửa hàng (tenant)</SelectItem>
                  <SelectItem value="partner">Đối tác (cần đối tác đồng ý)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field label="Áp dụng cho" htmlFor="appliesTo">
            <Select
              value={scope.appliesTo}
              onValueChange={(value) => scope.changeAppliesTo(value as ScopeKey)}
            >
              <SelectTrigger id="appliesTo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scope.effectiveChoices.map((choice) => (
                  <SelectItem key={choice} value={choice}>
                    {SCOPE_LABELS[choice]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {scope.appliesTo !== 'all' && !scope.isSelfPartnerScope ? (
            <Field
              label={`Mục tiêu: ${SCOPE_LABELS[scope.appliesTo]}`}
              htmlFor="appliesToIdPicker"
            >
              {scope.optionList ? (
                <Select value={scope.appliesToId} onValueChange={scope.setAppliesToId}>
                  <SelectTrigger id="appliesToIdPicker">
                    <SelectValue placeholder="Chọn mục tiêu" />
                  </SelectTrigger>
                  <SelectContent>
                    {scope.optionList.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="appliesToIdPicker"
                  value={scope.appliesToId}
                  onChange={(event) => scope.setAppliesToId(event.target.value)}
                  placeholder="UUID mục tiêu"
                />
              )}
            </Field>
          ) : null}

          <Field label="Đơn tối thiểu (₫, tuỳ chọn)" htmlFor="minOrderAmount">
            <Input
              id="minOrderAmount"
              name="minOrderAmount"
              inputMode="numeric"
              defaultValue={promotion?.minOrderAmount ?? ''}
              placeholder="200000"
            />
          </Field>
          <Field label="Giới hạn tổng lượt dùng (tuỳ chọn)" htmlFor="usageLimitTotal">
            <Input
              id="usageLimitTotal"
              name="usageLimitTotal"
              inputMode="numeric"
              defaultValue={promotion?.usageLimitTotal ?? ''}
              placeholder="500"
            />
          </Field>
          <Field label="Giới hạn mỗi khách (tuỳ chọn)" htmlFor="usageLimitPerCustomer">
            <Input
              id="usageLimitPerCustomer"
              name="usageLimitPerCustomer"
              inputMode="numeric"
              defaultValue={promotion?.usageLimitPerCustomer ?? ''}
              placeholder="1"
            />
          </Field>

          <label className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={firstBookingOnly} onCheckedChange={setFirstBookingOnly} />
            <span className="text-sm">Chỉ áp dụng cho lần đặt đầu tiên của khách</span>
          </label>

          <Field label="Trạng thái" htmlFor="status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Nháp</SelectItem>
                <SelectItem value="active">Đang chạy</SelectItem>
                <SelectItem value="paused">Tạm dừng</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Bắt đầu (tuỳ chọn)" htmlFor="startsAt">
            <Input
              id="startsAt"
              name="startsAt"
              type="date"
              defaultValue={isoToDate(promotion?.startsAt)}
            />
          </Field>
          <Field label="Kết thúc (tuỳ chọn)" htmlFor="endsAt">
            <Input
              id="endsAt"
              name="endsAt"
              type="date"
              defaultValue={isoToDate(promotion?.endsAt)}
            />
          </Field>
        </div>

        <TimeWindowsEditor windows={windows} onChange={setWindows} />

        {scope.fundedBy === 'partner' && !restrictPartnerFunded ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Khuyến mãi do đối tác tài trợ sẽ <strong>chưa có hiệu lực</strong> cho tới khi đối tác
            đồng ý (opt-in) trong trang quản trị của họ.
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
      </fieldset>
    </Form>
  );
}

function isoToDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
