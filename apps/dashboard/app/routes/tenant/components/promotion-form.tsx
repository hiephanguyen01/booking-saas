import { useState } from 'react';
import { Form, useNavigation } from 'react-router';
import type { PromotionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Switch } from '@booking/ui/components/ui/switch';
import { cn } from '@booking/ui/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@booking/ui/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import type { ScopeOptions } from '../promotions/scope-options.server';

type ScopeKey = 'all' | 'listing' | 'listing_type' | 'listing_group' | 'category' | 'partner';
type TimeWindow = { days: number[]; from: string; to: string };

const SCOPE_LABELS: Record<ScopeKey, string> = {
  all: 'Toàn bộ cửa hàng',
  listing: 'Một listing cụ thể',
  listing_type: 'Loại dịch vụ',
  listing_group: 'Bài đăng (nhóm)',
  category: 'Danh mục',
  partner: 'Đối tác',
};
const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // 0=Sunday … 6=Saturday

/**
 * Dedicated (non-GenericForm) promotion editor. The shared create/update schema
 * uses `.default()` + `superRefine`, so per CLAUDE §6 we hand-roll the form and
 * re-validate with the same shared zod schema in the route `action`. Money and
 * percent values are submitted as digit strings; off-peak windows as a JSON blob.
 *
 * When `restrictPartnerFunded` is set (the partner surface) the funding selector is
 * hidden and everything is partner-funded; the tenant surface shows all options.
 */
