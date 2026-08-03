import type { SubscriptionStatusResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { CalendarClock, CircleCheck } from 'lucide-react';
import { SUB_PHASE_LABEL } from '~/constants/tenancy';
import { formatDaysLeft, formatNumber } from '~/lib/format';
import { BarRow } from '~/components/stat-card';

/** Subscription phase + soft booking-quota snapshot (§6.5). The escalation banners live in the layout. */
export function SubscriptionStatusCard({ sub }: { sub: SubscriptionStatusResponse }) {
  const { phase, daysUntilExpiry, bookingQuota } = sub;
  const phaseTone = phase === 'active' ? 'text-success' : 'text-warning';
  const quotaPct =
    bookingQuota && bookingQuota.limit > 0
      ? Math.min(100, Math.round((bookingQuota.used / bookingQuota.limit) * 100))
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {phase === 'active' ? (
            <CircleCheck className="size-4 text-success" />
          ) : (
            <CalendarClock className="size-4 text-warning" />
          )}
          Gói dịch vụ
        </CardTitle>
        <CardDescription>Trạng thái đăng ký & hạn mức tháng này</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Tình trạng</span>
          <span className={`font-medium ${phaseTone}`}>{SUB_PHASE_LABEL[phase]}</span>
        </div>
        {phase === 'active' && daysUntilExpiry >= 0 ? (
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Hạn gia hạn</span>
            <span className="font-medium tabular-nums">{formatDaysLeft(daysUntilExpiry)}</span>
          </div>
        ) : null}
        {bookingQuota ? (
          <BarRow
            label="Hạn mức đặt chỗ"
            value={bookingQuota.used}
            max={Math.max(bookingQuota.limit, bookingQuota.used, 1)}
            display={`${formatNumber(bookingQuota.used)} / ${formatNumber(bookingQuota.limit)}`}
            tone={bookingQuota.overLimit ? 'rose' : 'primary'}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Chưa có gói dịch vụ đang hoạt động.</p>
        )}
        {quotaPct !== null && !bookingQuota?.overLimit && quotaPct >= 80 ? (
          <p className="text-xs text-warning">Đã dùng {quotaPct}% hạn mức — cân nhắc nâng cấp gói.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
