import { useState, type FormEvent } from 'react';
import type { ReviewListResponse, ReviewResponse } from '@booking/contracts';
import type { MediaViewerLabels } from '@booking/ui/components/media/media-viewer-dialog';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@booking/ui/components/ui/dialog';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { DataTable, type DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { ReviewMediaGallery } from '@booking/ui/components/review/review-media-gallery';
import { Clock, Images, MessageSquareText, Star } from 'lucide-react';
import { useNavigation, useSearchParams, useSubmit } from 'react-router';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { ListToolbar } from '~/components/list-toolbar';
import { StatCard } from '~/components/stat-card';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { readListParams } from '~/lib/pagination';
import { hasActiveFilters } from '~/lib/list-filters';
import { formatDateTime } from '~/lib/format';
import { REVIEW_FILTER_SPEC } from '../lib/review-filters';

const MEDIA_VIEWER_LABELS: MediaViewerLabels = {
  close: 'Đóng trình xem',
  previous: 'Nội dung trước',
  next: 'Nội dung tiếp theo',
  zoomIn: 'Phóng to',
  zoomOut: 'Thu nhỏ',
  resetZoom: 'Đặt lại thu phóng',
  mediaError: 'Không thể tải nội dung này.',
  video: 'Video',
  item: (index) => `Xem nội dung ${index}`,
  counter: (current, total) => `${current}/${total}`,
};

/**
 * Review list + KPI header shared by the admin/tenant/partner review screens.
 * The list is a table (same surface as every other dashboard list); the review
 * body, media and the partner reply form live in a per-row detail dialog.
 */
export function ReviewInbox({
  title,
  description,
  result,
  error,
  filters,
  resetHref,
  actionError,
  canReply = false,
}: {
  title: string;
  description: string;
  result: ReviewListResponse | null;
  error: string | null;
  filters: Record<string, string>;
  resetHref: string;
  actionError?: string | null;
  canReply?: boolean;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  const [searchParams] = useSearchParams();
  const { pageSize } = readListParams(searchParams);
  const items = result?.items ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((review) => review.id === activeId) ?? null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setActiveId(null);
    run(() => submit(formData, { method: 'post' }));
  };

  const columns: DataTableColumn<ReviewResponse>[] = [
    {
      header: 'Dịch vụ',
      cell: (review) => (
        <div className="min-w-0 max-w-56">
          <p className="truncate font-medium">{review.listingTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{review.partnerName}</p>
        </div>
      ),
    },
    {
      header: 'Khách hàng',
      cell: (review) => (
        <div className="min-w-0 max-w-44">
          <p className="truncate">{review.customerName}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{review.bookingCode}</p>
        </div>
      ),
    },
    { header: 'Số sao', cell: (review) => <RatingStars rating={review.rating} /> },
    {
      header: 'Nội dung',
      className: 'hidden lg:table-cell',
      headClassName: 'hidden lg:table-cell',
      cell: (review) => (
        <div className="max-w-80 space-y-1">
          <p className="line-clamp-2 text-muted-foreground">{review.content}</p>
          {review.media.length ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Images className="size-3.5" aria-hidden />
              {review.media.length} tệp đính kèm
            </p>
          ) : null}
        </div>
      ),
    },
    {
      header: 'Phản hồi',
      cell: (review) => (
        <Badge variant={review.reply ? 'secondary' : 'default'}>
          {review.reply ? 'Đã phản hồi' : 'Chờ phản hồi'}
        </Badge>
      ),
    },
    {
      header: 'Thời điểm',
      className: 'hidden whitespace-nowrap text-muted-foreground md:table-cell',
      headClassName: 'hidden md:table-cell',
      cell: (review) => formatDateTime(review.createdAt),
    },
    {
      header: <span className="sr-only">Hành động</span>,
      headClassName: 'w-0',
      className: 'text-right',
      cell: (review) => (
        <Button variant="ghost" size="sm" onClick={() => setActiveId(review.id)}>
          {canReply && !review.reply ? 'Phản hồi' : 'Chi tiết'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6" aria-busy={busy}>
      <PageHeader title={title} description={description} />
      <ErrorBanner error={error ?? actionError ?? null} />

      {result ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Điểm trung bình"
            value={result.summary.ratingAvg?.toFixed(1) ?? '—'}
            icon={<Star className="size-4" />}
          />
          <StatCard
            label="Tổng đánh giá"
            value={result.summary.reviewCount.toLocaleString('vi-VN')}
            icon={<MessageSquareText className="size-4" />}
          />
          <StatCard
            label="Chưa phản hồi"
            value={result.summary.unansweredCount.toLocaleString('vi-VN')}
            tone={result.summary.unansweredCount > 0 ? 'warning' : 'muted'}
            icon={<Clock className="size-4" />}
          />
        </div>
      ) : null}

      <ListToolbar
        spec={REVIEW_FILTER_SPEC}
        filters={filters}
        resetHref={resetHref}
        pageSize={pageSize}
      />

      {result ? (
        <>
          <DataTable
            columns={columns}
            data={items}
            getRowKey={(review) => review.id}
            emptyMessage={
              hasActiveFilters(filters)
                ? 'Không có đánh giá nào khớp bộ lọc.'
                : 'Chưa có đánh giá nào.'
            }
          />
          <PaginationBar
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            hrefFor={({ page, pageSize: size }) => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(page));
              next.set('pageSize', String(size));
              return `?${next.toString()}`;
            }}
          />
        </>
      ) : null}

      <Dialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.listingTitle}</DialogTitle>
                <DialogDescription>
                  {active.partnerName} · {active.bookingCode} · {formatDateTime(active.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <RatingStars rating={active.rating} />
                  <Badge variant={active.reply ? 'secondary' : 'default'}>
                    {active.reply ? 'Đã phản hồi' : 'Chờ phản hồi'}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium">{active.customerName}</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                    {active.content}
                  </p>
                  <ReviewMediaGallery
                    items={active.media}
                    className="mt-3"
                    viewLabel="Xem nội dung đính kèm"
                    viewerTitle="Ảnh và video đánh giá"
                    viewerLabels={MEDIA_VIEWER_LABELS}
                  />
                </div>
                {active.reply ? (
                  <div className="rounded-lg bg-muted/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquareText className="size-4" />
                      Phản hồi của {active.reply.partnerName}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {active.reply.content}
                    </p>
                  </div>
                ) : canReply ? (
                  <form method="post" className="space-y-3 border-t pt-4" onSubmit={handleSubmit}>
                    <input type="hidden" name="reviewId" value={active.id} />
                    <Textarea
                      name="content"
                      required
                      minLength={10}
                      maxLength={2000}
                      rows={3}
                      placeholder="Cảm ơn khách hàng và phản hồi cụ thể về trải nghiệm..."
                      disabled={busy}
                    />
                    <div className="flex justify-end">
                      <Button type="submit" disabled={busy}>
                        {busy ? 'Đang gửi...' : 'Gửi phản hồi'}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5 text-amber-500" aria-label={`${rating}/5 sao`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className="size-3.5"
          fill={star <= rating ? 'currentColor' : 'none'}
          aria-hidden
        />
      ))}
    </span>
  );
}
