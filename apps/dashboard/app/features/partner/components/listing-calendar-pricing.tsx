import { useMemo, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react';
import type {
  AvailabilityExceptionResponse,
  AvailabilityRuleResponse,
  BookingMode,
  ListingResponse,
  PricingRuleResponse,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { cn } from '@booking/ui/lib/utils';
import { Money } from '~/components/money';
import { todayString } from '~/lib/calendar-dates';

type CalendarMode = Extract<BookingMode, 'hourly' | 'daily'>;

interface Props {
  listing: ListingResponse;
  month: string;
  mode: CalendarMode;
  rules: PricingRuleResponse[];
  exceptions: AvailabilityExceptionResponse[];
  weeklyRules: AvailabilityRuleResponse[];
  canWrite: boolean;
  canAvailability: boolean;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthShift(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, value - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function calendarDays(month: string): Array<string | null> {
  const [year, value] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const first = new Date(Date.UTC(year, value - 1, 1)).getUTCDay();
  const mondayOffset = (first + 6) % 7;
  return [
    ...Array.from<null>({ length: mondayOffset }).fill(null),
    ...Array.from({ length: count }, (_, index) => isoDate(year, value, index + 1)),
  ];
}

function dateMatches(rule: PricingRuleResponse, date: string): boolean {
  if (rule.ruleType === 'date_time_range') return rule.params.date === date;
  if (rule.ruleType !== 'date_range') return false;
  return date >= String(rule.params.from) && date <= String(rule.params.to);
}

function defaultPrice(listing: ListingResponse, mode: CalendarMode): string | null {
  const config = listing.modeConfig[mode] as Record<string, unknown> | undefined;
  const value = mode === 'hourly' ? config?.basePrice : config?.basePricePerNight;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function ListingCalendarPricing({
  listing,
  month,
  mode,
  rules,
  exceptions,
  weeklyRules,
  canWrite,
  canAvailability,
}: Props) {
  const availabilityFetcher = useFetcher<{ ok: boolean; error?: string }>();
  const priceFetcher = useFetcher<{ ok: boolean; error?: string }>();
  const deletePriceFetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [selected, setSelected] = useState<string | null>(null);
  const today = todayString();
  const days = useMemo(() => calendarDays(month), [month]);
  const exceptionMap = useMemo(
    () => new Map(exceptions.map((item) => [item.date, item])),
    [exceptions],
  );
  const basePrice = defaultPrice(listing, mode);
  const canPricing = canWrite && listing.bookingSelection === 'flexible_duration';
  const enabledModes = listing.bookingModes.filter(
    (item): item is CalendarMode => item === 'hourly' || item === 'daily',
  );
  const selectedRules = selected
    ? rules.filter((rule) => rule.bookingMode === mode && dateMatches(rule, selected))
    : [];
  const selectedRule = selectedRules[0];
  const selectedException = selected ? exceptionMap.get(selected) : undefined;
  const selectedWeekdayOpen = selected
    ? mode === 'daily'
      ? weeklyRules.length === 0 || weeklyRules.some((rule) => rule.dayOfWeek === weekday(selected))
      : weeklyRules.some((rule) => rule.dayOfWeek === weekday(selected))
    : false;
  const selectedOpenWindows = selected
    ? selectedException?.type === 'closed'
      ? []
      : selectedException?.type === 'custom_hours' &&
          selectedException.openTime &&
          selectedException.closeTime
        ? [{ from: selectedException.openTime, to: selectedException.closeTime }]
        : weeklyRules
            .filter((rule) => rule.dayOfWeek === weekday(selected))
            .map((rule) => ({ from: rule.openTime, to: rule.closeTime }))
    : [];

  if (enabledModes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
        <CalendarDays className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 font-semibold">Chưa hỗ trợ lịch theo giờ/ngày</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tin đăng này đang dùng một hình thức đặt khác với theo giờ hoặc theo ngày.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-muted/20 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="size-4 text-primary" /> Lịch vận hành
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ngày không có thiết lập riêng sẽ dùng lịch tuần và giá mặc định của tin đăng.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {enabledModes.map((item) => (
            <Button key={item} asChild size="sm" variant={item === mode ? 'default' : 'outline'}>
              <Link to={`?tab=calendar&month=${month}&mode=${item}`}>
                {item === 'hourly' ? 'Theo giờ' : 'Theo ngày'}
              </Link>
            </Button>
          ))}
          {mode === 'hourly' && canAvailability ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/partner/listings/${listing.id}/hours`}>
                <Clock3 className="size-4" /> Lịch tuần
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {listing.bookingSelection === 'fixed_packages' ? (
        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Giá của tin đăng này được quản lý trong mục “Các gói dịch vụ”. Lịch giá riêng không áp dụng cho gói cố định.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <Button asChild variant="ghost" size="icon" aria-label="Tháng trước">
            <Link to={`?tab=calendar&month=${monthShift(month, -1)}&mode=${mode}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Lịch và giá</p>
            <p className="font-semibold">
              Tháng {Number(month.slice(5))}/{month.slice(0, 4)}
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Tháng sau">
            <Link to={`?tab=calendar&month=${monthShift(month, 1)}&mode=${mode}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date, index) => {
            if (!date)
              return (
                <div key={`empty-${index}`} className="min-h-24 border-r border-b bg-muted/10" />
              );
            const exception = exceptionMap.get(date);
            const exactRules = rules.filter(
              (rule) => rule.bookingMode === mode && dateMatches(rule, date),
            );
            const priceRule = exactRules[0];
            const openByWeek =
              mode === 'daily'
                ? weeklyRules.length === 0 ||
                  weeklyRules.some((rule) => rule.dayOfWeek === weekday(date))
                : weeklyRules.some((rule) => rule.dayOfWeek === weekday(date));
            const closed = exception?.type === 'closed' || (!exception && !openByWeek);
            const price = priceRule?.salePrice ?? priceRule?.price ?? basePrice;
            const isPast = date < today;
            return (
              <button
                key={date}
                type="button"
                disabled={isPast}
                aria-label={isPast ? `Ngày ${date} đã qua, không thể chỉnh sửa` : undefined}
                title={isPast ? 'Ngày đã qua — chỉ xem, không thể chỉnh sửa' : undefined}
                onClick={() => !isPast && setSelected(date)}
                className={cn(
                  'min-h-24 border-r border-b p-2 text-left transition-[background-color,opacity,filter] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  !isPast && 'hover:bg-accent/60',
                  closed && 'bg-destructive/10 text-muted-foreground',
                  closed && !isPast && 'hover:bg-destructive/15',
                  !closed && priceRule?.salePrice && 'bg-emerald-50/70 dark:bg-emerald-950/15',
                  isPast && 'cursor-not-allowed opacity-40 saturate-50',
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-semibold">{Number(date.slice(-2))}</span>
                  {closed ? (
                    <Badge variant="destructive" className="px-1.5 text-[10px]">
                      Đóng
                    </Badge>
                  ) : null}
                </div>
                {price ? (
                  <div className="mt-4 space-y-0.5">
                    {priceRule?.salePrice ? (
                      <div className="text-[10px] text-muted-foreground line-through">
                        <Money value={priceRule.price} />
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        'text-xs font-medium',
                        priceRule?.salePrice && 'text-emerald-700 dark:text-emerald-400',
                      )}
                    >
                      <Money value={price} />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      /{mode === 'hourly' ? 'giờ' : 'ngày'}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-[10px] text-muted-foreground">Chưa có giá</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary" /> Giá mặc định
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" /> Giá sale
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-destructive/60" /> Đóng cửa
        </span>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Thiết lập ngày {selected}</DialogTitle>
            <DialogDescription>
              Mặc định: {selectedWeekdayOpen ? 'mở cửa' : 'đóng cửa'} ·{' '}
              {basePrice ? <Money value={basePrice} /> : 'chưa có giá'} /
              {mode === 'hourly' ? 'giờ' : 'ngày'}
            </DialogDescription>
          </DialogHeader>

          {selected && (canAvailability || canPricing) ? (
            <Tabs defaultValue={canAvailability ? 'availability' : 'price'} className="pt-2">
              <TabsList
                className={cn(
                  'grid w-full',
                  canAvailability && canPricing ? 'grid-cols-2' : 'grid-cols-1',
                )}
              >
                {canAvailability ? (
                  <TabsTrigger value="availability">Lịch mở cửa</TabsTrigger>
                ) : null}
                {canPricing ? <TabsTrigger value="price">Giá</TabsTrigger> : null}
              </TabsList>

              {canAvailability ? (
                <TabsContent value="availability" className="mt-4">
                  <availabilityFetcher.Form
                    key={`availability:${selected}`}
                    method="post"
                    className="space-y-4"
                  >
                    <input type="hidden" name="intent" value="save_availability" />
                    <input type="hidden" name="date" value={selected} />
                    <input
                      type="hidden"
                      name="exceptionId"
                      value={selectedException?.id ?? ''}
                    />
                    <div>
                      <h3 className="text-sm font-semibold">Mở cửa / đóng cửa</h3>
                      <p className="text-xs text-muted-foreground">
                        Chọn lịch tuần để bỏ thiết lập riêng của ngày này.
                      </p>
                      {mode === 'hourly' && canAvailability ? (
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            selectedOpenWindows.length
                              ? 'text-muted-foreground'
                              : 'font-medium text-destructive',
                          )}
                        >
                          {selectedOpenWindows.length
                            ? `Khung hợp lệ: ${selectedOpenWindows.map((window) => `${window.from}–${window.to}`).join(', ')}`
                            : 'Ngày này đang đóng cửa, không thể thêm khung giá.'}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="availability-setting">Trạng thái</Label>
                        <select
                          id="availability-setting"
                          name="availabilitySetting"
                          defaultValue={selectedException?.type ?? 'default'}
                          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="default">Dùng lịch tuần</option>
                          <option value="custom_hours">Mở theo giờ riêng</option>
                          <option value="closed">Đóng cả ngày</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="open-time">Mở</Label>
                        <Input
                          id="open-time"
                          name="openTime"
                          type="time"
                          defaultValue={selectedException?.openTime ?? '08:00'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="close-time">Đóng</Label>
                        <Input
                          id="close-time"
                          name="closeTime"
                          type="time"
                          defaultValue={selectedException?.closeTime ?? '22:00'}
                        />
                      </div>
                    </div>
                    {availabilityFetcher.data?.error ? (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {availabilityFetcher.data.error}
                      </p>
                    ) : null}
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={availabilityFetcher.state !== 'idle'}
                    >
                      {availabilityFetcher.state === 'idle'
                        ? 'Lưu lịch mở cửa'
                        : 'Đang lưu...'}
                    </Button>
                  </availabilityFetcher.Form>
                </TabsContent>
              ) : null}

              {canPricing ? (
                <TabsContent value="price" className="mt-4">
                  {mode === 'hourly' && selectedRules.length > 0 ? (
                    <div className="mb-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Các khung giá đã lưu</p>
                        <Badge variant="secondary">{selectedRules.length} khung</Badge>
                      </div>
                      <div className="space-y-2">
                        {selectedRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {String(rule.params.from)}–{String(rule.params.to)}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={cn(rule.salePrice && 'font-medium text-emerald-700')}>
                                  <Money value={rule.salePrice ?? rule.price} />/giờ
                                </span>
                                {rule.salePrice ? (
                                  <span className="text-muted-foreground line-through">
                                    <Money value={rule.price} />
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <deletePriceFetcher.Form method="post">
                              <input type="hidden" name="intent" value="delete_price" />
                              <input type="hidden" name="date" value={selected} />
                              <input type="hidden" name="ruleId" value={rule.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                aria-label={`Xoá khung giá ${String(rule.params.from)} đến ${String(rule.params.to)}`}
                                disabled={deletePriceFetcher.state !== 'idle'}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </deletePriceFetcher.Form>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <priceFetcher.Form
                    key={`price:${selected}:${mode}:${selectedRules.map((rule) => rule.id).join(',')}`}
                    method="post"
                    className="space-y-4"
                  >
                    <input type="hidden" name="intent" value="save_price" />
                    <input type="hidden" name="date" value={selected} />
                    <input type="hidden" name="mode" value={mode} />
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Tag className="size-4" /> Giá
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {mode === 'hourly'
                          ? 'Thêm giá riêng cho một khung giờ trong ngày.'
                          : 'Nhập giá riêng cho cả ngày. Để trống để dùng giá mặc định'}
                        {basePrice ? (
                          <>
                            {' '}
                            (<Money value={basePrice} />)
                          </>
                        ) : null}
                        .
                      </p>
                    </div>
                    {mode === 'daily'
                      ? selectedRules.map((rule) => (
                          <input key={rule.id} type="hidden" name="ruleId" value={rule.id} />
                        ))
                      : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {mode === 'hourly' ? (
                        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                          <div className="space-y-2">
                            <Label htmlFor="price-from">Từ giờ</Label>
                            <Input
                              id="price-from"
                              name="from"
                              type="time"
                              defaultValue="08:00"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="price-to">Đến giờ</Label>
                            <Input
                              id="price-to"
                              name="to"
                              type="time"
                              defaultValue="09:00"
                              required
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label htmlFor="regular-price">Giá thường (VND)</Label>
                        <Input
                          id="regular-price"
                          name="price"
                          inputMode="numeric"
                          defaultValue={mode === 'daily' ? (selectedRule?.price ?? '') : ''}
                          placeholder={basePrice ? `Mặc định: ${basePrice}` : 'Nhập giá thường'}
                          required={mode === 'hourly'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sale-price">Giá sale (VND)</Label>
                        <Input
                          id="sale-price"
                          name="salePrice"
                          inputMode="numeric"
                          defaultValue={mode === 'daily' ? (selectedRule?.salePrice ?? '') : ''}
                          placeholder="Không bắt buộc"
                        />
                      </div>
                    </div>
                    {priceFetcher.data?.error ? (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {priceFetcher.data.error}
                      </p>
                    ) : null}
                    {deletePriceFetcher.data?.error ? (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {deletePriceFetcher.data.error}
                      </p>
                    ) : null}
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        priceFetcher.state !== 'idle' ||
                        (mode === 'hourly' &&
                          canAvailability &&
                          selectedOpenWindows.length === 0)
                      }
                    >
                      {priceFetcher.state === 'idle' ? (
                        mode === 'hourly' ? (
                          <>
                            <Plus className="size-4" /> Thêm khung giá
                          </>
                        ) : (
                          'Lưu giá'
                        )
                      ) : (
                        'Đang lưu...'
                      )}
                    </Button>
                  </priceFetcher.Form>
                </TabsContent>
              ) : null}
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
