import type { RecurringPricingKind } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { LoaderCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Money } from '~/components/money';
import type { CalendarMode } from '~/features/partner/lib/listing-calendar';
import { DAYS } from '~/features/partner/lib/listing-hours';
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
  const busy = fetcher.state !== 'idle';

  return (
    <fetcher.Form method="post" className="overflow-hidden rounded-2xl border bg-card shadow-none">
      <input type="hidden" name="intent" value="save_recurring_price" />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="kind" value={kind} />
      {days.map((day) => (
        <input key={day} type="hidden" name="days" value={day} />
      ))}

      <div className="border-b px-5 py-4">
        <h3 className="font-semibold">Tạo quy tắc mới</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn thời điểm lặp lại mỗi tuần và mức giá sẽ áp dụng trong thời điểm đó.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="space-y-5">
          {mode === 'hourly' ? (
            <fieldset className="space-y-2.5">
              <legend className="text-sm font-semibold">Phạm vi áp dụng</legend>
              <p id="recurring-kind-help" className="text-xs text-muted-foreground">
                Chọn thay giá trong một khung giờ hoặc cho cả ngày.
              </p>
              <ToggleGroup
                type="single"
                value={kind}
                onValueChange={(value) => value && setKind(value as RecurringPricingKind)}
                variant="outline"
                className="justify-start"
                aria-describedby="recurring-kind-help"
              >
                <ToggleGroupItem
                  value="time_range"
                  className="min-h-10 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
                >
                  Một khung giờ
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="day_of_week"
                  className="min-h-10 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
                >
                  Cả ngày
                </ToggleGroupItem>
              </ToggleGroup>
            </fieldset>
          ) : null}

          <fieldset className="space-y-2.5">
            <legend className="text-sm font-semibold">Ngày trong tuần</legend>
            <p id="recurring-days-help" className="text-xs text-muted-foreground">
              Có thể chọn nhiều ngày. Thứ 7 và Chủ nhật được chọn sẵn.
            </p>
            <ToggleGroup
              type="multiple"
              value={days}
              onValueChange={setDays}
              variant="outline"
              className="flex-wrap justify-start"
              aria-describedby="recurring-days-help"
              aria-required="true"
            >
              {DAYS.map((day) => (
                <ToggleGroupItem
                  key={day.dow}
                  value={String(day.dow)}
                  aria-label={day.label}
                  className="min-h-11 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
                >
                  {day.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {days.length === 0 ? (
              <p className="text-xs font-medium text-destructive">Chọn ít nhất một ngày để lưu.</p>
            ) : null}
          </fieldset>

          {kind === 'time_range' ? (
            <fieldset className="space-y-2.5">
              <legend className="text-sm font-semibold">Khung giờ</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="recurring-from">Bắt đầu</Label>
                  <Input
                    id="recurring-from"
                    name="windowFrom"
                    type="time"
                    defaultValue="18:00"
                    required
                    aria-required="true"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-to">Kết thúc</Label>
                  <Input
                    id="recurring-to"
                    name="windowTo"
                    type="time"
                    defaultValue="22:00"
                    required
                    aria-required="true"
                  />
                </div>
              </div>
            </fieldset>
          ) : null}
        </div>

        <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <div>
            <h4 className="text-sm font-semibold">Giá áp dụng</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Nhập giá mới cho thời điểm đã chọn. Giá ưu đãi là tùy chọn.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-price">Giá áp dụng (VND)</Label>
            <Input
              id="recurring-price"
              name="price"
              inputMode="numeric"
              placeholder="Ví dụ: 1100000"
              required
              aria-required="true"
              aria-describedby="recurring-base-price"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurring-sale-price">Giá ưu đãi (VND)</Label>
            <Input
              id="recurring-sale-price"
              name="salePrice"
              inputMode="numeric"
              placeholder="Không bắt buộc"
              aria-describedby="recurring-sale-help"
            />
            <p id="recurring-sale-help" className="text-xs text-muted-foreground">
              Nếu nhập, giá ưu đãi phải thấp hơn giá áp dụng.
            </p>
          </div>

          <p id="recurring-base-price" className="border-t pt-3 text-xs text-muted-foreground">
            Giá cơ bản hiện tại:{' '}
            <span className="font-medium text-foreground">
              {basePrice ? <Money value={basePrice} /> : 'Chưa thiết lập'}/
              {mode === 'hourly' ? 'giờ' : 'ngày'}
            </span>
          </p>
        </div>
      </div>

      {fetcher.data?.error ? (
        <p
          className="mx-5 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {fetcher.data.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t bg-muted/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Quy tắc mới có hiệu lực ngay sau khi lưu.</p>
        <Button type="submit" disabled={busy || days.length === 0}>
          {busy ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Đang lưu…
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden /> Thêm quy tắc
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}
