import type { RefundHistoryItem } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ArrowUpRight, CircleAlert } from 'lucide-react';
import { Form, Link, useNavigation } from 'react-router';
import { dashboardPaths } from '~/constants/paths';
import { formatDateTime, formatVnd } from '~/lib/format';

const STATUS_LABEL: Record<RefundHistoryItem['status'], string> = {
  pending: 'Đang xử lý',
  manual_required: 'Cần chuyển thủ công',
  succeeded: 'Đã hoàn',
  failed: 'Thất bại',
};

export function RefundsPanel({
  refunds,
  canManage,
  error,
}: {
  refunds: RefundHistoryItem[];
  canManage: boolean;
  error: string | null;
}) {
  const navigation = useNavigation();
  if (!error && refunds.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hoàn tiền khách hàng</CardTitle>
        <p className="text-sm text-muted-foreground">
          Giao dịch thẻ đủ điều kiện có thể được hoàn tự động. Các khoản còn lại cần chuyển thủ công
          và lưu mã tham chiếu ngân hàng.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert className="size-4" /> {error}
          </p>
        ) : null}
        {refunds.map((refund) => {
          const submitting =
            navigation.state === 'submitting' && navigation.formData?.get('refundId') === refund.id;
          return (
            <div key={refund.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    to={dashboardPaths.tenant.booking(refund.bookingId)}
                    className="inline-flex items-center gap-1 font-mono text-sm font-medium text-primary hover:underline"
                  >
                    {refund.bookingCode} <ArrowUpRight className="size-3.5" />
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {refund.reason ?? 'Hoàn tiền'} · {formatDateTime(refund.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {refund.executionMode === 'automatic'
                      ? 'Tự động qua cổng thanh toán'
                      : 'Xử lý thủ công'}
                    {refund.dueAt && refund.status === 'manual_required'
                      ? ` · hạn ${formatDateTime(refund.dueAt)}`
                      : ''}
                  </p>
                  {!refund.affectsBookingStatus ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Khoản hoàn này không kết thúc trạng thái dịch vụ của booking.
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatVnd(refund.amount)}</p>
                  <Badge variant={refund.status === 'failed' ? 'destructive' : 'secondary'}>
                    {STATUS_LABEL[refund.status]}
                  </Badge>
                </div>
              </div>

              {refund.status === 'manual_required' && canManage ? (
                <Form method="post" className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
                  <input type="hidden" name="intent" value="confirm-refund" />
                  <input type="hidden" name="refundId" value={refund.id} />
                  <div className="space-y-1.5">
                    <Label htmlFor={`refund-reference-${refund.id}`}>Mã tham chiếu ngân hàng</Label>
                    <Input
                      id={`refund-reference-${refund.id}`}
                      name="reference"
                      required
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`refund-evidence-${refund.id}`}>Khóa bằng chứng</Label>
                    <Input
                      id={`refund-evidence-${refund.id}`}
                      name="evidenceKey"
                      maxLength={500}
                      placeholder="refunds/... hoặc URL nội bộ"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor={`refund-note-${refund.id}`}>Ghi chú</Label>
                    <Textarea
                      id={`refund-note-${refund.id}`}
                      name="note"
                      maxLength={500}
                      rows={2}
                    />
                  </div>
                  <div className="md:col-span-2 md:text-right">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Đang xác nhận…' : 'Xác nhận đã chuyển hoàn'}
                    </Button>
                  </div>
                </Form>
              ) : refund.reference ? (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  Mã tham chiếu:{' '}
                  <span className="font-mono text-foreground">{refund.reference}</span>
                </p>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
