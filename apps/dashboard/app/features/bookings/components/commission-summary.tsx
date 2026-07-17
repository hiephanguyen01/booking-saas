import * as React from 'react';
import type { ReactNode } from 'react';
import { Money } from '~/components/money';

export interface CommissionRow {
  label: string;
  value: ReactNode;
}

/** Inline label/value pairs for the frozen commission split (tenant audience only). */
export function CommissionRows({ rows }: { rows: CommissionRow[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {rows.map((row) => (
        <span key={row.label} className="inline-flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">{row.label}:</span>
          <span className="font-medium tabular-nums">{row.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Best-effort summary of the opaque `commissionSnapshot` jsonb (§13.1). Reads
 * only the primitive rate fields it recognises; a fixed rate renders as money,
 * a percent rate as `n%`. Anything missing is simply omitted (never guessed).
 */
export function commissionSummary(snapshot: Record<string, unknown> | null): CommissionRow[] {
  if (!snapshot) return [];
  const rows: CommissionRow[] = [];
  const platform = readSnapshotAmount(snapshot, 'platformRate');
  if (platform !== null) rows.push({ label: 'Nền tảng', value: `${platform}%` });

  const tenantRate = readSnapshotAmount(snapshot, 'tenantRate');
  if (tenantRate !== null) {
    rows.push({
      label: 'Tenant',
      value: snapshot.tenantRateType === 'fixed' ? <Money value={tenantRate} /> : `${tenantRate}%`,
    });
  }

  const affiliateRate = readSnapshotAmount(snapshot, 'affiliateRate');
  if (affiliateRate !== null) {
    rows.push({
      label: 'CTV',
      value:
        snapshot.affiliateRateType === 'fixed' ? (
          <Money value={affiliateRate} />
        ) : (
          `${affiliateRate}%`
        ),
    });
  }
  return rows;
}

/** Read a snapshot key as a non-empty numeric/string amount, else `null`. */
function readSnapshotAmount(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}
