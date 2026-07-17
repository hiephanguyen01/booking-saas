import type { OwnerBalanceResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { formatVnd } from '~/lib/format';
import { BarRow } from '~/components/stat-card';

/**
 * The two owed-balance cards (partners + affiliates), scaled against one shared
 * max so the bars are visually comparable across the pair.
 */
export function BalanceCards({
  partnerBalances,
  affiliateBalances,
  partnerNames,
}: {
  partnerBalances: OwnerBalanceResponse[];
  affiliateBalances: OwnerBalanceResponse[];
  partnerNames: Record<string, string>;
}) {
  const balMax = [...partnerBalances, ...affiliateBalances].reduce(
    (m, b) => Math.max(m, Math.abs(Number(b.balance))),
    0,
  );
  const label = (b: OwnerBalanceResponse): string =>
    (b.ownerId && partnerNames[b.ownerId]) || (b.ownerId ? b.ownerId.slice(0, 8) : b.ownerType);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <BalanceCard
        title="Đối tác"
        description="Số dư đang nợ mỗi đối tác"
        balances={partnerBalances}
        max={balMax}
        label={label}
        tone="emerald"
      />
      <BalanceCard
        title="Affiliate"
        description="Hoa hồng phải trả cho affiliate"
        balances={affiliateBalances}
        max={balMax}
        label={label}
        tone="sky"
      />
    </div>
  );
}

function BalanceCard({
  title,
  description,
  balances,
  max,
  label,
  tone,
}: {
  title: string;
  description: string;
  balances: OwnerBalanceResponse[];
  max: number;
  label: (b: OwnerBalanceResponse) => string;
  tone: 'emerald' | 'sky';
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {balances.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Chưa phát sinh công nợ.</p>
        ) : (
          balances.map((b) => (
            <BarRow
              key={`${b.ownerType}-${b.ownerId}`}
              label={label(b)}
              value={Number(b.balance)}
              max={max}
              display={formatVnd(b.balance)}
              tone={tone}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
