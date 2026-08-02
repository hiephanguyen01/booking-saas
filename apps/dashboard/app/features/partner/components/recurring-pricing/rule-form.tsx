import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Plus } from 'lucide-react';
import type { RecurringPricingKind } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { Money } from '~/components/money';
import { DAYS } from '~/features/partner/lib/listing-hours';
import type { CalendarMode } from '~/features/partner/lib/listing-calendar';
import { useSubmitSuccess, type SubmitResult } from '~/features/partner/lib/use-submit-success';

interface Props {
  mode: CalendarMode;
  basePrice: string | null;
  onSaved: () => void;
}

/** Weekend is the overwhelmingly common first rule, so it is the default pick. */
const WEEKEND = ['6', '0'];

export function RuleForm({ mode, basePrice, onSaved }: Props) {
  const fetcher = useFetcher<SubmitResult>();
  // `time_range` prices a band of hours, which only means anything when the
  // unit being priced is an hour — a nightly listing has one unit per date.
  const [kind, setKind] = useState<RecurringPricingKind>(
    mode === 'hourly' ? 'time_range' : 'day_of_week',
  );
  const [days, setDays] = useState<string[]>(WEEKEND);
  useSubmitSuccess(fetcher, onSaved);

  return (
    <fetcher.Form method="post" className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <input type="hidden" name="intent" value="save_recurring_price" />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="kind" value={kind} />
      {days.map((day) => (
        <input key={day} type="hidden" name="days" value={day} />
      ))}

      <div>
        <h3 className="text-sm font-semibold">Thêm quy tắc lặp lại</h3>
        <p className="text-xs text-muted-foreground">
          Áp mãi cho những thứ bạn chọn. Giá riêng của một ngày cụ thể vẫn đè lên quy tắc này.
        </p>
      </div>

      {mode === 'hourly' ? (
        <div className="space-y-2">
          <Label>Phạm vi</Label>
          <ToggleGroup
            type="single"
            value={kind}
            onValueChange={(value) => value && setKind(value as RecurringPricingKind)}
            variant="outline"
            className="justify-start"
          >
            <ToggleGroupItem value="time_range">Một khung giờ</ToggleGroupItem>
            <ToggleGroupItem value="day_of_week">Cả ngày</ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Áp cho thứ</Label>
        <ToggleGroup
          type="multiple"
          value={days}
          onValueChange={setDays}
          variant="outline"
          className="flex-wrap justify-start"
        >
          {DAYS.map((day) => (
            <ToggleGroupItem key={day.dow} value={String(day.dow)} aria-label={day.label}>
              {day.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {kind === 'time_range' ? (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <div className="space-y-2">
              <Label htmlFor="recurring-from">Từ giờ</Label>
              <Input id="recurring-from" name="windowFrom" type="time" defaultValue="18:00" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-to">Đến giờ</Label>
              <Input id="recurring-to" name="windowTo" type="time" defaultValue="22:00" required />
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="recurring-price">Giá thường (VND)</Label>
          <Input
            id="recurring-price"
            name="price"
            inputMode="numeric"
            placeholder={basePrice ? `Mặc định: ${basePrice}` : 'Nhập giá thường'}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recurring-sale-price">Giá sale (VND)</Label>
          <Input
            id="recurring-sale-price"
            name="salePrice"
            inputMode="numeric"
            placeholder="Không bắt buộc"
          />
        </div>
      </div>

      {basePrice ? (
        <p className="text-xs text-muted-foreground">
          Giá mặc định của tin đăng: <Money value={basePrice} />/{mode === 'hourly' ? 'giờ' : 'ngày'}
        </p>
      ) : null}

      {fetcher.data?.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {fetcher.data.error}
        </p>
      ) : null}

      <Button type="submit" disabled={fetcher.state !== 'idle' || days.length === 0}>
        {fetcher.state === 'idle' ? (
          <>
            <Plus className="size-4" /> Thêm quy tắc
          </>
        ) : (
          'Đang lưu...'
        )}
      </Button>
    </fetcher.Form>
  );
}
