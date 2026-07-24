import type { FormEvent } from 'react';
import type { ReviewListResponse } from '@booking/contracts';
import type { MediaViewerLabels } from '@booking/ui/components/media/media-viewer-dialog';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ReviewMediaGallery } from '@booking/ui/components/review/review-media-gallery';
import { MessageSquareText, Star } from 'lucide-react';
import { Form, useNavigation, useSearchParams, useSubmit } from 'react-router';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { ListToolbar } from '~/components/list-toolbar';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { readListParams } from '~/lib/pagination';
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <div className="space-y-6" aria-busy={busy}>
      <PageHeader title={title} description={description} />
      <ErrorBanner error={error ?? actionError ?? null} />
      {result ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Điểm trung bình" value={result.summary.ratingAvg?.toFixed(1) ?? '-'} />
          <Metric label="Tổng đánh giá" value={String(result.summary.reviewCount)} />
          <Metric label="Chưa phản hồi" value={String(result.summary.unansweredCount)} />
        </div>
      ) : null}
      <ListToolbar
        spec={REVIEW_FILTER_SPEC}
        filters={filters}
        resetHref={resetHref}
        pageSize={pageSize}
      />
      {items.length ? (
        <div className="space-y-4">
          {items.map((review) => (
            <Card key={review.id}>
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{review.listingTitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {review.partnerName} · {review.bookingCode} ·{' '}
                      {formatDateTime(review.createdAt)}
                    </p>
                  </div>
                  <Badge variant={review.reply ? 'secondary' : 'default'}>
                    {review.reply ? 'Đã phản hồi' : 'Chờ phản hồi'}
                  </Badge>
                </div>
                <div className="flex gap-1 text-amber-500">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="size-4"
                      fill={star <= review.rating ? 'currentColor' : 'none'}
                    />
                  ))}
                </div>
                <div>
                  <p className="text-sm font-medium">{review.customerName}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{review.content}</p>
                  <ReviewMediaGallery
                    items={review.media}
                    className="mt-3"
                    viewLabel="Xem nội dung đính kèm"
                    viewerTitle="Ảnh và video đánh giá"
                    viewerLabels={MEDIA_VIEWER_LABELS}
                  />
                </div>
                {review.reply ? (
                  <div className="rounded-lg bg-muted/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquareText className="size-4" />
                      Phản hồi của {review.reply.partnerName}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {review.reply.content}
                    </p>
                  </div>
                ) : canReply ? (
                  <Form method="post" className="space-y-3 border-t pt-4" onSubmit={handleSubmit}>
                    <input type="hidden" name="reviewId" value={review.id} />
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
                  </Form>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !error ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Chưa có đánh giá phù hợp bộ lọc.
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
