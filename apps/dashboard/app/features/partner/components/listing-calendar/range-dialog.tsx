import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { CalendarRange, Tag } from 'lucide-react';
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
import { Switch } from '@booking/ui/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { cn } from '@booking/ui/lib/utils';
import { SuccessBanner } from '~/components/action-feedback';
import { Money } from '~/components/money';
import {
  formatDayShort,
  maximumSalePrice,
  type CalendarMode,
} from '~/features/partner/lib/listing-calendar';
import { BookingWarning } from './booking-warning';
import { CampaignPreview } from './campaign-preview';
import { SaleCampaignFields, type SaleCampaignValue } from './sale-campaign-fields';
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
  const [regularPrice, setRegularPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleEnabled, setSaleEnabled] = useState(false);
  const [campaign, setCampaign] = useState<SaleCampaignValue>({
    startDate: '',
    endDate: '',
    label: '',
  });

  useEffect(() => {
    setNotice(null);
    setSetting('closed');
    setAcknowledged(false);
    setWindowsValid(true);
    setRegularPrice('');
    setSalePrice('');
    setSaleEnabled(false);
    setCampaign({ startDate: '', endDate: '', label: '' });
  }, [range?.from, range?.to]);

  useSubmitSuccess(availabilityFetcher, () =>
    onSaved(
      setting === 'default'
        ? `Đã trả ${dates.length} ngày về lịch tuần.`
        : `Đã lưu lịch mở cửa cho ${dates.length} ngày.`,
    ),
  );
  useSubmitSuccess(priceFetcher, (result) => {
    // A range apply is routinely partial, so its own outcome stays in the
    // dialog where the partner can read which dates were skipped and why.
    if (result.summary) setNotice(summaryText(result.summary, dates.length));
    else onSaved('Đã lưu giá.');
  });

  const needsAck = setting === 'closed' && bookings.length > 0;

  return (
    <Dialog open={range !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="size-5 text-primary" aria-hidden />
            {dates.length} ngày
          </DialogTitle>
          <DialogDescription>
            {range ? `${formatDayShort(range.from)} – ${formatDayShort(range.to)}` : ''} · Giá mặc
            định {basePrice ? <Money value={basePrice} /> : 'chưa có'}/
            {mode === 'hourly' ? 'giờ' : 'ngày'}
          </DialogDescription>
        </DialogHeader>

        <SuccessBanner message={notice} />

        {range && (canAvailability || canPricing) ? (
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
                  key={`range-availability:${range.from}:${range.to}`}
                  method="post"
                  className="space-y-4"
                >
                  <input
                    type="hidden"
                    name="intent"
                    value={
                      setting === 'default' ? 'clear_availability_range' : 'save_availability_range'
                    }
                  />
                  <input type="hidden" name="from" value={range.from} />
                  <input type="hidden" name="to" value={range.to} />
                  <div>
                    <h3 className="text-sm font-semibold">Áp cho cả dải</h3>
                    <p className="text-xs text-muted-foreground">
                      {setting === 'default'
                        ? 'Xoá thiết lập riêng của mọi ngày trong dải, trả các ngày này về lịch tuần.'
                        : 'Thiết lập này ghi đè từng ngày trong dải.'}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="range-availability-setting">Trạng thái</Label>
                      <select
                        id="range-availability-setting"
                        name="availabilitySetting"
                        value={setting}
                        onChange={(event) => setSetting(event.target.value)}
                        className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="closed">Đóng cả ngày</option>
                        <option value="custom_hours">Mở theo giờ riêng</option>
                        <option value="default">Dùng lịch tuần (xoá thiết lập riêng)</option>
                      </select>
                    </div>
                    {setting === 'custom_hours' ? (
                      <WindowListField
                        key={`range-windows:${range.from}:${range.to}`}
                        idPrefix="range"
                        initial={[]}
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
                    {availabilityFetcher.state !== 'idle'
                      ? 'Đang lưu...'
                      : setting === 'default'
                        ? `Trả ${dates.length} ngày về lịch tuần`
                        : `Áp cho ${dates.length} ngày`}
                  </Button>
                </availabilityFetcher.Form>
              </TabsContent>
            ) : null}

            {canPricing ? (
              <TabsContent value="price" className="mt-4">
                <priceFetcher.Form
                  key={`range-price:${range.from}:${range.to}:${mode}`}
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="save_price_range" />
                  <input type="hidden" name="from" value={range.from} />
                  <input type="hidden" name="to" value={range.to} />
                  <input type="hidden" name="mode" value={mode} />
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Tag className="size-4" /> Giá cho cả dải
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
                      <Label htmlFor="range-regular-price">Giá thường (VND)</Label>
                      <Input
                        id="range-regular-price"
                        name="price"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={regularPrice}
                        onChange={(event) => setRegularPrice(event.target.value)}
                        placeholder={basePrice ? `Mặc định: ${basePrice}` : 'Nhập giá thường'}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
                    <div>
                      <Label htmlFor="range-sale-enabled">Bật giá ưu đãi</Label>
                      <p className="text-xs text-muted-foreground">
                        Tạo chiến dịch cho cả dải đã chọn.
                      </p>
                    </div>
                    <Switch
                      id="range-sale-enabled"
                      checked={saleEnabled}
                      onCheckedChange={(checked) => {
                        setSaleEnabled(checked);
                        if (!checked) setSalePrice('');
                      }}
                    />
                  </div>
                  {saleEnabled ? (
                    <div className="space-y-2">
                      <Label htmlFor="range-sale-price">Giá ưu đãi (VND)</Label>
                      <Input
                        id="range-sale-price"
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
                    idPrefix="range"
                    enabled={saleEnabled}
                    value={campaign}
                    onChange={setCampaign}
                  />
                  {saleEnabled ? (
                    <CampaignPreview
                      regularPrice={regularPrice}
                      salePrice={salePrice}
                      campaignLabel={campaign.label}
                      ruleScopeDescription={`${dates.length} ngày · ${mode === 'hourly' ? 'khung giờ đã chọn mỗi ngày' : 'cả ngày'}`}
                      startDate={campaign.startDate}
                      endDate={campaign.endDate}
                    />
                  ) : null}
                  {priceFetcher.data?.error ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {priceFetcher.data.error}
                    </p>
                  ) : null}
                  <Button type="submit" className="w-full" disabled={priceFetcher.state !== 'idle'}>
                    {priceFetcher.state === 'idle'
                      ? `Áp giá cho ${dates.length} ngày`
                      : 'Đang lưu...'}
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