export function PromotionForm({
  mode,
  promotion,
  submitLabel,
  scopeOptions,
  scopeChoices,
  restrictPartnerFunded = false,
  selfPartnerId,
}: {
  mode: 'create' | 'edit';
  promotion?: PromotionResponse;
  submitLabel: string;
  scopeOptions?: ScopeOptions;
  /** Which `appliesTo` values to offer (defaults to the full tenant set). */
  scopeChoices?: ScopeKey[];
  restrictPartnerFunded?: boolean;
  /** On the partner surface, the `partner` scope auto-targets this id (their own). */
  selfPartnerId?: string;
}) {
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  const [discountType, setDiscountType] = useState<string>(promotion?.discountType ?? 'percent');
  const [fundedBy, setFundedBy] = useState<string>(
    restrictPartnerFunded ? 'partner' : (promotion?.fundedBy ?? 'tenant'),
  );
  const [appliesTo, setAppliesTo] = useState<ScopeKey>((promotion?.appliesTo as ScopeKey) ?? 'all');
  const [appliesToId, setAppliesToId] = useState<string>(promotion?.appliesToId ?? '');
  const [status, setStatus] = useState<string>(promotion?.status && promotion.status !== 'ended' ? promotion.status : 'draft');
  const [isAuto, setIsAuto] = useState<boolean>(mode === 'edit' ? promotion?.code == null : false);
  const [firstBookingOnly, setFirstBookingOnly] = useState<boolean>(promotion?.firstBookingOnly ?? false);
  const [windows, setWindows] = useState<TimeWindow[]>(promotion?.timeWindows ?? []);

  const choices = scopeChoices ?? (['all', 'listing', 'listing_type', 'listing_group', 'category', 'partner'] as ScopeKey[]);
  // A partner-funded promo must target a single partner (§12.2) — narrow the scope options.
  const effectiveChoices = fundedBy === 'partner' ? choices.filter((c) => c === 'partner' || c === 'listing' || c === 'listing_group') : choices;
  const optionList = optionsForScope(appliesTo, scopeOptions);
  const cleanWindows = windows.filter((w) => w.days.length > 0 && w.from && w.to);
  // The partner "self" scope targets the partner's own id — no picker needed.
  const isSelfPartnerScope = appliesTo === 'partner' && !!selfPartnerId;
  const appliesToIdValue = appliesTo === 'all' ? '' : isSelfPartnerScope ? selfPartnerId! : appliesToId;

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="intent" value={mode === 'create' ? 'create' : 'update'} />
      <input type="hidden" name="discountType" value={discountType} />
      <input type="hidden" name="fundedBy" value={fundedBy} />
      <input type="hidden" name="appliesTo" value={appliesTo} />
      <input type="hidden" name="appliesToId" value={appliesToIdValue} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="isAuto" value={isAuto ? 'true' : 'false'} />
      <input type="hidden" name="firstBookingOnly" value={firstBookingOnly ? 'true' : 'false'} />
      <input type="hidden" name="timeWindows" value={cleanWindows.length ? JSON.stringify(cleanWindows) : ''} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên chương trình" htmlFor="name">
          <Input id="name" name="name" required maxLength={200} defaultValue={promotion?.name} placeholder="Khuyến mãi cuối tuần" />
        </Field>

        <div className="space-y-2">
          <Label htmlFor="code">Mã giảm giá</Label>
          {isAuto ? (
            /* Not a control — a paragraph standing in for the code Input, so it
               hardcodes the 44px control box to keep the grid row aligned. */
            <p className="flex h-11 items-center px-4 text-sm text-muted-foreground">Tự động áp dụng — không cần mã.</p>
          ) : (
            <Input id="code" name="code" required maxLength={50} defaultValue={promotion?.code ?? ''} placeholder="WEEKEND20" className="uppercase" />
          )}
        </div>

        <label className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={isAuto} onCheckedChange={setIsAuto} />
          <span className="text-sm">Chiến dịch tự động áp dụng (không cần khách nhập mã)</span>
        </label>

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

        {!restrictPartnerFunded ? (
          <Field label="Bên chịu chi phí" htmlFor="fundedBy">
            <Select value={fundedBy} onValueChange={(v) => { setFundedBy(v); if (v === 'partner' && appliesTo !== 'listing' && appliesTo !== 'listing_group' && appliesTo !== 'partner') { setAppliesTo('listing'); } }}>
              <SelectTrigger id="fundedBy"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Cửa hàng (tenant)</SelectItem>
                <SelectItem value="partner">Đối tác (cần đối tác đồng ý)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field label="Áp dụng cho" htmlFor="appliesTo">
          <Select value={appliesTo} onValueChange={(v) => { setAppliesTo(v as ScopeKey); setAppliesToId(''); }}>
            <SelectTrigger id="appliesTo"><SelectValue /></SelectTrigger>
            <SelectContent>
              {effectiveChoices.map((c) => (
                <SelectItem key={c} value={c}>{SCOPE_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {appliesTo !== 'all' && !isSelfPartnerScope ? (
          <Field label={`Mục tiêu: ${SCOPE_LABELS[appliesTo]}`} htmlFor="appliesToIdPicker">
            {optionList ? (
              <Select value={appliesToId} onValueChange={setAppliesToId}>
                <SelectTrigger id="appliesToIdPicker"><SelectValue placeholder="Chọn mục tiêu" /></SelectTrigger>
                <SelectContent>
                  {optionList.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="appliesToIdPicker" value={appliesToId} onChange={(e) => setAppliesToId(e.target.value)} placeholder="UUID mục tiêu" />
            )}
          </Field>
        ) : null}

        <Field label="Đơn tối thiểu (₫, tuỳ chọn)" htmlFor="minOrderAmount">
          <Input id="minOrderAmount" name="minOrderAmount" inputMode="numeric" defaultValue={promotion?.minOrderAmount ?? ''} placeholder="200000" />
        </Field>
        <Field label="Giới hạn tổng lượt dùng (tuỳ chọn)" htmlFor="usageLimitTotal">
          <Input id="usageLimitTotal" name="usageLimitTotal" inputMode="numeric" defaultValue={promotion?.usageLimitTotal ?? ''} placeholder="500" />
        </Field>
        <Field label="Giới hạn mỗi khách (tuỳ chọn)" htmlFor="usageLimitPerCustomer">
          <Input id="usageLimitPerCustomer" name="usageLimitPerCustomer" inputMode="numeric" defaultValue={promotion?.usageLimitPerCustomer ?? ''} placeholder="1" />
        </Field>

        <label className="flex items-center gap-3 sm:col-span-2">
          <Switch checked={firstBookingOnly} onCheckedChange={setFirstBookingOnly} />
          <span className="text-sm">Chỉ áp dụng cho lần đặt đầu tiên của khách</span>
        </label>

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

      <TimeWindowsEditor windows={windows} onChange={setWindows} />

      {fundedBy === 'partner' && !restrictPartnerFunded ? (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Khuyến mãi do đối tác tài trợ sẽ <strong>chưa có hiệu lực</strong> cho tới khi đối tác đồng ý (opt-in) trong trang quản trị của họ.
        </p>
      ) : null}

      <Button type="submit" disabled={busy}>{submitLabel}</Button>
    </Form>
  );
}

function TimeWindowsEditor({ windows, onChange }: { windows: TimeWindow[]; onChange: (w: TimeWindow[]) => void }) {
  const update = (i: number, patch: Partial<TimeWindow>) => onChange(windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  const toggleDay = (i: number, day: number) => {
    const w = windows[i];
    const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day].sort((a, b) => a - b);
    update(i, { days });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label>Khung giờ ưu đãi (off-peak, tuỳ chọn)</Label>
          <p className="text-sm text-muted-foreground">Chỉ áp dụng khi giờ bắt đầu đặt rơi vào một trong các khung giờ.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...windows, { days: [], from: '18:00', to: '22:00' }])}>
          <Plus className="size-4" /> Thêm khung giờ
        </Button>
      </div>
      {windows.map((w, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Ngày trong tuần</Label>
            <div className="flex gap-1">
              {DAY_LABELS.map((lbl, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(i, day)}
                  className={cn(
                    'size-8 rounded-md border text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    w.days.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`from-${i}`}>Từ</Label>
            <Input id={`from-${i}`} type="time" value={w.from} onChange={(e) => update(i, { from: e.target.value })} className="w-32" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`to-${i}`}>Đến</Label>
            <Input id={`to-${i}`} type="time" value={w.to} onChange={(e) => update(i, { to: e.target.value })} className="w-32" />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(windows.filter((_, idx) => idx !== i))} aria-label="Xoá khung giờ">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function optionsForScope(scope: ScopeKey, opts?: ScopeOptions): { id: string; label: string }[] | null {
  if (!opts) return null;
  switch (scope) {
    case 'listing': return opts.listings;
    case 'listing_type': return opts.listingTypes;
    case 'listing_group': return opts.listingGroups;
    case 'partner': return opts.partners;
    default: return null; // category has no list endpoint → raw id input
  }
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
  const isAuto = form.get('isAuto') === 'true';
  let timeWindows: unknown = undefined;
  const rawWindows = str('timeWindows');
  if (rawWindows) {
    try {
      timeWindows = JSON.parse(rawWindows);
    } catch {
      timeWindows = undefined;
    }
  }
  return {
    name: str('name'),
    // Explicit null → auto-campaign (also clears an existing code on update).
    code: isAuto ? null : str('code'),
    discountType: str('discountType'),
    discountValue: str('discountValue'),
    maxDiscount: str('maxDiscount'),
    fundedBy: str('fundedBy'),
    appliesTo: str('appliesTo'),
    appliesToId: str('appliesToId'),
    minOrderAmount: str('minOrderAmount'),
    firstBookingOnly: form.get('firstBookingOnly') === 'true',
    usageLimitTotal: num('usageLimitTotal'),
    usageLimitPerCustomer: num('usageLimitPerCustomer'),
    timeWindows,
    status: str('status'),
  };
}
