import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { CalendarRange, CalendarX2, Clock3, LoaderCircle, Tag } from 'lucide-react';
import type { PartnerCalendarBookingResponse } from '@booking/contracts';
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
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Tabs, TabsContent } from '@booking/ui/components/ui/tabs';
import { cn } from '@booking/ui/lib/utils';
import { SuccessBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { formatDayShort, type CalendarMode } from '~/features/partner/lib/listing-calendar';
import { BookingWarning } from './booking-warning';
import { CalendarDialogTabs } from './calendar-dialog-tabs';
import { WindowListField } from './window-list-field';
import { useSubmitSuccess, type SubmitResult } from '~/features/partner/lib/use-submit-success';

interface Props {
  range: { from: string; to: string } | null;
  dates: string[];
  mode: CalendarMode;
  basePrice: string | null;
  bookings: PartnerCalendarBookingResponse[];
  canAvailability: boolean;
  canPricing: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const SKIP_REASON_LABEL: Record<string, string> = {
  closed: 'đóng cửa',
  outside_open_hours: 'ngoài giờ mở cửa',
  overlap: 'trùng khung giá đã có',
};

const RANGE_AVAILABILITY_OPTIONS = [
  {
    value: 'closed',
    label: 'Đóng cả ngày',
    description: 'Không nhận lượt đặt mới trong toàn bộ dải ngày.',
    icon: CalendarX2,
  },
  {
    value: 'custom_hours',
    label: 'Mở theo giờ riêng',
    description: 'Áp cùng các khung giờ mở cửa cho mọi ngày trong dải.',
    icon: Clock3,
  },
] as const;

/** Summarise a partial apply so the partner knows exactly what did not land. */
function summaryText(summary: NonNullable<SubmitResult['summary']>, total: number): string {
  if (summary.skipped.length === 0) return `Đã áp cho ${total} ngày.`;
  const byReason = new Map<string, number>();
  for (const item of summary.skipped) {
    byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
  }
  const detail = [...byReason]
    .map(([reason, count]) => `${count} ngày ${SKIP_REASON_LABEL[reason] ?? reason}`)
    .join(', ');
  return `Đã áp cho ${total - summary.skipped.length}/${total} ngày · bỏ qua ${detail}.`;
}

/** Apply one availability setting or one price to every date in a span. */
export function RangeDialog({
  range,
  dates,
  mode,
  basePrice,
  bookings,
  canAvailability,
  canPricing,
  onClose,
  onSaved,
}: Props) {
  const availabilityFetcher = useFetcher<SubmitResult>();
  const priceFetcher = useFetcher<SubmitResult>();
  const [notice, setNotice] = useState<string | null>(null);
  const [setting, setSetting] = useState('closed');
  const [acknowledged, setAcknowledged] = useState(false);
  const [windowsValid, setWindowsValid] = useState(true);
  const lastSelection = useRef({ range, dates, bookings });

  const displayedRange = range ?? lastSelection.current.range;
  const displayedDates = range ? dates : lastSelection.current.dates;
  const displayedBookings = range ? bookings : lastSelection.current.bookings;

  useEffect(() => {
    if (range) lastSelection.current = { range, dates, bookings };
  }, [bookings, dates, range]);

  useEffect(() => {
    if (!range) return;
    setNotice(null);
    setSetting('closed');
    setAcknowledged(false);
    setWindowsValid(true);
  }, [range]);

  useSubmitSuccess(availabilityFetcher, () =>
    onSaved(`Đã lưu lịch mở cửa cho ${dates.length} ngày.`),
  );
  useSubmitSuccess(priceFetcher, (result) => {
    // A range apply is routinely partial, so its own outcome stays in the
    // dialog where the partner can read which dates were skipped and why.
    if (result.summary) setNotice(summaryText(result.summary, dates.length));
    else onSaved('Đã lưu giá.');
  });

  const needsAck = setting === 'closed' && displayedBookings.length > 0;

  return (
    <Dialog open={range !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="size-5 text-primary" aria-hidden />
            Chỉnh {displayedDates.length} ngày
          </DialogTitle>
          <DialogDescription>
            Thiết lập được áp lần lượt cho từng ngày đủ điều kiện trong dải đã chọn.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/25 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Dải ngày</p>
            <p className="mt-0.5 font-medium tabular-nums">
              {displayedRange
                ? `${formatDayShort(displayedRange.from)} – ${formatDayShort(displayedRange.to)}`
                : '—'}
            </p>
          </div>
          <div className="border-l pl-3">
            <p className="text-xs text-muted-foreground">Giá cơ bản</p>
            <p className="mt-0.5 font-medium tabular-nums">
              {basePrice ? <Money value={basePrice} /> : 'Chưa thiết lập'}
              {basePrice ? `/${mode === 'hourly' ? 'giờ' : 'ngày'}` : null}
            </p>
          </div>
        </div>

        <SuccessBanner message={notice} />

        {displayedRange && (canAvailability || canPricing) ? (
          <Tabs defaultValue={canAvailability ? 'availability' : 'price'} className="pt-2">
            <CalendarDialogTabs canAvailability={canAvailability} canPricing={canPricing} />

            {canAvailability ? (
              <TabsContent value="availability" className="mt-4">
                <availabilityFetcher.Form
                  key={`range-availability:${displayedRange.from}:${displayedRange.to}`}
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="save_availability_range" />
                  <input type="hidden" name="from" value={displayedRange.from} />
                  <input type="hidden" name="to" value={displayedRange.to} />
                  <div>
                    <h3 className="text-sm font-semibold">Áp cho cả dải</h3>
                    <p className="text-xs text-muted-foreground">
                      Thiết lập này ghi đè từng ngày trong dải. “Dùng lịch tuần” chưa hỗ trợ theo
                      dải — bỏ thiết lập riêng vẫn phải làm từng ngày.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <input type="hidden" name="availabilitySetting" value={setting} />
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Trạng thái</legend>
                      <RadioGroup
                        value={setting}
                        onValueChange={setSetting}
                        className="gap-2"
                        aria-label="Trạng thái áp dụng cho dải ngày"
                      >
                        {RANGE_AVAILABILITY_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const active = setting === option.value;
                          return (
                            <Label
                              key={option.value}
                              htmlFor={`range-availability-${option.value}`}
                              className={cn(
                                'flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40',
                                active && 'border-primary/50 bg-primary/5',
                              )}
                            >
                              <RadioGroupItem
                                id={`range-availability-${option.value}`}
                                value={option.value}
                                className="mt-0.5"
                              />
                              <Icon
                                className={cn(
                                  'mt-0.5 size-4 shrink-0 text-muted-foreground',
                                  active && 'text-primary',
                                )}
                                aria-hidden
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{option.label}</span>
                                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                  {option.description}
                                </span>
                              </span>
                            </Label>
                          );
                        })}
                      </RadioGroup>
                    </fieldset>
                    {setting === 'custom_hours' ? (
                      <WindowListField
                        key={`range-windows:${displayedRange.from}:${displayedRange.to}`}
                        idPrefix="range"
                        initial={[]}
                        onValidityChange={setWindowsValid}
                      />
                    ) : null}
                  </div>

                  {needsAck ? (
                    <BookingWarning
                      bookings={displayedBookings}
                      acknowledged={acknowledged}
                      onAcknowledgedChange={setAcknowledged}
                    />
                  ) : null}

                  {availabilityFetcher.data?.error ? (
                    <p
                      className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                      role="alert"
                    >
                      {availabilityFetcher.data.error}
                    </p>
                  ) : null}
                  <div className="sticky bottom-0 z-10 -mx-1 bg-background/95 px-1 pt-2 pb-1 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        availabilityFetcher.state !== 'idle' ||
                        (needsAck && !acknowledged) ||
                        (setting === 'custom_hours' && !windowsValid)
                      }
                    >
                      {availabilityFetcher.state === 'idle' ? (
                        `Áp cho ${displayedDates.length} ngày`
                      ) : (
                        <>
                          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Đang lưu…
                        </>
                      )}
                    </Button>
                    <span className="sr-only" aria-live="polite">
                      {availabilityFetcher.state === 'idle'
                        ? ''
                        : `Đang lưu lịch cho ${displayedDates.length} ngày`}
                    </span>
                  </div>
                </availabilityFetcher.Form>
              </TabsContent>
            ) : null}

            {canPricing ? (
              <TabsContent value="price" className="mt-4">
                <priceFetcher.Form
                  key={`range-price:${displayedRange.from}:${displayedRange.to}:${mode}`}
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="save_price_range" />
                  <input type="hidden" name="from" value={displayedRange.from} />
                  <input type="hidden" name="to" value={displayedRange.to} />
                  <input type="hidden" name="mode" value={mode} />
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Tag className="size-4 text-primary" aria-hidden /> Giá riêng cho cả dải
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {mode === 'hourly'
                        ? 'Một khung giờ, áp cho mọi ngày trong dải. Ngày đóng cửa hoặc trùng khung giá sẽ được bỏ qua và báo lại.'
                        : 'Một mức giá cho cả dải ngày.'}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {mode === 'hourly' ? (
                      <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                        <div className="space-y-2">
                          <Label htmlFor="range-price-from">Từ giờ</Label>
                          <Input
                            id="range-price-from"
                            name="windowFrom"
                            type="time"
                            defaultValue="08:00"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="range-price-to">Đến giờ</Label>
                          <Input
                            id="range-price-to"
                            name="windowTo"
                            type="time"
                            defaultValue="09:00"
                            required
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="range-regular-price">Giá áp dụng (VND)</Label>
                      <Input
                        id="range-regular-price"
                        name="price"
                        inputMode="numeric"
                        placeholder={basePrice ? `Mặc định: ${basePrice}` : 'Nhập giá thường'}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="range-sale-price">Giá ưu đãi (VND)</Label>
                      <Input
                        id="range-sale-price"
                        name="salePrice"
                        inputMode="numeric"
                        placeholder="Không bắt buộc"
                      />
                    </div>
                  </div>
                  {priceFetcher.data?.error ? (
                    <p
                      className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                      role="alert"
                    >
                      {priceFetcher.data.error}
                    </p>
                  ) : null}
                  <div className="sticky bottom-0 z-10 -mx-1 bg-background/95 px-1 pt-2 pb-1 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={priceFetcher.state !== 'idle'}
                    >
                      {priceFetcher.state === 'idle' ? (
                        `Áp giá cho ${displayedDates.length} ngày`
                      ) : (
                        <>
                          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Đang lưu…
                        </>
                      )}
                    </Button>
                    <span className="sr-only" aria-live="polite">
                      {priceFetcher.state === 'idle'
                        ? ''
                        : `Đang áp giá cho ${displayedDates.length} ngày`}
                    </span>
                  </div>
                </priceFetcher.Form>
              </TabsContent>
            ) : null}
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
