import { useId, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { cn } from '@booking/ui/lib/utils';
import { TZ } from '~/constants/time';
import type { FilterField } from '~/lib/list-filters';

type DateRangeField = Extract<FilterField, { kind: 'date-range' }>;
type DateRangeValue = { from: string; to: string };
type PresetKind = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

interface DatePreset {
  kind: PresetKind;
  label: string;
}

interface DateRangeFilterProps {
  field: DateRangeField;
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  className?: string;
}

const DATE_PRESETS: readonly DatePreset[] = [
  { kind: 'today', label: 'Hôm nay' },
  { kind: 'yesterday', label: 'Hôm qua' },
  { kind: 'thisWeek', label: 'Tuần này' },
  { kind: 'lastWeek', label: 'Tuần trước' },
  { kind: 'thisMonth', label: 'Tháng này' },
  { kind: 'lastMonth', label: 'Tháng trước' },
];

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function marketToday(now = new Date()): Date {
  const parts = dayFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(Date.UTC(value('year'), value('month') - 1, value('day'), 12));
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function toDayValue(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function presetRange(kind: PresetKind, now = new Date()): DateRangeValue {
  const today = marketToday(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  if (kind === 'today') {
    const value = toDayValue(today);
    return { from: value, to: value };
  }

  if (kind === 'yesterday') {
    const value = toDayValue(addDays(today, -1));
    return { from: value, to: value };
  }

  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const currentMonday = addDays(today, -mondayOffset);

  if (kind === 'thisWeek') {
    return {
      from: toDayValue(currentMonday),
      to: toDayValue(addDays(currentMonday, 6)),
    };
  }

  if (kind === 'lastWeek') {
    const previousMonday = addDays(currentMonday, -7);
    return {
      from: toDayValue(previousMonday),
      to: toDayValue(addDays(previousMonday, 6)),
    };
  }

  if (kind === 'thisMonth') {
    return {
      from: toDayValue(new Date(Date.UTC(year, month, 1, 12))),
      to: toDayValue(new Date(Date.UTC(year, month + 1, 0, 12))),
    };
  }

  return {
    from: toDayValue(new Date(Date.UTC(year, month - 1, 1, 12))),
    to: toDayValue(new Date(Date.UTC(year, month, 0, 12))),
  };
}

function triggerLabel(field: DateRangeField, from: string, to: string): string {
  if (from && to) return `${formatDayValue(from)} – ${formatDayValue(to)}`;
  if (from) return `Từ ${formatDayValue(from)}`;
  if (to) return `Đến ${formatDayValue(to)}`;
  return field.label;
}

export function DateRangeFilter({ field, from, to, onApply, className }: DateRangeFilterProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftFrom(from);
      setDraftTo(to);
    }
    setOpen(nextOpen);
  };

  const handleClose = () => {
    setDraftFrom(from);
    setDraftTo(to);
    setOpen(false);
  };

  const handleApply = () => {
    onApply(draftFrom, draftTo);
    setOpen(false);
  };

  const currentLabel = triggerLabel(field, from, to);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="control"
          className={cn(
            'w-full min-w-40 justify-between bg-muted/60 font-medium shadow-none sm:w-auto',
            (from || to) && 'border-primary/30 bg-primary/5 text-primary',
            className,
          )}
          aria-label={`${field.label}: ${currentLabel}`}
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={16}
        className="w-[min(42rem,calc(100vw-2rem))] space-y-6 rounded-2xl p-5 sm:p-7"
      >
        <h2 className="text-lg font-semibold text-foreground sm:text-xl">{field.label}</h2>

        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">Khoảng thời gian</p>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-from`}>Từ ngày</Label>
              <Input
                id={`${id}-from`}
                type="date"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.currentTarget.value)}
                className="bg-background"
              />
            </div>
            <ArrowRight
              className="mx-auto mb-3 hidden size-5 text-muted-foreground sm:block"
              aria-hidden
            />
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-to`}>Đến ngày</Label>
              <Input
                id={`${id}-to`}
                type="date"
                value={draftTo}
                onChange={(event) => setDraftTo(event.currentTarget.value)}
                className="bg-background"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <p className="text-sm font-medium">Gợi ý</p>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => {
              const value = presetRange(preset.kind);
              const selected = draftFrom === value.from && draftTo === value.to;

              return (
                <Button
                  key={preset.kind}
                  type="button"
                  size="sm"
                  variant={selected ? 'default' : 'secondary'}
                  onClick={() => {
                    setDraftFrom(value.from);
                    setDraftTo(value.to);
                  }}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button type="button" size="control" onClick={handleApply}>
            <CalendarDays aria-hidden />
            Áp dụng
          </Button>
          <Button type="button" size="control" variant="secondary" onClick={handleClose}>
            Đóng
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
