import type { CancellationPolicySource, CancellationPolicySummary } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { DetailRow } from '@booking/ui/components/detail/detail-row';
import { formatHoursBefore } from '~/lib/format';
import { asRecord, readNumber } from '~/lib/records';
import { CANCELLATION_SOURCE_LABEL } from '~/constants/finance';

export interface CancellationTier {
  hoursBefore: number;
  refundPercent: number;
}

/**
 * Coerce a policy's `rules` (jsonb, typed `unknown` on the wire) into sorted refund
 * tiers. Defensive on purpose — legacy rows may hold an unexpected shape, so anything
 * that isn't `{hoursBefore, refundPercent}` is dropped rather than crashing the page.
 */
export function toCancellationTiers(rules: unknown): CancellationTier[] {
  return (Array.isArray(rules) ? rules : [])
    .map(asRecord)
    .map((r) =>
      r ? { hoursBefore: readNumber(r.hoursBefore), refundPercent: readNumber(r.refundPercent) } : null,
    )
    .filter(
      (t): t is CancellationTier =>
        t !== null && t.hoursBefore !== null && t.refundPercent !== null,
    )
    .sort((a, b) => b.hoursBefore - a.hoursBefore);
}

export function cancellationTierLabel(hoursBefore: number): string {
  if (hoursBefore <= 0) return 'Sát giờ / sau khi bắt đầu';
  return `Huỷ trước ${formatHoursBefore(hoursBefore)}`;
}

/**
 * Compact cell showing the policy that actually governs a listing after fallback,
 * plus a badge for where it came from. Used in the partner listing table + group detail.
 */
export function EffectiveCancellationPolicyCell({
  policy,
  source,
}: {
  policy: CancellationPolicySummary | null;
  source: CancellationPolicySource | null;
}) {
  if (!policy) {
    return <span className="text-sm text-muted-foreground">Không có</span>;
  }
  return (
    <div className="space-y-1">
      <p className="truncate text-sm font-medium">{policy.name}</p>
      {source ? (
        <Badge variant="outline" className="font-normal">
          {CANCELLATION_SOURCE_LABEL[source]}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * Renders a cancellation policy's refund tiers as labelled rows. Shared by the tenant
 * listing-review card, the partner listing detail, and anywhere a policy is shown.
 */
export function CancellationTiers({
  rules,
  emptyMessage = 'Không có mốc hoàn tiền cụ thể.',
}: {
  rules: unknown;
  emptyMessage?: string;
}) {
  const tiers = toCancellationTiers(rules);
  if (tiers.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-1">
      {tiers.map((t, i) => (
        <DetailRow
          key={i}
          label={cancellationTierLabel(t.hoursBefore)}
          value={`Hoàn ${Math.max(0, Math.min(100, t.refundPercent))}%`}
        />
      ))}
    </div>
  );
}
