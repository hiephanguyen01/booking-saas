import { Link } from 'react-router';
import { CalendarClock } from 'lucide-react';
import type { PlatformHealthResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { formatDate, formatDaysLeft } from '~/lib/format';
import { dashboardPaths } from '~/constants/paths';

/** "Sắp hết hạn" card: subscriptions/trials expiring within the next 14 days. */
export function ExpiringSubscriptionsCard({
  expiring,
}: {
  expiring: PlatformHealthResponse['expiring'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" />
          Sắp hết hạn
        </CardTitle>
        <CardDescription>Gói/dùng thử hết hạn trong 14 ngày tới.</CardDescription>
      </CardHeader>
      <CardContent>
        {expiring.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Không có gói nào sắp hết hạn.
          </p>
        ) : (
          <ul className="divide-y">
            {expiring.map((e) => {
              const tone =
                e.daysLeft <= 3
                  ? 'text-rose-600 dark:text-rose-400'
                  : e.daysLeft <= 7
                    ? 'text-warning'
                    : 'text-muted-foreground';
              return (
                <li key={e.tenantId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={dashboardPaths.admin.tenant(e.tenantId)}
                      className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {e.tenantName}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {e.planName} · {formatDate(e.expiresAt)}
                    </span>
                  </div>
                  <span className={`shrink-0 text-xs font-medium tabular-nums ${tone}`}>
                    {formatDaysLeft(e.daysLeft)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
