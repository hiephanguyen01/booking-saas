import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { CalendarDays, Clock3, LoaderCircle, Plus, RotateCcw, Tag, Trash2 } from 'lucide-react';
import type {
  AvailabilityExceptionResponse,
  PartnerCalendarBookingResponse,
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
import { RadioGroup, RadioGroupItem } from '@booking/ui/components/ui/radio-group';
import { Tabs, TabsContent } from '@booking/ui/components/ui/tabs';
import { cn } from '@booking/ui/lib/utils';
import { SuccessBanner } from '~/components/action-feedback';
import { ConfirmButton } from '~/components/confirm-button';
import { Money } from '~/components/money';
import { formatDayLong, type CalendarMode } from '~/features/partner/lib/listing-calendar';
import { BookingWarning } from './booking-warning';
import { CalendarDialogTabs } from './calendar-dialog-tabs';
import { WindowListField } from './window-list-field';
import { useSubmitSuccess, type SubmitResult } from '~/features/partner/lib/use-submit-success';

interface Props {
  date: string | null;
  mode: CalendarMode;
  basePrice: string | null;
  weekdayOpen: boolean;
  openWindows: { from: string; to: string }[];
  exception: AvailabilityExceptionResponse | undefined;
  rules: PricingRuleResponse[];
  bookings: PartnerCalendarBookingResponse[];
  canAvailability: boolean;
  canPricing: boolean;
  onClose: () => void;
  onSaved: (message: string, closeDialog: boolean) => void;
}

const AVAILABILITY_OPTIONS = [
  {
    value: 'default',
    label: 'Dùng lịch tuần',
    description: 'Bỏ thiết lập riêng và dùng giờ mở cửa của thứ tương ứng.',
    icon: RotateCcw,
  },
  {
    value: 'custom_hours',
    label: 'Mở theo giờ riêng',
    description: 'Chỉ ngày này dùng những khung giờ được nhập bên dưới.',
    icon: Clock3,
  },
  {
    value: 'closed',
    label: 'Đóng cả ngày',
    description: 'Không nhận lượt đặt mới trong ngày này.',
    icon: CalendarDays,
  },
] as const;

/** Availability + price for a single date. */
export function DayDialog({
  date,
  mode,
  basePrice,
  weekdayOpen,
  openWindows,
  exception,
  rules,
  bookings,
  canAvailability,
  canPricing,
  onClose,
  onSaved,
}: Props) {
  const availabilityFetcher = useFetcher<SubmitResult>();
  const priceFetcher = useFetcher<SubmitResult>();
  const deletePriceFetcher = useFetcher<SubmitResult>();
  const [notice, setNotice] = useState<string | null>(null);
  const [setting, setSetting] = useState<string>(exception?.type ?? 'default');
  const [acknowledged, setAcknowledged] = useState(false);
  const [windowsValid, setWindowsValid] = useState(true);
  const lastSelection = useRef({
    date,
    weekdayOpen,
    openWindows,
    exception,
    rules,
    bookings,
  });

  const displayedDate = date ?? lastSelection.current.date;
  const displayedWeekdayOpen = date ? weekdayOpen : lastSelection.current.weekdayOpen;
  const displayedOpenWindows = date ? openWindows : lastSelection.current.openWindows;
  const displayedException = date ? exception : lastSelection.current.exception;
  const displayedRules = date ? rules : lastSelection.current.rules;
  const displayedBookings = date ? bookings : lastSelection.current.bookings;

  useEffect(() => {
    if (date) {
      lastSelection.current = { date, weekdayOpen, openWindows, exception, rules, bookings };
    }
  }, [bookings, date, exception, openWindows, rules, weekdayOpen]);

  // A new date is a new decision: never carry the previous day's confirmation
  // or its "closed" choice into it.
  useEffect(() => {
    if (!date) return;
    setNotice(null);
    setSetting(exception?.type ?? 'default');
    setAcknowledged(false);
    setWindowsValid(true);
  }, [date, exception?.type]);

  const exceptionWindows = (displayedException?.windows ?? []).map((window) => ({
    open: window.openTime,
    close: window.closeTime,
  }));

  useSubmitSuccess(availabilityFetcher, () => onSaved('Đã lưu lịch mở cửa.', true));
  useSubmitSuccess(priceFetcher, () => {
    // Hourly prices are added one window at a time, so keep the day open for
    // the next window; a daily price is the whole day and the day is done.
    if (mode === 'daily') onSaved('Đã lưu giá.', true);
    else setNotice('Đã lưu giá.');
  });
  useSubmitSuccess(deletePriceFetcher, () => setNotice('Đã xoá khung giá.'));

  const firstRule = displayedRules[0];
  // Only a closure needs the acknowledgement — narrowing to custom hours or
  // just repricing does not take the day off the market.
  const needsAck = setting === 'closed' && displayedBookings.length > 0;

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {displayedDate ? formatDayLong(displayedDate) : ''}
          </DialogTitle>
          <DialogDescription>
            Thiết lập riêng cho ngày này luôn được ưu tiên hơn lịch tuần và giá cơ bản.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/25 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Theo lịch tuần</p>
            <p className="mt-0.5 font-medium">{displayedWeekdayOpen ? 'Mở cửa' : 'Đóng cửa'}</p>
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

        {displayedDate && (canAvailability || canPricing) ? (
          <Tabs defaultValue={canAvailability ? 'availability' : 'price'} className="pt-2">
            <CalendarDialogTabs canAvailability={canAvailability} canPricing={canPricing} />

            {canAvailability ? (
              <TabsContent value="availability" className="mt-4">
                <availabilityFetcher.Form
                  key={`availability:${displayedDate}`}
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="save_availability" />
                  <input type="hidden" name="date" value={displayedDate} />
                  <input type="hidden" name="exceptionId" value={displayedException?.id ?? ''} />
                  <div>
                    <h3 className="text-sm font-semibold">Mở cửa / đóng cửa</h3>
                    <p className="text-xs text-muted-foreground">
                      Chọn cách ngày này kế thừa hoặc ghi đè lịch tuần.
                    </p>
                    {mode === 'hourly' ? (
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          displayedOpenWindows.length
                            ? 'text-muted-foreground'
                            : 'font-medium text-destructive',
                        )}
                      >
                        {displayedOpenWindows.length
                          ? `Khung hợp lệ: ${displayedOpenWindows.map((w) => `${w.from}–${w.to}`).join(', ')}`
                          : 'Ngày này đang đóng cửa, không thể thêm khung giá.'}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-3">
                    <input type="hidden" name="availabilitySetting" value={setting} />
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Trạng thái</legend>
                      <RadioGroup
                        value={setting}
                        onValueChange={setSetting}
                        className="gap-2"
                        aria-label="Trạng thái mở cửa của ngày"
                      >
                        {AVAILABILITY_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const active = setting === option.value;
                          return (
                            <Label
                              key={option.value}
                              htmlFor={`availability-${option.value}`}
                              className={cn(
                                'flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40',
                                active && 'border-primary/50 bg-primary/5',
                              )}
                            >
                              <RadioGroupItem
                                id={`availability-${option.value}`}
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
                        key={`windows:${displayedDate}`}
                        idPrefix="day"
                        initial={exceptionWindows}
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
                        'Lưu lịch mở cửa'
                      ) : (
                        <>
                          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Đang lưu…
                        </>
                      )}
                    </Button>
                    <span className="sr-only" aria-live="polite">
                      {availabilityFetcher.state === 'idle' ? '' : 'Đang lưu lịch mở cửa'}
                    </span>
                  </div>
                </availabilityFetcher.Form>
              </TabsContent>
            ) : null}

            {canPricing ? (
              <TabsContent value="price" className="mt-4">
                {mode === 'hourly' && displayedRules.length > 0 ? (
                  <div className="mb-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Các khung giá đã lưu</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Giá riêng chỉ áp dụng trong đúng khung giờ bên dưới.
                        </p>
                      </div>
                      <Badge variant="secondary">{displayedRules.length} khung</Badge>
                    </div>
                    <div className="space-y-2">
                      {displayedRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-3"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Clock3 className="size-4" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {String(rule.params.from)}–{String(rule.params.to)}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                                <span
                                  className={cn(
                                    rule.salePrice &&
                                      'font-medium text-success',
                                  )}
                                >
                                  <Money value={rule.salePrice ?? rule.price} />
                                  /giờ
                                </span>
                                {rule.salePrice ? (
                                  <span className="text-muted-foreground line-through">
                                    <Money value={rule.price} />
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <ConfirmButton
                            trigger={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Xoá khung giá ${String(rule.params.from)} đến ${String(rule.params.to)}`}
                                disabled={deletePriceFetcher.state !== 'idle'}
                              >
                                {deletePriceFetcher.state === 'idle' ? (
                                  <Trash2 className="size-4 text-destructive" aria-hidden />
                                ) : (
                                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                                )}
                              </Button>
                            }
                            title="Xoá khung giá?"
                            description={`Khung ${String(rule.params.from)}–${String(rule.params.to)} sẽ quay lại dùng giá cơ bản hoặc quy tắc giá lặp lại đang có.`}
                            confirmLabel="Xoá khung giá"
                            destructive
                            busy={deletePriceFetcher.state !== 'idle'}
                            onConfirm={() =>
                              deletePriceFetcher.submit(
                                { intent: 'delete_price', date: displayedDate, ruleId: rule.id },
                                { method: 'post' },
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <priceFetcher.Form
                  key={`price:${displayedDate}:${mode}:${displayedRules.map((rule) => rule.id).join(',')}`}
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="save_price" />
                  <input type="hidden" name="date" value={displayedDate} />
                  <input type="hidden" name="mode" value={mode} />
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Tag className="size-4 text-primary" aria-hidden /> Thêm giá riêng
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
                    ? displayedRules.map((rule) => (
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
                            defaultValue={displayedOpenWindows[0]?.from ?? '08:00'}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="price-to">Đến giờ</Label>
                          <Input
                            id="price-to"
                            name="to"
                            type="time"
                            defaultValue={displayedOpenWindows[0]?.to ?? '09:00'}
                            required
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="regular-price">Giá áp dụng (VND)</Label>
                      <Input
                        id="regular-price"
                        name="price"
                        inputMode="numeric"
                        defaultValue={mode === 'daily' ? (firstRule?.price ?? '') : ''}
                        placeholder={basePrice ? `Mặc định: ${basePrice}` : 'Nhập giá thường'}
                        required={mode === 'hourly'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sale-price">Giá ưu đãi (VND)</Label>
                      <Input
                        id="sale-price"
                        name="salePrice"
                        inputMode="numeric"
                        defaultValue={mode === 'daily' ? (firstRule?.salePrice ?? '') : ''}
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
                  {deletePriceFetcher.data?.error ? (
                    <p
                      className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                      role="alert"
                    >
                      {deletePriceFetcher.data.error}
                    </p>
                  ) : null}
                  <div className="sticky bottom-0 z-10 -mx-1 bg-background/95 px-1 pt-2 pb-1 backdrop-blur supports-[backdrop-filter]:bg-background/85">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={
                        priceFetcher.state !== 'idle' ||
                        (mode === 'hourly' && canAvailability && displayedOpenWindows.length === 0)
                      }
                    >
                      {priceFetcher.state === 'idle' ? (
                        mode === 'hourly' ? (
                          <>
                            <Plus className="size-4" aria-hidden /> Thêm khung giá
                          </>
                        ) : (
                          'Lưu giá riêng'
                        )
                      ) : (
                        <>
                          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Đang lưu…
                        </>
                      )}
                    </Button>
                    <span className="sr-only" aria-live="polite">
                      {priceFetcher.state === 'idle' ? '' : 'Đang lưu giá riêng'}
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
