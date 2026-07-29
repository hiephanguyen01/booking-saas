import { useState, type FormEvent } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
import type { PromotionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Switch } from '@booking/ui/components/ui/switch';
import { Info } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { SCOPE_LABELS, type ScopeKey } from '~/constants/promotion';
import {
  FormActions,
  FormSurface,
  Grid,
  Section,
  ToggleRow,
} from '~/components/form-layout';
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

      <fieldset disabled={busy} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <FormSurface>
          <Section
            title="Cách khách nhận ưu đãi"
            description="Chọn tự động hoặc dùng mã để khách chủ động nhập khi thanh toán."
          >
            <Grid>
              <Field label="Tên chương trình" htmlFor="name">
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={200}
                  defaultValue={promotion?.name}
                  placeholder="Ví dụ: Ưu đãi cuối tuần"
                />
              </Field>
              <Field label="Mã giảm giá" htmlFor="code">
                {isAuto ? (
                  <div className="flex h-11 items-center rounded-md border border-dashed bg-muted/20 px-4 text-sm text-muted-foreground">
                    Không cần mã — hệ thống tự áp dụng
                  </div>
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
              </Field>
            </Grid>
            <ToggleRow
              title="Tự động áp dụng"
              description="Khách đủ điều kiện sẽ nhận ưu đãi ngay, không phải nhớ và nhập mã."
              control={<Switch checked={isAuto} onCheckedChange={setIsAuto} />}
              muted
            />
            <ToggleRow
              title="Gợi ý mã ở bước thanh toán"
              description={
                isAuto
                  ? 'Không áp dụng cho chiến dịch tự động.'
                  : 'Hiển thị mã trong popup checkout; khách vẫn có thể tự nhập mã nếu tắt lựa chọn này.'
              }
              control={
                <Switch
                  checked={!isAuto && storefrontVisible}
                  disabled={isAuto}
                  onCheckedChange={setStorefrontVisible}
                />
              }
            />
          </Section>

          <Section
            title="Mức ưu đãi"
            description="Xác định số tiền được giảm và bên chịu chi phí cho mỗi đơn."
          >
            <Grid>
              <Field label="Cách tính" htmlFor="discountType">
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
                label={discountType === 'percent' ? 'Mức giảm (%)' : 'Số tiền giảm (₫)'}
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
                <Field label="Giảm tối đa (₫)" htmlFor="maxDiscount">
                  <Input
                    id="maxDiscount"
                    name="maxDiscount"
                    inputMode="numeric"
                    defaultValue={promotion?.maxDiscount ?? ''}
                    placeholder="Để trống nếu không giới hạn"
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
                      <SelectItem value="tenant">Cửa hàng</SelectItem>
                      <SelectItem value="partner">Đối tác</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
            </Grid>
            {scope.fundedBy === 'partner' && !restrictPartnerFunded ? (
              <div className="flex gap-3 rounded-lg border bg-muted/25 px-4 py-3 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="leading-6 text-muted-foreground">
                  Khuyến mãi chỉ có hiệu lực sau khi đối tác đồng ý tài trợ trong trang quản trị của
                  họ.
                </p>
              </div>
            ) : null}
          </Section>

          <Section
            title="Phạm vi áp dụng"
            description="Chọn chính xác nhóm dịch vụ được dùng khuyến mãi này."
          >
            <Grid>
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
                  label={`Chọn ${SCOPE_LABELS[scope.appliesTo].toLocaleLowerCase('vi')}`}
                  htmlFor="appliesToIdPicker"
                >
                  {scope.optionList ? (
                    <Select value={scope.appliesToId} onValueChange={scope.setAppliesToId}>
                      <SelectTrigger id="appliesToIdPicker">
                        <SelectValue placeholder="Chọn một mục" />
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
                      placeholder="Nhập mã mục tiêu"
                    />
                  )}
                </Field>
              ) : null}
            </Grid>
          </Section>

          <Section
            title="Điều kiện sử dụng"
            description="Giới hạn giá trị đơn và số lượt để kiểm soát ngân sách."
          >
            <Grid>
              <Field label="Đơn tối thiểu (₫)" htmlFor="minOrderAmount">
                <Input
                  id="minOrderAmount"
                  name="minOrderAmount"
                  inputMode="numeric"
                  defaultValue={promotion?.minOrderAmount ?? ''}
                  placeholder="Không yêu cầu"
                />
              </Field>
              <Field label="Tổng lượt sử dụng" htmlFor="usageLimitTotal">
                <Input
                  id="usageLimitTotal"
                  name="usageLimitTotal"
                  inputMode="numeric"
                  defaultValue={promotion?.usageLimitTotal ?? ''}
                  placeholder="Không giới hạn"
                />
              </Field>
              <Field label="Số lượt mỗi khách" htmlFor="usageLimitPerCustomer">
                <Input
                  id="usageLimitPerCustomer"
                  name="usageLimitPerCustomer"
                  inputMode="numeric"
                  defaultValue={promotion?.usageLimitPerCustomer ?? ''}
                  placeholder="Không giới hạn"
                />
              </Field>
            </Grid>
            <ToggleRow
              title="Chỉ dành cho khách đặt lần đầu"
              description="Mỗi khách chỉ được nhận ưu đãi ở đơn đặt đầu tiên."
              control={
                <Switch checked={firstBookingOnly} onCheckedChange={setFirstBookingOnly} />
              }
            />
          </Section>

          <Section
            title="Lịch chạy"
            description="Chọn thời gian chiến dịch hoạt động. Để trống ngày nếu không giới hạn."
          >
            <Grid>
              <Field label="Trạng thái sau khi lưu" htmlFor="status">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Lưu nháp</SelectItem>
                    <SelectItem value="active">Bắt đầu chạy</SelectItem>
                    <SelectItem value="paused">Tạm dừng</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="hidden sm:block" />
              <Field label="Ngày bắt đầu" htmlFor="startsAt">
                <Input
                  id="startsAt"
                  name="startsAt"
                  type="date"
                  defaultValue={isoToDate(promotion?.startsAt)}
                />
              </Field>
              <Field label="Ngày kết thúc" htmlFor="endsAt">
                <Input
                  id="endsAt"
                  name="endsAt"
                  type="date"
                  defaultValue={isoToDate(promotion?.endsAt)}
                />
              </Field>
            </Grid>
            <TimeWindowsEditor windows={windows} onChange={setWindows} />
          </Section>
        </FormSurface>

        <FormActions hint="Bạn có thể lưu nháp trước và kích hoạt khi mọi điều kiện đã sẵn sàng.">
          <Button type="submit" size="control" disabled={busy} className="px-8 font-semibold">
            {busy ? 'Đang lưu...' : submitLabel}
          </Button>
        </FormActions>
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
