import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Plus, Tag, Trash2 } from 'lucide-react';
import type { AvailabilityExceptionResponse, PartnerCalendarBookingResponse, PricingRuleResponse } from '@booking/contracts';
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
import { SuccessBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import { formatDayLong, type CalendarMode } from '~/features/partner/lib/listing-calendar';
import { BookingWarning } from './booking-warning';
import { useSubmitSuccess, type SubmitResult } from './use-submit-success';

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

  // A new date is a new decision: never carry the previous day's confirmation
  // or its "closed" choice into it.
  useEffect(() => {
    setNotice(null);
    setSetting(exception?.type ?? 'default');
    setAcknowledged(false);
  }, [date, exception?.type]);

  useSubmitSuccess(availabilityFetcher, () => onSaved('Đã lưu lịch mở cửa.', true));
  useSubmitSuccess(priceFetcher, () => {
    // Hourly prices are added one window at a time, so keep the day open for
    // the next window; a daily price is the whole day and the day is done.
    if (mode === 'daily') onSaved('Đã lưu giá.', true);
    else setNotice('Đã lưu giá.');
  });
  useSubmitSuccess(deletePriceFetcher, () => setNotice('Đã xoá khung giá.'));

  const firstRule = rules[0];
  // Only a closure needs the acknowledgement — narrowing to custom hours or
  // just repricing does not take the day off the market.
  const needsAck = setting === 'closed' && bookings.length > 0;

  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{date ? formatDayLong(date) : ''}</DialogTitle>
          <DialogDescription>
            Theo lịch tuần: {weekdayOpen ? 'mở cửa' : 'đóng cửa'} · Giá mặc định{' '}
            {basePrice ? <Money value={basePrice} /> : 'chưa có'}/
            {mode === 'hourly' ? 'giờ' : 'ngày'}
          </DialogDescription>
        </DialogHeader>

        <SuccessBanner message={notice} />

        {date && (canAvailability || canPricing) ? (
          <Tabs defaultValue={canAvailability ? 'availability' : 'price'} className="pt-2">
            <TabsList
              className={cn(
                'grid w-full',
                canAvailability && canPricing ? 'grid-cols-2' : 'grid-cols-1',
              )}
            >
              {canAvailability ? <TabsTrigger value="availability">Lịch mở cửa</TabsTrigger> : null}
              {canPricing ? <TabsTrigger value="price">Giá</TabsTrigger> : null}
            </TabsList>

            {canAvailability ? (
              <TabsContent value="availability" className="mt-4">
                <availabilityFetcher.Form
                  key={`availability:${date}`}
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="save_availability" />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="exceptionId" value={exception?.id ?? ''} />
                  <div>
                    <h3 className="text-sm font-semibold">Mở cửa / đóng cửa</h3>
                    <p className="text-xs text-muted-foreground">
                      Chọn lịch tuần để bỏ thiết lập riêng của ngày này.
                    </p>
                    {mode === 'hourly' ? (
                      <p
                        className={cn(
                          'mt-1 text-xs',
                          openWindows.length
                            ? 'text-muted-foreground'
                            : 'font-medium text-destructive',
                        )}
                      >
                        {openWindows.length
                          ? `Khung hợp lệ: ${openWindows.map((w) => `${w.from}–${w.to}`).join(', ')}`
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
                        value={setting}
                        onChange={(event) => setSetting(event.target.value)}
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
                        defaultValue={exception?.openTime ?? '08:00'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="close-time">Đóng</Label>
                      <Input
                        id="close-time"
                        name="closeTime"
                        type="time"
                        defaultValue={exception?.closeTime ?? '22:00'}
                      />
                    </div>
                  </div>

                  {needsAck ? (
                    <BookingWarning
                      bookings={bookings}
                      acknowledged={acknowledged}
                      onAcknowledgedChange={setAcknowledged}
                    />
                  ) : null}

                  {availabilityFetcher.data?.error ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {availabilityFetcher.data.error}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={availabilityFetcher.state !== 'idle' || (needsAck && !acknowledged)}
                  >
                    {availabilityFetcher.state === 'idle' ? 'Lưu lịch mở cửa' : 'Đang lưu...'}
                  </Button>
                </availabilityFetcher.Form>
              </TabsContent>
            ) : null}

            {canPricing ? (
              <TabsContent value="price" className="mt-4">
                {mode === 'hourly' && rules.length > 0 ? (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Các khung giá đã lưu</p>
                      <Badge variant="secondary">{rules.length} khung</Badge>
                    </div>
                    <div className="space-y-2">
                      {rules.map((rule) => (
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
                            <input type="hidden" name="date" value={date} />
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
                  key={`price:${date}:${mode}:${rules.map((rule) => rule.id).join(',')}`}
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="save_price" />
                  <input type="hidden" name="date" value={date} />
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
                    ? rules.map((rule) => (
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
                            defaultValue={openWindows[0]?.from ?? '08:00'}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="price-to">Đến giờ</Label>
                          <Input
                            id="price-to"
                            name="to"
                            type="time"
                            defaultValue={openWindows[0]?.to ?? '09:00'}
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
                        defaultValue={mode === 'daily' ? (firstRule?.price ?? '') : ''}
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
                        defaultValue={mode === 'daily' ? (firstRule?.salePrice ?? '') : ''}
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
                      (mode === 'hourly' && canAvailability && openWindows.length === 0)
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
  );
}
