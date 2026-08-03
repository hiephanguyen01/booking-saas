import { Link } from 'react-router';
import type { BookingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { ArrowUpRight } from 'lucide-react';
import { formatDateTime, formatVnd } from '~/lib/format';
import { BookingStatusBadge } from '~/components/status-badge';
import { EmptyLine } from './empty-line';
import { dashboardPaths } from '~/constants/paths';

/** The overview's "recent bookings" feed — the 6 newest orders tenant-wide. */
export function RecentBookingsCard({
  bookings,
  canView,
  className,
}: {
  bookings: BookingResponse[] | null;
  canView: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Đặt chỗ gần đây</CardTitle>
          <CardDescription>6 đơn mới nhất trên toàn hệ thống</CardDescription>
        </div>
        {canView ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={dashboardPaths.tenant.bookings}>
              Tất cả <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!canView ? (
          <EmptyLine text="Bạn không có quyền xem đặt chỗ." />
        ) : bookings && bookings.length > 0 ? (
          <ul className="divide-y">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{b.code}</span>
                    <BookingStatusBadge status={b.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatVnd(b.finalAmount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyLine text="Chưa có đặt chỗ nào." />
        )}
      </CardContent>
    </Card>
  );
}
