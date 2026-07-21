import type {
  ContentReportListResponse,
  ContentReportReason,
  ContentReportStatus,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Flag, Store, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { ErrorBanner } from '~/components/action-feedback';
import { ListToolbar } from '~/components/list-toolbar';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { StatusFilterTabs } from '~/components/status-filter-tabs';
import { dashboardPaths } from '~/constants/paths';
import { formatDateTime } from '~/lib/format';
import { readListParams } from '~/lib/pagination';
import { CONTENT_REPORT_FILTER_SPEC } from '../lib/content-report-filters';

const statuses = [
  { value: 'all', label: 'Tất cả' },
  { value: 'open', label: 'Mới' },
  { value: 'reviewing', label: 'Đang xem xét' },
  { value: 'resolved', label: 'Đã xử lý' },
  { value: 'dismissed', label: 'Bỏ qua' },
];

const reasonLabels: Record<ContentReportReason, string> = {
  misleading: 'Thông tin sai lệch',
  fraud_or_scam: 'Nghi vấn lừa đảo',
  prohibited_content: 'Nội dung bị cấm',
  contact_or_off_platform: 'Lách nền tảng',
  duplicate_or_spam: 'Trùng lặp / spam',
  other: 'Lý do khác',
};

export function ContentReportInbox({
  result,
  error,
  filters,
}: {
  result: ContentReportListResponse | null;
  error: string | null;
  filters: Record<string, string>;
}) {
  const [searchParams] = useSearchParams();
  const list = readListParams(searchParams);
  const status = searchParams.get('status') ?? 'all';
  const hrefForStatus = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    next.set('page', '1');
    return `?${next}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo nội dung"
        description="Tiếp nhận và xử lý báo cáo vi phạm từ khách hàng trên storefront."
      />
      <ErrorBanner error={error} />
      <StatusFilterTabs
        filters={statuses}
        value={status}
        hrefFor={hrefForStatus}
        counts={result?.counts}
      />
      <ListToolbar
        spec={CONTENT_REPORT_FILTER_SPEC}
        filters={filters}
        resetHref={dashboardPaths.tenant.contentReports}
        pageSize={list.pageSize}
      />
      {result?.items.length ? (
        <div className="space-y-3">
          {result.items.map((report) => (
            <Link
              key={report.id}
              to={dashboardPaths.tenant.contentReport(report.id)}
              className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={report.status} />
                      <Badge variant="outline">{reasonLabels[report.reason]}</Badge>
                    </div>
                    <h2 className="mt-3 truncate font-semibold">{report.targetTitle}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Store className="size-3.5" />
                        {report.partnerName}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3.5" />
                        {report.reporterName}
                      </span>
                      <span>{formatDateTime(report.createdAt)}</span>
                    </div>
                    {report.details ? (
                      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                        {report.details}
                      </p>
                    ) : null}
                  </div>
                  <Flag className="size-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : !error ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Chưa có báo cáo phù hợp bộ lọc.
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
            return `?${next}`;
          }}
        />
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: ContentReportStatus }) {
  const labels = {
    open: 'Mới',
    reviewing: 'Đang xem xét',
    resolved: 'Đã xử lý',
    dismissed: 'Bỏ qua',
  };
  return (
    <Badge
      variant={status === 'open' ? 'destructive' : status === 'reviewing' ? 'default' : 'secondary'}
    >
      {labels[status]}
    </Badge>
  );
}
