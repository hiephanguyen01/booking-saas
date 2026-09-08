import type { PlatformHealthManualRefunds } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { formatNumber } from '~/lib/format';

export function ManualRefundHealthCard({
  manualRefunds,
}: {
  manualRefunds: PlatformHealthManualRefunds;
}) {
  const mr = manualRefunds;
  const isCritical = mr.severity === 'critical';
  const isWarning = mr.severity === 'warning';

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Sức khoẻ Manual Refund V2</CardTitle>
          </div>
          <Badge
            variant={
              isCritical ? 'destructive' : isWarning ? 'outline' : 'success'
            }
          >
            {isCritical
              ? 'Nguy cơ cao (Critical)'
              : isWarning
                ? 'Cần chú ý (Warning)'
                : 'Bình thường (Healthy)'}
          </Badge>
        </div>
        <CardDescription>
          Tín hiệu vận hành toàn nền tảng: tiến độ xử lý hồ sơ, tỷ lệ quá hạn, báo cáo chưa nhận
          tiền và thao tác giải mã PII.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-3 space-y-1">
            <span className="text-xs text-muted-foreground">Tenant triển khai</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(mr.enabledTenants)}
            </div>
            <p className="text-xs text-muted-foreground">
              {mr.pausedTenants > 0
                ? `${formatNumber(mr.pausedTenants)} tenant đang tạm dừng`
                : 'Tất cả đang hoạt động'}
            </p>
          </div>

          <div className="rounded-lg border bg-card p-3 space-y-1">
            <span className="text-xs text-muted-foreground">Hàng đợi hồ sơ</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(mr.openOperations)} đang mở
            </div>
            <p className="text-xs text-muted-foreground">
              {mr.overdueOperations > 0 ? (
                <span className="text-destructive font-medium">
                  {formatNumber(mr.overdueOperations)} quá hạn SLA
                </span>
              ) : (
                'Không có hồ sơ quá hạn'
              )}
            </p>
          </div>

          <div className="rounded-lg border bg-card p-3 space-y-1">
            <span className="text-xs text-muted-foreground">Chờ checker duyệt</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(mr.awaitingApproval)}
            </div>
            <p className="text-xs text-muted-foreground">
              Hồ sơ đã chuyển tiền, chờ xác nhận
            </p>
          </div>

          <div className="rounded-lg border bg-card p-3 space-y-1">
            <span className="text-xs text-muted-foreground">Hồ sơ cũ nhất</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(mr.oldestOpenMinutes)} phút
            </div>
            <p className="text-xs text-muted-foreground">
              Thời gian từ khi tạo hồ sơ chưa xong
            </p>
          </div>

          <div className="rounded-lg border bg-card p-3 space-y-1">
            <span className="text-xs text-muted-foreground">Khách báo chưa nhận</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(mr.customerNotReceived)}
            </div>
            <p className="text-xs text-muted-foreground">
              {mr.customerNotReceived > 0 ? (
                <span className="text-destructive font-medium">Cần rà soát đối soát ngay</span>
              ) : (
                'Không có phản ánh'
              )}
            </p>
          </div>

          <div className="rounded-lg border bg-card p-3 space-y-1">
            <span className="text-xs text-muted-foreground">Xem chi tiết PII (24h)</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(mr.reveals24h)}
            </div>
            <p className="text-xs text-muted-foreground">Lượt giải mã số tài khoản</p>
          </div>

          <div className="rounded-lg border bg-card p-3 space-y-1">
            <span className="text-xs text-muted-foreground">Break-glass (30 ngày)</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(mr.breakGlass30d)}
            </div>
            <p className="text-xs text-muted-foreground">Lượt duyệt khẩn cấp nền tảng</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
