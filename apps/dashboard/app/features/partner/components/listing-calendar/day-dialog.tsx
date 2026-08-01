import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Plus, Tag, Trash2 } from 'lucide-react';
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
import { Switch } from '@booking/ui/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { cn } from '@booking/ui/lib/utils';
import { SuccessBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import {
  campaignEndDate,
  campaignPresentationOf,
  dateOnly,
  formatDayLong,
  maximumSalePrice,
  type CalendarMode,
} from '~/features/partner/lib/listing-calendar';
import { BookingWarning } from './booking-warning';
import { CampaignPreview } from './campaign-preview';
import { SaleCampaignFields, type SaleCampaignValue } from './sale-campaign-fields';
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
  /** Hours swept in the week grid — prefills the price form and opens that tab. */
  presetWindow?: { from: string; to: string } | null;
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
  presetWindow,
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
  // Controlled so the campaign fields can appear the moment a sale is entered.
  const [salePrice, setSalePrice] = useState('');
  const [regularPrice, setRegularPrice] = useState('');
  const [windowFrom, setWindowFrom] = useState('08:00');
  const [windowTo, setWindowTo] = useState('09:00');
  const [saleEnabled, setSaleEnabled] = useState(false);
  const [campaign, setCampaign] = useState<SaleCampaignValue>({
    startDate: '',
    endDate: '',
    label: '',
  });

  // A new date is a new decision: never carry the previous day's confirmation
  // or its "closed" choice into it.
  const initialWindowFrom = presetWindow?.from ?? openWindows[0]?.from ?? '08:00';
  const initialWindowTo = presetWindow?.to ?? openWindows[0]?.to ?? '09:00';
  useEffect(() => {
    setNotice(null);
    setSetting(exception?.type ?? 'default');
    setAcknowledged(false);
    setWindowsValid(true);
    const rule = mode === 'daily' ? rules[0] : undefined;
    setRegularPrice(rule?.price ?? '');
    setWindowFrom(initialWindowFrom);
    setWindowTo(initialWindowTo);
    setSalePrice(rule?.salePrice ?? '');
    setSaleEnabled(Boolean(rule?.salePrice));
    setCampaign({
      startDate: dateOnly(rule?.saleStartsAt) ?? '',
      endDate: campaignEndDate(rule?.saleEndsAt) ?? '',
      label: rule?.campaignLabel ?? '',
    });
  }, [date, exception?.type, initialWindowFrom, initialWindowTo, mode, rules]);

  const exceptionWindows = (exception?.windows ?? []).map((window) => ({
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
          <Tabs
            // A sweep in the week grid is a pricing gesture; landing on the
            // opening-hours tab would make the partner re-navigate every time.
            defaultValue={
              presetWindow && canPricing ? 'price' : canAvailability ? 'availability' : 'price'
            }
            className="pt-2"
          >
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
                  <div className="space-y-3">
                    <div className="space-y-2">
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
                    {setting === 'custom_hours' ? (
                      <WindowListField
                        key={`windows:${date}`}
                        idPrefix="day"
                        initial={exceptionWindows}
                        onValidityChange={setWindowsValid}
                      />
                    ) : null}
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
                    disabled={
                      availabilityFetcher.state !== 'idle' ||
                      (needsAck && !acknowledged) ||
                      (setting === 'custom_hours' && !windowsValid)
                    }
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
                      {rules.map((rule) => {
                        const presentation = campaignPresentationOf([rule], mode);
                        return (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {String(rule.params.from)}–{String(rule.params.to)}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {presentation.state === 'running' && presentation.salePrice ? (
                                  <>
                                    <span className="font-medium text-warning-foreground">
                                      <Money value={presentation.salePrice} />
                                      /giờ
                                    </span>
                                    <span className="text-muted-foreground line-through">
                                      <Money value={rule.price} />
                                    </span>
                                  </>
                                ) : (
                                  <span>
                                    <Money value={rule.price} />
                                    /giờ
                                  </span>
                                )}
                                {presentation.state !== 'none' ? (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-[10px]',
                                      presentation.state === 'running' &&
                                        'border-warning/40 bg-warning/15 text-warning-foreground',
                                    )}
                                  >
                                    {presentation.state === 'running'
                                      ? 'Đang chạy'
                                      : presentation.state === 'scheduled'
                                        ? 'Sắp diễn ra'
                                        : 'Đã kết thúc'}
                                  </Badge>
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
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <priceFetcher.Form
                  key={`price:${date}:${mode}:${presetWindow?.from ?? ''}-${presetWindow?.to ?? ''}:${rules.map((rule) => rule.id).join(',')}`}
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
                            value={windowFrom}
                            onChange={(event) => setWindowFrom(event.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="price-to">Đến giờ</Label>
                          <Input
                            id="price-to"
                            name="to"
                            type="time"
                            value={windowTo}
                            onChange={(event) => setWindowTo(event.target.value)}
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
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={regularPrice}
                        onChange={(event) => setRegularPrice(event.target.value)}
                        placeholder={basePrice ? `Mặc định: ${basePrice}` : 'Nhập giá thường'}
                        required={mode === 'hourly' || saleEnabled}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
                    <div>
                      <Label htmlFor="day-sale-enabled">Bật giá ưu đãi</Label>
                      <p className="text-xs text-muted-foreground">
                        Tạo chiến dịch hiển thị cho khách.
                      </p>
                    </div>
                    <Switch
                      id="day-sale-enabled"
                      checked={saleEnabled}
                      onCheckedChange={(checked) => {
                        setSaleEnabled(checked);
                        if (!checked) setSalePrice('');
                      }}
                    />
                  </div>
                  {saleEnabled ? (
                    <div className="space-y-2">
                      <Label htmlFor="sale-price">Giá ưu đãi (VND)</Label>
                      <Input
                        id="sale-price"
                        name="salePrice"
                        type="number"
                        min="1"
                        max={maximumSalePrice(regularPrice)}
                        step="1"
                        inputMode="numeric"
                        value={salePrice}
                        onChange={(event) => setSalePrice(event.target.value)}
                        placeholder="Thấp hơn giá thường"
                        required
                      />
                    </div>
                  ) : (
                    <input type="hidden" name="salePrice" value="" />
                  )}
                  <SaleCampaignFields
                    idPrefix="day"
                    enabled={saleEnabled}
                    value={campaign}
                    onChange={setCampaign}
                  />
                  {saleEnabled ? (
                    <CampaignPreview
                      regularPrice={regularPrice}
                      salePrice={salePrice}
                      campaignLabel={campaign.label}
                      ruleScopeDescription={
                        mode === 'daily'
                          ? `${formatDayLong(date)} · cả ngày`
                          : `${formatDayLong(date)} · ${windowFrom}–${windowTo}`
                      }
                      startDate={campaign.startDate}
                      endDate={campaign.endDate}
                    />
                  ) : null}
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
