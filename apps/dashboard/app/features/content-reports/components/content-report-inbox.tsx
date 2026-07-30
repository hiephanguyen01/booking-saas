import type {
  ContentReportListResponse,
  ContentReportReason,
  ContentReportResponse,
  ContentReportStatus,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Link, useSearchParams } from 'react-router';
import { ErrorBanner } from '~/components/action-feedback';
import { DashboardDataTable } from '~/components/dashboard-data-table';
import { PageHeader } from '~/components/page-header';
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

  const columns: DataTableColumn<ContentReportResponse>[] = [
    {
      header: 'Nội dung bị báo cáo',
      cell: (report) => (
        <div className="min-w-0 max-w-64">
          <Link
            to={dashboardPaths.tenant.contentReport(report.id)}
            className="block truncate font-medium text-primary hover:underline"
          >
            {report.targetTitle}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{report.partnerName}</p>
        </div>
      ),
    },
    {
      header: 'Lý do',
      cell: (report) => <Badge variant="outline">{reasonLabels[report.reason]}</Badge>,
    },
    {
      header: 'Người báo cáo',
      className: 'hidden sm:table-cell',
      headClassName: 'hidden sm:table-cell',
      cell: (report) => <span className="truncate">{report.reporterName}</span>,
    },
    {
      header: 'Chi tiết',
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
      cell: (report) =>
        report.details ? (
          <p className="line-clamp-2 max-w-80 text-muted-foreground">{report.details}</p>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { header: 'Trạng thái', cell: (report) => <StatusBadge status={report.status} /> },
    {
      header: 'Thời điểm',
      className: 'hidden whitespace-nowrap text-muted-foreground md:table-cell',
      headClassName: 'hidden md:table-cell',
      cell: (report) => formatDateTime(report.createdAt),
    },
  ];

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
      <DashboardDataTable
        columns={columns}
        data={result?.items ?? []}
        getRowKey={(report) => report.id}
        filters={CONTENT_REPORT_FILTER_SPEC}
        filterValues={filters}
        resetHref={dashboardPaths.tenant.contentReports}
        pageSize={list.pageSize}
        showTable={result !== null}
        emptyMessage="Chưa có báo cáo phù hợp bộ lọc."
        pagination={
          result
            ? {
                page: result.page,
                pageSize: result.pageSize,
                total: result.total,
                hrefFor: ({ page, pageSize }) => {
                  const next = new URLSearchParams(searchParams);
                  next.set('page', String(page));
                  next.set('pageSize', String(pageSize));
                  return `?${next}`;
                },
              }
            : undefined
        }
      />
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
