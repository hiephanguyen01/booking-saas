import type { ReviewListResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { NativeSelect } from '@booking/ui/components/ui/native-select';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { MessageSquareText, Star } from 'lucide-react';
import { Form, useNavigation, useSearchParams } from 'react-router';
import { ErrorBanner } from '~/components/action-feedback';
import { PageHeader } from '~/components/page-header';
import { PaginationBar } from '~/components/pagination-bar';
import { formatDateTime } from '~/lib/format';

export function ReviewInbox({
  title,
  description,
  result,
  error,
  actionError,
  canReply = false,
}: {
  title: string;
  description: string;
  result: ReviewListResponse | null;
  error: string | null;
  actionError?: string | null;
  canReply?: boolean;
}) {
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const items = result?.items ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <ErrorBanner error={error ?? actionError ?? null} />
      {result ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Điểm trung bình" value={result.summary.ratingAvg?.toFixed(1) ?? '-'} />
          <Metric label="Tổng đánh giá" value={String(result.summary.reviewCount)} />
          <Metric label="Chưa phản hồi" value={String(result.summary.unansweredCount)} />
        </div>
      ) : null}
      <Form method="get" className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <Input
          name="q"
          defaultValue={searchParams.get('q') ?? ''}
          placeholder="Khách hàng, booking, dịch vụ..."
          className="min-w-64"
        />
        <NativeSelect
          name="responseStatus"
          defaultValue={searchParams.get('responseStatus') ?? 'all'}
          aria-label="Trạng thái phản hồi"
        >
          <option value="all">Tất cả phản hồi</option>
          <option value="pending">Chưa phản hồi</option>
          <option value="responded">Đã phản hồi</option>
        </NativeSelect>
        <NativeSelect
          name="rating"
          defaultValue={searchParams.get('rating') ?? ''}
          aria-label="Số sao"
        >
          <option value="">Tất cả số sao</option>
          {[5, 4, 3, 2, 1].map((rating) => (
            <option key={rating} value={rating}>
              {rating} sao
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Lọc
        </Button>
      </Form>
      {items.length ? (
        <div className="space-y-4">
          {items.map((review) => {
            const submitting =
              navigation.state === 'submitting' &&
              navigation.formData?.get('reviewId') === review.id;
            return (
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
                    <Form method="post" className="space-y-3 border-t pt-4">
                      <input type="hidden" name="reviewId" value={review.id} />
                      <Textarea
                        name="content"
                        required
                        minLength={10}
                        maxLength={2000}
                        rows={3}
                        placeholder="Cảm ơn khách hàng và phản hồi cụ thể về trải nghiệm..."
                      />
                      <div className="flex justify-end">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                        </Button>
                      </div>
                    </Form>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
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
