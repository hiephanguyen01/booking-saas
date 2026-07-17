import type { TenantFinanceSummaryResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { formatVnd } from '~/lib/format';
import { BarRow } from '~/components/stat-card';
import { EmptyLine } from './empty-line';

/** Outstanding payables (partner / affiliate / platform fee) as proportion bars. */
export function PayablesCard({ summary }: { summary: TenantFinanceSummaryResponse }) {
  const payables = [
    { label: 'Trả đối tác', value: Number(summary.partnerPayable), tone: 'emerald' as const },
    { label: 'Trả affiliate', value: Number(summary.affiliatePayable), tone: 'sky' as const },
    { label: 'Phí nền tảng', value: Number(summary.platformFeePayable), tone: 'warning' as const },
  ];
  const payMax = payables.reduce((m, p) => Math.max(m, Math.abs(p.value)), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Công nợ phải trả</CardTitle>
        <CardDescription>Số dư đang chờ chi trả</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {payMax === 0 ? (
          <EmptyLine text="Chưa phát sinh công nợ." />
        ) : (
          payables.map((p) => (
            <BarRow
              key={p.label}
              label={p.label}
              value={p.value}
              max={payMax}
              display={formatVnd(p.value)}
              tone={p.tone}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
