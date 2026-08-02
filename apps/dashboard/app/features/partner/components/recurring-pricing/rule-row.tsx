import { useFetcher } from 'react-router';
import { Repeat, Trash2 } from 'lucide-react';
import type { PricingRuleResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { Money } from '~/components/money';
import { DAYS } from '~/features/partner/lib/listing-hours';

interface Props {
  rule: PricingRuleResponse;
  unit: 'giờ' | 'ngày';
  canWrite: boolean;
}

/** "T7, CN" — Monday-first, matching the weekly-hours screen. */
function describeDays(params: Record<string, unknown>): string {
  const days = params.days;
  if (!Array.isArray(days) || days.length === 0) return 'Mọi ngày trong tuần';
  if (days.length === 7) return 'Mọi ngày trong tuần';
  const picked = new Set(days.map(Number));
  return DAYS.filter((day) => picked.has(day.dow))
    .map((day) => day.label)
    .join(', ');
}

export function RuleRow({ rule, unit, canWrite }: Props) {
  const fetcher = useFetcher<{ ok: boolean; error?: string | null }>();
  const isWindow = rule.ruleType === 'time_range';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Repeat className="size-4 text-primary" aria-hidden />
          {describeDays(rule.params)}
          {isWindow ? (
            <Badge variant="secondary">
              {String(rule.params.from)}–{String(rule.params.to)}
            </Badge>
          ) : (
            <Badge variant="outline">Cả ngày</Badge>
          )}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn(rule.salePrice && 'font-medium text-emerald-700')}>
            <Money value={rule.salePrice ?? rule.price} />/{unit}
          </span>
          {rule.salePrice ? (
            <span className="text-muted-foreground line-through">
              <Money value={rule.price} />
            </span>
          ) : null}
        </p>
      </div>
      {canWrite ? (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="delete_recurring_price" />
          <input type="hidden" name="ruleId" value={rule.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label={`Xoá quy tắc ${describeDays(rule.params)}`}
            disabled={fetcher.state !== 'idle'}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </fetcher.Form>
      ) : null}
    </div>
  );
}
