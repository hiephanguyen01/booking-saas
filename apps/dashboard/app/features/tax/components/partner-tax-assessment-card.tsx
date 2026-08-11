import type { PartnerTaxAssessmentResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Progress } from '@booking/ui/components/ui/progress';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';

const STATUS_LABEL: Record<PartnerTaxAssessmentResponse['status'], string> = {
  missing_declaration: 'Chờ khai doanh thu ngoài BookingOS',
  below_threshold: 'Dưới ngưỡng',
  exceeded: 'Đã vượt ngưỡng',
  manual_review: 'Cần rà soát',
};

export function PartnerTaxAssessmentCard({
  assessment,
  canDeclare,
}: {
  assessment: PartnerTaxAssessmentResponse;
  canDeclare: boolean;
}) {
  const total = BigInt(assessment.totalRevenue);
  const threshold = BigInt(assessment.thresholdAmount);
  const progress = threshold > 0n ? Number((total * 100n) / threshold) : 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Ngưỡng doanh thu {assessment.taxYear}</CardTitle>
            <CardDescription>
              Hệ thống cộng doanh thu đã ghi nhận trên BookingOS với doanh thu ngoài nền tảng được
              khai gần nhất.
            </CardDescription>
          </div>
          <Badge variant={assessment.status === 'exceeded' ? 'destructive' : 'secondary'}>
            {STATUS_LABEL[assessment.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Tổng doanh thu đã biết</span>
            <span className="font-semibold tabular-nums">
              <Money value={assessment.totalRevenue} /> /{' '}
              <Money value={assessment.thresholdAmount} />
            </span>
          </div>
          <Progress value={Math.min(progress, 100)} />
          <p className="text-xs text-muted-foreground">
            Căn cứ {assessment.legalRef}, bản quy tắc {assessment.thresholdRevision}.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="BookingOS" value={assessment.platformRevenue} />
          <Metric label="Ngoài BookingOS" value={assessment.externalRevenue} />
          <Metric label="Còn đến ngưỡng" value={assessment.remainingAmount} />
        </div>

        {assessment.crossedAt ? (
          <p className="text-sm text-muted-foreground">
            Vượt ngưỡng trong quý {assessment.crossedQuarter}; ghi nhận{' '}
            <DateTimeValue iso={assessment.crossedAt} />.
          </p>
        ) : null}

        {assessment.manualOverrideStatus ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
            Đang áp dụng điều chỉnh thủ công đến{' '}
            {assessment.manualOverrideUntil ? (
              <DateTimeValue iso={assessment.manualOverrideUntil} />
            ) : (
              'cuối năm'
            )}
            {assessment.manualOverrideReason ? ` — ${assessment.manualOverrideReason}` : null}
          </div>
        ) : null}

        {canDeclare ? (
          <form method="post" className="space-y-3 border-t pt-4">
            <input type="hidden" name="intent" value="declare-tax-revenue" />
            <input type="hidden" name="taxYear" value={assessment.taxYear} />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="external-tax-revenue">Doanh thu ngoài BookingOS (đồng)</Label>
                <Input
                  id="external-tax-revenue"
                  name="externalRevenue"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  defaultValue={assessment.externalRevenue}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="external-tax-note">Ghi chú</Label>
                <Input id="external-tax-note" name="note" maxLength={500} />
              </div>
              <Button type="submit">Ghi nhận khai báo</Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Khai số lũy kế từ đầu năm, không gồm doanh thu BookingOS. Lần khai mới thay thế số
              ngoài nền tảng đang dùng; lịch sử cũ vẫn được lưu để đối soát.
            </p>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">
        <Money value={value} />
      </p>
    </div>
  );
}
