import { Ban, CalendarCheck, Clock3, Repeat, Tag } from 'lucide-react';
import type { PricingRuleResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { Money } from '~/components/money';
import { formatVnd } from '~/lib/format';
import {
  cheapestOf,
  formatDayLong,
  isClosed,
  type CalendarMode,
  type ClosureState,
} from '~/features/partner/lib/listing-calendar';

interface Props {
  date: string;
  mode: CalendarMode;
  closure: ClosureState;
  /** Date-scoped rules covering this date, for the current mode. */
  rules: PricingRuleResponse[];
  /** The listing's base price, shown when no rule covers the date. */
  basePrice: string | null;
  /** Bookings still holding the resource on this date. */
  bookingCount: number;
  /** A repeating rule is in force — the number shown may not be what a guest pays. */
  hasRecurring: boolean;
  isPast: boolean;
  isToday: boolean;
  isSelected: boolean;
  canEdit: boolean;
  onPick: (date: string, extendRange: boolean) => void;
}

const STATE_LABEL: Record<ClosureState, string> = {
  open: 'mở theo lịch tuần',
  custom_hours: 'mở theo giờ riêng',
  closed_override: 'đóng cả ngày',
  closed_weekly: 'nghỉ theo lịch tuần',
};

/**
 * One day in the month grid. Shows the effective price, how the day is
 * open/closed, and how many bookings hold it — the three things a partner
 * decides from without opening anything.
 */
export function DayCell({
  date,
  mode,
  closure,
  rules,
  basePrice,
  bookingCount,
  hasRecurring,
  isPast,
  isToday,
  isSelected,
  canEdit,
  onPick,
}: Props) {
  const closed = isClosed(closure);
  const priceRule = rules[0];
  // With several windows on one day a single number is a misread — show the
  // cheapest and say how many there are.
  const multiple = rules.length > 1;
  const price = cheapestOf(rules) ?? basePrice;
  const booked = bookingCount > 0;
  const unit = mode === 'hourly' ? 'giờ' : 'ngày';
  const priceDescription = price
    ? hasRecurring
      ? `giá cơ bản ${formatVnd(price)} mỗi ${unit}, giá cuối phụ thuộc khung giờ`
      : multiple
        ? `giá từ ${formatVnd(price)}, ${rules.length} khung giá`
        : `giá ${formatVnd(price)} mỗi ${unit}`
    : 'chưa có giá';
  const readOnly = !canEdit && !isPast;

  return (
    <button
      type="button"
      disabled={isPast || !canEdit}
      aria-pressed={isSelected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={
        isPast
          ? `${formatDayLong(date)} đã qua — ${STATE_LABEL[closure]}, ${priceDescription}, không thể chỉnh sửa`
          : `${formatDayLong(date)}${isToday ? ', hôm nay' : ''} — ${STATE_LABEL[closure]}, ${priceDescription}${booked ? `, ${bookingCount} lượt đặt` : ''}${readOnly ? ', chỉ đọc' : ''}`
      }
      title={
        isPast
          ? 'Ngày đã qua — chỉ xem, không thể chỉnh sửa'
          : readOnly
            ? 'Bạn không có quyền chỉnh sửa ngày này'
            : undefined
      }
      onClick={(event) => !isPast && canEdit && onPick(date, event.shiftKey)}
      className={cn(
        'relative min-h-14 border-r border-b p-1.5 text-left transition-[background-color,opacity,filter] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-24 sm:p-2',
        !isPast && canEdit && 'hover:bg-accent/60',
        closure === 'closed_override' && 'bg-destructive/10 text-muted-foreground',
        closure === 'closed_override' && !isPast && canEdit && 'hover:bg-destructive/15',
        closure === 'closed_weekly' && 'bg-muted/50 text-muted-foreground',
        !closed && closure === 'custom_hours' && 'bg-primary/5',
        !closed && priceRule?.salePrice && 'bg-emerald-50/70 dark:bg-emerald-950/15',
        (isPast || !canEdit) && 'cursor-not-allowed',
        isPast && 'opacity-60 saturate-50',
        isSelected && 'z-10 ring-2 ring-inset ring-primary',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full text-xs font-semibold sm:size-auto sm:justify-start sm:rounded-none sm:text-sm',
            isToday && 'bg-primary text-primary-foreground sm:size-7 sm:justify-center',
          )}
        >
          {Number(date.slice(-2))}
        </span>
        {closure === 'closed_override' ? (
          <Badge variant="destructive" className="hidden px-1.5 text-[10px] sm:inline-flex">
            Đóng
          </Badge>
        ) : closure === 'closed_weekly' ? (
          <Badge variant="outline" className="hidden px-1.5 text-[10px] sm:inline-flex">
            Nghỉ
          </Badge>
        ) : closure === 'custom_hours' ? (
          <Clock3 className="hidden size-3 text-primary sm:block" aria-hidden />
        ) : null}
      </div>

      <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 sm:hidden" aria-hidden>
        {closure === 'closed_override' || closure === 'closed_weekly' ? (
          <Ban
            className={cn(
              'size-3.5',
              closure === 'closed_override' ? 'text-destructive' : 'text-muted-foreground',
            )}
          />
        ) : closure === 'custom_hours' ? (
          <Clock3 className="size-3.5 text-primary" />
        ) : null}
        {priceRule?.salePrice ? <Tag className="size-3.5 text-emerald-600" /> : null}
        {hasRecurring ? <Repeat className="size-3.5 text-primary" /> : null}
        {booked ? <CalendarCheck className="size-3.5 text-primary" /> : null}
      </span>

      {price ? (
        <div className="mt-3 hidden space-y-0.5 sm:block">
          {!multiple && priceRule?.salePrice ? (
            <div className="text-[10px] text-muted-foreground line-through">
              <Money value={priceRule.price} />
            </div>
          ) : null}
          <div
            className={cn(
              'text-xs font-medium',
              !multiple && priceRule?.salePrice && 'text-emerald-700 dark:text-emerald-400',
            )}
          >
            {multiple ? 'từ ' : null}
            <Money value={price} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            {multiple
              ? `${rules.length} khung giá`
              : hasRecurring
                ? `giá cơ bản/${unit}`
                : `/${unit}`}
          </div>
        </div>
      ) : (
        <p className="mt-3 hidden text-[10px] text-muted-foreground sm:block">Chưa có giá</p>
      )}

      {booked ? (
        <span className="mt-1.5 hidden items-center gap-1 text-[10px] font-medium text-primary sm:flex">
          <CalendarCheck className="size-3" aria-hidden /> {bookingCount} lượt
        </span>
      ) : null}

      {hasRecurring ? (
        <span
          className="absolute right-2 bottom-2 hidden text-primary sm:block"
          title="Ngày này có quy tắc giá lặp lại — giá trên ô là giá cơ bản"
        >
          <Repeat className="size-3" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}
