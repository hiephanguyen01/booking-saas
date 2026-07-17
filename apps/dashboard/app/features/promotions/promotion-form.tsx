import { useState } from 'react';
import { Form, useNavigation } from 'react-router';
import type { PromotionResponse, PromotionTimeWindowDto } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Switch } from '@booking/ui/components/ui/switch';
import { cn } from '@booking/ui/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@booking/ui/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import type { ScopeOptions } from './scope-options.server';

export type ScopeKey = 'all' | 'listing' | 'listing_type' | 'listing_group' | 'category' | 'partner';
type TimeWindow = { days: number[]; from: string; to: string };

/** Scope enum → Vietnamese label — shared with the detail pages (§12.2). */
export const SCOPE_LABELS: Record<ScopeKey, string> = {
  all: 'Toàn bộ cửa hàng',
  listing: 'Một listing cụ thể',
  listing_type: 'Loại dịch vụ',
  listing_group: 'Bài đăng (nhóm)',
  category: 'Danh mục',
  partner: 'Đối tác',
};
const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // 0=Sunday … 6=Saturday

/** Read-only off-peak windows as a list; empty → "Mọi khung giờ" (always applicable). */
export function TimeWindowsSummary({ windows }: { windows: PromotionTimeWindowDto[] | null }) {
  if (!windows || windows.length === 0) {
    return <span className="text-muted-foreground">Mọi khung giờ</span>;
  }
  return (
    <ul className="space-y-1">
      {windows.map((w, i) => (
        <li key={i} className="tabular-nums">
          <span className="font-medium">{w.days.map((d) => DAY_LABELS[d] ?? d).join(', ')}</span>
          <span className="text-muted-foreground"> · {w.from}–{w.to}</span>
        </li>
      ))}
    </ul>
  );
}

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
  categoryOptions,
  scopeChoices,
  restrictPartnerFunded = false,
  selfPartnerId,
}: {
  mode: 'create' | 'edit';
  promotion?: PromotionResponse;
  submitLabel: string;
  scopeOptions?: ScopeOptions;
  /**
   * Options for the `category` scope, from `GET /tenant/promotions/categories`. Passed
   * separately from `scopeOptions` so the partner surface (which has no category scope)
   * need not fetch them. Omitted → the scope falls back to a raw uuid input.
   */
  categoryOptions?: { id: string; label: string }[];
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

  /**
   * The only way `appliesTo` may change. A target id is meaningful *only* for the scope
   * it was picked under — carrying a category uuid into a `listing` scope submits a
   * cross-type id, which the server now rejects (and which used to be stored as a
   * promotion that silently matched nothing). Never call `setAppliesTo` directly.
   */
  const changeAppliesTo = (next: ScopeKey): void => {
    setAppliesTo(next);
    setAppliesToId('');
  };

  const choices = scopeChoices ?? (['all', 'listing', 'listing_type', 'listing_group', 'category', 'partner'] as ScopeKey[]);
  // A partner-funded promo must target a single partner (§12.2) — narrow the scope options.
  const effectiveChoices = fundedBy === 'partner' ? choices.filter((c) => c === 'partner' || c === 'listing' || c === 'listing_group') : choices;
  const optionList = optionsForScope(appliesTo, scopeOptions, categoryOptions);
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
            <Select
              value={fundedBy}
              onValueChange={(v) => {
                setFundedBy(v);
                // Partner-funded needs a single-partner scope (§12.2) — force one, and reset
                // the target with it, or the previous scope's id rides along as a wrong-type id.
                if (v === 'partner' && appliesTo !== 'listing' && appliesTo !== 'listing_group' && appliesTo !== 'partner') {
                  changeAppliesTo('listing');
                }
              }}
            >
              <SelectTrigger id="fundedBy"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Cửa hàng (tenant)</SelectItem>
                <SelectItem value="partner">Đối tác (cần đối tác đồng ý)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field label="Áp dụng cho" htmlFor="appliesTo">
          <Select value={appliesTo} onValueChange={(v) => changeAppliesTo(v as ScopeKey)}>
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

        {/* Date bounds — a blank input clears the bound (active immediately / no expiry). */}
        <Field label="Bắt đầu (tuỳ chọn)" htmlFor="startsAt">
          <Input id="startsAt" name="startsAt" type="date" defaultValue={isoToDate(promotion?.startsAt)} />
        </Field>
        <Field label="Kết thúc (tuỳ chọn)" htmlFor="endsAt">
          <Input id="endsAt" name="endsAt" type="date" defaultValue={isoToDate(promotion?.endsAt)} />
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

function optionsForScope(
  scope: ScopeKey,
  opts?: ScopeOptions,
  categories?: { id: string; label: string }[],
): { id: string; label: string }[] | null {
  // Categories come from their own endpoint, so they resolve even without `scopeOptions`.
  if (scope === 'category') return categories ?? null;
  if (!opts) return null;
  switch (scope) {
    case 'listing': return opts.listings;
    case 'listing_type': return opts.listingTypes;
    case 'listing_group': return opts.listingGroups;
    case 'partner': return opts.partners;
    default: return null; // `all` has no target to pick
  }
}

/** ISO instant → the `YYYY-MM-DD` a `type="date"` input expects (UTC day). Blank → ''. */
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

/**
 * Builds a promotion input object from submitted form data.
 *
 * Blank *conditions* (`maxDiscount`, `minOrderAmount`, both usage limits, `timeWindows`)
 * submit as **explicit `null`, not `undefined`** — this form renders the promotion's whole
 * condition set every time, so a field the user emptied means "remove this condition". The
 * server reads `undefined` as "leave alone", so sending `undefined` here is what made a cap
 * or limit impossible to clear once set. On create, `null` is simply "no condition".
 */
export function readPromotionForm(form: FormData): Record<string, unknown> {
  const str = (k: string) => {
    const v = form.get(k);
    const s = typeof v === 'string' ? v.trim() : '';
    return s === '' ? undefined : s;
  };
  /** A clearable condition: blank → null (clear it), never undefined (leave alone). */
  const clearableStr = (k: string) => str(k) ?? null;
  const clearableNum = (k: string) => {
    const s = str(k);
    return s === undefined ? null : Number(s);
  };
  /**
   * A clearable date bound: blank → null (clear it). The `type="date"` input submits a
   * `YYYY-MM-DD` string, which we widen to a UTC-midnight ISO instant (`.datetime()` on the
   * shared schema requires a `Z` offset). Concatenating the `Z` — rather than `new Date(...)`
   * — keeps the value timezone-stable regardless of where the action runs.
   */
  const clearableDate = (k: string) => {
    const s = str(k);
    return s === undefined ? null : `${s}T00:00:00.000Z`;
  };
  const isAuto = form.get('isAuto') === 'true';

  // Blank / unparseable → null: an empty editor means "no off-peak windows" (always applicable).
  let timeWindows: unknown = null;
  const rawWindows = str('timeWindows');
  if (rawWindows) {
    try {
      timeWindows = JSON.parse(rawWindows);
    } catch {
      timeWindows = null;
    }
  }

  return {
    name: str('name'),
    // Explicit null → auto-campaign (also clears an existing code on update).
    code: isAuto ? null : str('code'),
    discountType: str('discountType'),
    discountValue: str('discountValue'),
    // Note: the cap input only renders for a `percent` discount, so switching to `fixed`
    // submits it blank — which correctly clears a cap that no longer has any meaning.
    maxDiscount: clearableStr('maxDiscount'),
    fundedBy: str('fundedBy'),
    appliesTo: str('appliesTo'),
    appliesToId: str('appliesToId'),
    minOrderAmount: clearableStr('minOrderAmount'),
    firstBookingOnly: form.get('firstBookingOnly') === 'true',
    usageLimitTotal: clearableNum('usageLimitTotal'),
    usageLimitPerCustomer: clearableNum('usageLimitPerCustomer'),
    timeWindows,
    startsAt: clearableDate('startsAt'),
    endsAt: clearableDate('endsAt'),
    status: str('status'),
  };
}
