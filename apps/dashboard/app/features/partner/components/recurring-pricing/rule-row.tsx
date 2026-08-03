import { useFetcher } from 'react-router';
import { LoaderCircle, Repeat, Trash2 } from 'lucide-react';
import type { PricingRuleResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { ConfirmButton } from '~/components/confirm-button';
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
  const daysLabel = describeDays(rule.params);
  const busy = fetcher.state !== 'idle';

  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Repeat className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{daysLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isWindow
                ? `Từ ${String(rule.params.from)} đến ${String(rule.params.to)}`
                : 'Áp dụng cả ngày'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-xs text-muted-foreground">Giá áp dụng</p>
            <p
              className={cn(
                'mt-0.5 font-semibold tabular-nums',
                rule.salePrice && 'text-success',
              )}
            >
              <Money value={rule.salePrice ?? rule.price} />/{unit}
            </p>
            {rule.salePrice ? (
              <p className="text-xs text-muted-foreground line-through">
                <Money value={rule.price} />
              </p>
            ) : null}
          </div>

          {canWrite ? (
            <ConfirmButton
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Xoá quy tắc ${daysLabel}`}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  )}
                </Button>
              }
              title="Xoá quy tắc giá?"
              description={`Quy tắc cho ${daysLabel} sẽ bị xoá. Các thời điểm này sẽ quay lại dùng giá cơ bản hoặc quy tắc có độ ưu tiên thấp hơn.`}
              confirmLabel="Xoá quy tắc"
              destructive
              busy={busy}
              onConfirm={() =>
                fetcher.submit(
                  { intent: 'delete_recurring_price', ruleId: rule.id },
                  { method: 'post' },
                )
              }
            />
          ) : null}
        </div>
      </div>

      {fetcher.data?.error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}
