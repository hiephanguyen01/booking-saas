import { useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Field, FieldGroup, FieldTitle } from '@booking/ui/components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@booking/ui/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
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

function fromDayValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }

  return date;
}

function fromCalendarDay(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function DateFieldPicker({
  label,
  value,
  selected,
  defaultMonth,
  disabledBefore,
  disabled = false,
  invalid = false,
  onSelect,
}: {
  label: string;
  value: string;
  selected?: Date;
  defaultMonth?: Date;
  disabledBefore?: Date;
  disabled?: boolean;
  invalid?: boolean;
  onSelect: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const displayValue = selected ? formatDayValue(value) : value ? 'Không hợp lệ' : 'Chọn ngày';

  return (
    <Field
      className="min-w-0 gap-0"
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="control"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-label={`${label}: ${displayValue}`}
            className="h-auto w-full min-w-0 justify-between px-3 py-2 text-left shadow-xs"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <span className="truncate font-semibold">{displayValue}</span>
            </span>
            <CalendarDays data-icon="inline-end" className="text-muted-foreground" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={16} className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onSelect(date);
              setOpen(false);
            }}
            required
            disabled={disabledBefore ? { before: disabledBefore } : undefined}
            defaultMonth={defaultMonth}
            autoFocus
            className="[--cell-size:2.25rem]"
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}

export function DateRangeFilter({ field, from, to, onApply, className }: DateRangeFilterProps) {
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

  const currentLabel = triggerLabel(field, from, to);
  const draftFromDate = fromDayValue(draftFrom);
  const draftToDate = fromDayValue(draftTo);
  const isInvalidRange =
    Boolean(draftFrom && !draftFromDate) ||
    Boolean(draftTo && !draftToDate) ||
    Boolean(draftFromDate && draftToDate && draftToDate < draftFromDate);
  const canApply = Boolean(draftFromDate && draftToDate && !isInvalidRange);
  const selectedPreset =
    DATE_PRESETS.find((preset) => {
      const range = presetRange(preset.kind);
      return range.from === draftFrom && range.to === draftTo;
    })?.kind ?? '';

  const handleFromSelect = (date: Date) => {
    setDraftFrom(fromCalendarDay(date));
    if (draftToDate && draftToDate < date) setDraftTo('');
  };

  const handleToSelect = (date: Date) => {
    if (!draftFromDate || date < draftFromDate) return;
    setDraftTo(fromCalendarDay(date));
  };

  const handleApply = () => {
    if (!canApply) return;
    onApply(draftFrom, draftTo);
    setOpen(false);
  };

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
          <ChevronDown data-icon="inline-end" className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={16}
        className="flex w-[calc(100vw-2rem)] flex-col gap-0 rounded-2xl p-0 sm:w-[34rem]"
      >
        <div className="flex flex-col gap-4 px-4 pt-4 sm:px-6 sm:pt-6">
          <PopoverHeader className="gap-1">
            <PopoverTitle className="text-lg font-semibold">{field.label}</PopoverTitle>
            <PopoverDescription>Chọn khoảng ngày để lọc danh sách.</PopoverDescription>
          </PopoverHeader>

          <FieldGroup className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-xl bg-muted/50 p-3">
            <DateFieldPicker
              label="Từ ngày"
              value={draftFrom}
              selected={draftFromDate}
              defaultMonth={draftFromDate ?? draftToDate}
              invalid={Boolean(draftFrom && !draftFromDate)}
              onSelect={handleFromSelect}
            />
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
            <DateFieldPicker
              label="Đến ngày"
              value={draftTo}
              selected={draftToDate}
              defaultMonth={draftToDate ?? draftFromDate}
              disabledBefore={draftFromDate}
              disabled={!draftFromDate}
              invalid={Boolean(
                draftTo && (!draftToDate || (draftFromDate && draftToDate < draftFromDate)),
              )}
              onSelect={handleToSelect}
            />
          </FieldGroup>

          {/* {isInvalidRange ? (
            <FieldError>Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.</FieldError>
          ) : !draftFromDate ? (
            <FieldDescription>Chọn ngày bắt đầu trước, sau đó chọn ngày kết thúc.</FieldDescription>
          ) : !draftToDate ? (
            <FieldDescription>Chọn ngày kết thúc bằng hoặc sau ngày bắt đầu.</FieldDescription>
          ) : null} */}
        </div>

        <div className="flex flex-col gap-2 px-4 py-4 sm:px-6 sm:pb-6">
          <FieldTitle>Gợi ý</FieldTitle>
          <ToggleGroup
            type="single"
            value={selectedPreset}
            onValueChange={(kind) => {
              if (!kind) return;
              const range = presetRange(kind as PresetKind);
              setDraftFrom(range.from);
              setDraftTo(range.to);
            }}
            variant="outline"
            size="sm"
            spacing={2}
            className="h-auto w-full flex-wrap justify-start"
            aria-label="Khoảng ngày gợi ý"
          >
            {DATE_PRESETS.map((preset) => (
              <ToggleGroupItem key={preset.kind} value={preset.kind}>
                {preset.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" size="control" variant="secondary" onClick={handleClose}>
              Đóng
            </Button>
            <Button type="button" size="control" onClick={handleApply} disabled={!canApply}>
              <CalendarDays data-icon="inline-start" aria-hidden />
              Áp dụng
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
