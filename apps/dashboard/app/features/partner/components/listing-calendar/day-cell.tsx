import { CalendarCheck, Clock3, Repeat } from 'lucide-react';
import type { PricingRuleResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { Money } from '~/components/money';
import {
  campaignState,
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
  isSelected: boolean;
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
  isSelected,
  onPick,
}: Props) {
  const closed = isClosed(closure);
  const priceRule = rules[0];
  // Only a RUNNING campaign should tint the cell and strike the old price —
  // a scheduled or ended one is not what a guest is offered today.
  const saleActive = priceRule ? campaignState(priceRule) === 'running' : false;
  const campaignLabel = saleActive ? priceRule?.campaignLabel : null;
  // With several windows on one day a single number is a misread — show the
  // cheapest and say how many there are.
  const multiple = rules.length > 1;
  const price = cheapestOf(rules) ?? basePrice;
  const booked = bookingCount > 0;

  return (
    <button
      type="button"
      disabled={isPast}
      aria-pressed={isSelected}
      aria-label={
        isPast
          ? `${formatDayLong(date)} đã qua, không thể chỉnh sửa`
          : `${formatDayLong(date)} — ${STATE_LABEL[closure]}${booked ? `, ${bookingCount} lượt đặt` : ''}${
              hasRecurring ? ', có quy tắc giá lặp lại' : ''
            }`
      }
      title={isPast ? 'Ngày đã qua — chỉ xem, không thể chỉnh sửa' : undefined}
      onClick={(event) => !isPast && onPick(date, event.shiftKey)}
      className={cn(
        'relative min-h-24 border-r border-b p-2 text-left transition-[background-color,opacity,filter] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !isPast && 'hover:bg-accent/60',
        closure === 'closed_override' && 'bg-destructive/10 text-muted-foreground',
        closure === 'closed_override' && !isPast && 'hover:bg-destructive/15',
        closure === 'closed_weekly' && 'bg-muted/50 text-muted-foreground',
        !closed && closure === 'custom_hours' && 'bg-primary/5',
        !closed && saleActive && 'bg-emerald-50/70 dark:bg-emerald-950/15',
        isPast && 'cursor-not-allowed opacity-40 saturate-50',
        isSelected && 'z-10 ring-2 ring-inset ring-primary',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-semibold">{Number(date.slice(-2))}</span>
        {closure === 'closed_override' ? (
          <Badge variant="destructive" className="px-1.5 text-[10px]">
            Đóng
          </Badge>
        ) : closure === 'closed_weekly' ? (
          <Badge variant="outline" className="px-1.5 text-[10px]">
            Nghỉ
          </Badge>
        ) : closure === 'custom_hours' ? (
          <Clock3 className="size-3 text-primary" aria-hidden />
        ) : null}
      </div>

      {hasRecurring ? (
        // Hourly cells cannot fold a repeating rule into one number, so mark the
        // day instead of printing a price no guest would be charged.
        <span
          className="absolute right-2 bottom-2 text-primary"
          title="Ngày này có quy tắc giá lặp lại — giá trên ô chưa phải giá cuối"
        >
          <Repeat className="size-3" aria-hidden />
        </span>
      ) : null}

      {price ? (
        <div className="mt-3 space-y-0.5">
          {!multiple && saleActive ? (
            <div className="text-[10px] text-muted-foreground line-through">
              <Money value={priceRule.price} />
            </div>
          ) : null}
          <div
            className={cn(
              'text-xs font-medium',
              !multiple && saleActive && 'text-emerald-700 dark:text-emerald-400',
            )}
          >
            {multiple ? 'từ ' : null}
            <Money value={price} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            {multiple ? `${rules.length} khung giá` : `/${mode === 'hourly' ? 'giờ' : 'ngày'}`}
          </div>
          {campaignLabel ? (
            <div className="truncate text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              {campaignLabel}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[10px] text-muted-foreground">Chưa có giá</p>
      )}

      {booked ? (
        <span className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-primary">
          <CalendarCheck className="size-3" aria-hidden /> {bookingCount} lượt
        </span>
      ) : null}
    </button>
  );
}
