import { useFetcher } from 'react-router';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import type { PricingRuleResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { Money } from '~/components/money';
import { DAYS } from '~/features/partner/lib/listing-hours';
import { campaignPresentationOf } from '~/features/partner/lib/listing-calendar';

interface Props {
  rule: PricingRuleResponse;
  unit: 'giờ' | 'ngày';
  canWrite: boolean;
  isEditing: boolean;
  onEdit: () => void;
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

export function RuleRow({ rule, unit, canWrite, isEditing, onEdit }: Props) {
  const fetcher = useFetcher<{ ok: boolean; error?: string | null }>();
  const isWindow = rule.ruleType === 'time_range';
  const campaign = campaignPresentationOf(
    [rule],
    rule.bookingMode === 'daily' ? 'daily' : 'hourly',
  );

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3',
        isEditing && 'border-primary ring-1 ring-primary',
      )}
    >
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
          {/* A sale that is scheduled or over is NOT what a guest pays today,
              so the headline number stays the regular price in those states. */}
          <span
            className={cn(campaign.state === 'running' && 'font-medium text-warning-foreground')}
          >
            <Money
              value={campaign.state === 'running' ? (campaign.salePrice ?? rule.price) : rule.price}
            />
            /{unit}
          </span>
          {campaign.state === 'running' ? (
            <span className="text-muted-foreground line-through">
              <Money value={rule.price} />
            </span>
          ) : null}
          {campaign.state !== 'none' ? (
            <Badge
              variant="outline"
              className={cn(
                campaign.state === 'running' &&
                  'border-warning/40 bg-warning/15 text-warning-foreground',
              )}
            >
              {campaign.label ?? 'Đang giảm giá'}
            </Badge>
          ) : null}
          {campaign.state === 'scheduled' || campaign.state === 'ended' ? (
            <Badge variant="secondary">
              {campaign.state === 'scheduled' ? 'Sắp diễn ra' : 'Đã kết thúc'}
            </Badge>
          ) : campaign.state === 'running' ? (
            <Badge variant="outline" className="border-warning/40 text-warning-foreground">
              Đang chạy
            </Badge>
          ) : null}
        </p>
      </div>
      {canWrite ? (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Sửa quy tắc ${describeDays(rule.params)}`}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
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
        </div>
      ) : null}
    </div>
  );
}
