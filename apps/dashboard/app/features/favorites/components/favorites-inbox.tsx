import type { FavoriteListResponse, FavoriteSummaryResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Heart, Users } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { ListToolbar } from '~/components/list-toolbar';
import { BarRow, StatCard } from '~/components/stat-card';
import { readListParams } from '~/lib/pagination';
import { formatDateTime } from '~/lib/format';
import { FAVORITE_FILTER_SPEC } from '../lib/favorite-filters';

/** Who-favorited list + KPI header, shared by the partner and tenant favorites screens. */
export function FavoritesInbox({
  title,
  description,
  result,
  summary,
  error,
  filters,
  resetHref,
}: {
  title: string;
  description: string;
  result: FavoriteListResponse | null;
  summary: FavoriteSummaryResponse | null;
  error: string | null;
  filters: Record<string, string>;
  resetHref: string;
}) {
  const [searchParams] = useSearchParams();
  const { pageSize } = readListParams(searchParams);
  const items = result?.items ?? [];
  const topMax = summary?.topTargets.reduce((max, t) => Math.max(max, t.count), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <ErrorBanner error={error} />

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Tổng lượt thích"
            value={summary.total.toLocaleString('vi-VN')}
            icon={<Heart className="size-4" />}
          />
          <StatCard
            label="Khách đã thích"
            value={summary.uniqueCustomers.toLocaleString('vi-VN')}
            icon={<Users className="size-4" />}
          />
          <Card className="sm:col-span-2 lg:col-span-1">
            <CardContent className="flex flex-col gap-3 p-5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Được thích nhiều nhất
              </span>
              {summary.topTargets.length ? (
                <div className="space-y-3">
                  {summary.topTargets.slice(0, 4).map((target) => (
                    <BarRow
                      key={`${target.target}:${target.targetId}`}
                      label={target.title}
                      value={target.count}
                      max={topMax}
                      display={String(target.count)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có lượt thích.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <ListToolbar
        spec={FAVORITE_FILTER_SPEC}
        filters={filters}
        resetHref={resetHref}
        pageSize={pageSize}
      />

      {items.length ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Khách hàng</th>
                    <th className="px-5 py-3 font-medium">Đã thích</th>
                    <th className="px-5 py-3 font-medium">Loại</th>
                    <th className="px-5 py-3 font-medium">Thời điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          >
                            {initials(entry.customerName)}
                          </span>
                          <span className="font-medium">{entry.customerName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">{entry.targetTitle}</td>
                      <td className="px-5 py-3">
                        <Badge variant={entry.target === 'group' ? 'secondary' : 'default'}>
                          {entry.target === 'group' ? 'Studio' : 'Dịch vụ'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : !error ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Chưa có lượt thích phù hợp bộ lọc.
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <PaginationBar
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          hrefFor={({ page, pageSize }) => {
            const next = new URLSearchParams(searchParams);
            next.set('page', String(page));
            next.set('pageSize', String(pageSize));
            return `?${next.toString()}`;
          }}
        />
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
