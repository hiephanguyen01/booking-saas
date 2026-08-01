import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { Pencil, Plus, X } from 'lucide-react';
import type { PricingRuleResponse, RecurringPricingKind } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Switch } from '@booking/ui/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { cn } from '@booking/ui/lib/utils';
import { Money } from '~/components/money';
import { DAYS } from '~/features/partner/lib/listing-hours';
import {
  campaignEndDate,
  dateOnly,
  maximumSalePrice,
  type CalendarMode,
} from '~/features/partner/lib/listing-calendar';
import { useSubmitSuccess, type SubmitResult } from '~/features/partner/lib/use-submit-success';
import { CampaignPreview } from '../listing-calendar/campaign-preview';
import {
  SaleCampaignFields,
  type SaleCampaignValue,
} from '../listing-calendar/sale-campaign-fields';

interface Props {
  mode: CalendarMode;
  basePrice: string | null;
  /** The rule being edited; `null` builds a new one. */
  editing: PricingRuleResponse | null;
  onSaved: () => void;
  onCancelEdit: () => void;
}

/** Weekend is the overwhelmingly common first rule, so it is the default pick. */
const WEEKEND = ['6', '0'];

function daysOf(rule: PricingRuleResponse): string[] {
  const days = rule.params.days;
  return Array.isArray(days) && days.length > 0 ? days.map(String) : [];
}

export function RuleForm({ mode, basePrice, editing, onSaved, onCancelEdit }: Props) {
  const fetcher = useFetcher<SubmitResult>();
  // `time_range` prices a band of hours, which only means anything when the
  // unit being priced is an hour — a nightly listing has one unit per date.
  const [kind, setKind] = useState<RecurringPricingKind>(
    mode === 'hourly' ? 'time_range' : 'day_of_week',
  );
  const [days, setDays] = useState<string[]>(WEEKEND);
  const [windowFrom, setWindowFrom] = useState('18:00');
  const [windowTo, setWindowTo] = useState('22:00');
  const [regularPrice, setRegularPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleEnabled, setSaleEnabled] = useState(false);
  const [campaign, setCampaign] = useState<SaleCampaignValue>({
    startDate: '',
    endDate: '',
    label: '',
  });

  // Editing reuses the create form and the create request: the API replaces a
  // rule that names the same scope, so "edit" is seeding these fields. Picking a
  // different scope while editing therefore MOVES the rule — it deletes the old
  // scope only if it happens to match, which is why the button says "Lưu" and
  // the header names the rule being changed.
  useEffect(() => {
    if (!editing) {
      setKind(mode === 'hourly' ? 'time_range' : 'day_of_week');
      setDays(WEEKEND);
      setWindowFrom('18:00');
      setWindowTo('22:00');
      setRegularPrice('');
      setSalePrice('');
      setSaleEnabled(false);
      setCampaign({ startDate: '', endDate: '', label: '' });
      return;
    }
    setKind(editing.ruleType === 'time_range' ? 'time_range' : 'day_of_week');
    setWindowFrom(String(editing.params.from ?? '18:00'));
    setWindowTo(String(editing.params.to ?? '22:00'));
    setRegularPrice(editing.price);
    setSalePrice(editing.salePrice ?? '');
    setSaleEnabled(Boolean(editing.salePrice));
    setCampaign({
      startDate: dateOnly(editing.saleStartsAt) ?? '',
      endDate: campaignEndDate(editing.saleEndsAt) ?? '',
      label: editing.campaignLabel ?? '',
    });
    const picked = daysOf(editing);
    setDays(picked.length > 0 ? picked : ['0', '1', '2', '3', '4', '5', '6']);
  }, [editing, mode]);

  useSubmitSuccess(fetcher, onSaved);

  return (
    <fetcher.Form
      key={editing?.id ?? 'new'}
      method="post"
      className={cn(
        'space-y-4 rounded-xl border p-4',
        editing ? 'border-primary/40 bg-primary/5' : 'bg-muted/20',
      )}
    >
      <input type="hidden" name="intent" value="save_recurring_price" />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="kind" value={kind} />
      {days.map((day) => (
        <input key={day} type="hidden" name="days" value={day} />
      ))}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {editing ? 'Sửa quy tắc lặp lại' : 'Thêm quy tắc lặp lại'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {editing
              ? 'Đổi thứ hoặc khung giờ sẽ chuyển quy tắc sang phạm vi mới, không tạo thêm bản sao.'
              : 'Áp mãi cho những thứ bạn chọn. Giá riêng của một ngày cụ thể vẫn đè lên quy tắc này.'}
          </p>
        </div>
        {editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
            <X className="size-4" aria-hidden /> Huỷ
          </Button>
        ) : null}
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
              <Input
                id="recurring-from"
                name="windowFrom"
                type="time"
                value={windowFrom}
                onChange={(event) => setWindowFrom(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-to">Đến giờ</Label>
              <Input
                id="recurring-to"
                name="windowTo"
                type="time"
                value={windowTo}
                onChange={(event) => setWindowTo(event.target.value)}
                required
              />
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="recurring-price">Giá thường (VND)</Label>
          <Input
            id="recurring-price"
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
          <Label htmlFor="recurring-sale-enabled">Bật giá ưu đãi</Label>
          <p className="text-xs text-muted-foreground">Gắn chiến dịch vào quy tắc lặp lại này.</p>
        </div>
        <Switch
          id="recurring-sale-enabled"
          checked={saleEnabled}
          onCheckedChange={(checked) => {
            setSaleEnabled(checked);
            if (!checked) setSalePrice('');
          }}
        />
      </div>
      {saleEnabled ? (
        <div className="space-y-2">
          <Label htmlFor="recurring-sale-price">Giá ưu đãi (VND)</Label>
          <Input
            id="recurring-sale-price"
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
        idPrefix="recurring"
        enabled={saleEnabled}
        value={campaign}
        onChange={setCampaign}
      />
      {saleEnabled ? (
        <CampaignPreview
          regularPrice={regularPrice}
          salePrice={salePrice}
          campaignLabel={campaign.label}
          ruleScopeDescription={`${
            days.length === 7
              ? 'Mọi ngày trong tuần'
              : DAYS.filter((day) => days.includes(String(day.dow)))
                  .map((day) => day.label)
                  .join(', ')
          } · ${kind === 'time_range' ? `${windowFrom}–${windowTo}` : 'cả ngày'}`}
          startDate={campaign.startDate}
          endDate={campaign.endDate}
        />
      ) : null}

      {basePrice ? (
        <p className="text-xs text-muted-foreground">
          Giá mặc định của tin đăng: <Money value={basePrice} />/
          {mode === 'hourly' ? 'giờ' : 'ngày'}
        </p>
      ) : null}

      {fetcher.data?.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {fetcher.data.error}
        </p>
      ) : null}

      <Button type="submit" disabled={fetcher.state !== 'idle' || days.length === 0}>
        {fetcher.state === 'idle' ? (
          editing ? (
            <>
              <Pencil className="size-4" /> Lưu quy tắc
            </>
          ) : (
            <>
              <Plus className="size-4" /> Thêm quy tắc
            </>
          )
        ) : (
          'Đang lưu...'
        )}
      </Button>
    </fetcher.Form>
  );
}
