import { useFetcher } from 'react-router';
import { Check, Circle, EyeOff, Info, Lock, RotateCcw, Send } from 'lucide-react';
import type { ChecklistItem, ListingResponse, PublishStatus } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

type LifecycleActionResult = { ok: boolean; error: string | null };

const STATUS_COPY: Record<PublishStatus, { title: string; description: string }> = {
  draft: {
    title: 'Bản nháp chưa gửi duyệt',
    description: 'Hoàn tất checklist rồi gửi tenant duyệt để bắt đầu hiển thị.',
  },
  pending_review: {
    title: 'Tin đăng đang chờ duyệt',
    description: 'Tenant đang xem xét nội dung. Bạn vẫn có thể sửa và cập nhật bản đang chờ.',
  },
  published: {
    title: 'Tin đăng đang hiển thị',
    description: 'Khách hàng có thể tìm thấy và đặt tin này trên storefront.',
  },
  archived: {
    title: 'Tin đăng đang được ẩn',
    description: 'Tin không còn hiển thị với khách hàng. Bạn có thể chỉnh sửa trước khi đăng lại.',
  },
};

export function ListingLifecycleCard({
  listing,
  checklist,
  ready,
  canWrite,
  canPublish,
}: {
  listing: ListingResponse;
  checklist: ChecklistItem[];
  ready: boolean;
  canWrite: boolean;
  canPublish: boolean;
}) {
  const fetcher = useFetcher<LifecycleActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const adminLocked = listing.status === 'archived' && listing.hiddenBy === 'admin';
  const copy = STATUS_COPY[listing.status];
  const submit = (intent: 'submit' | 'hide' | 'republish'): void => {
    run(() => fetcher.submit({ intent }, { method: 'post' }));
  };

  return (
    <Alert className="rounded-2xl bg-card">
      {adminLocked ? <Lock /> : <Info />}
      <AlertTitle>{adminLocked ? 'Tin đăng bị quản trị viên ẩn' : copy.title}</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>
          {adminLocked
            ? 'Bạn vẫn có thể chỉnh sửa nội dung, nhưng chỉ quản trị viên mới có thể bỏ ẩn tin đăng.'
            : copy.description}
        </p>

        {listing.status === 'draft' ? (
          <div className="grid gap-2 sm:grid-cols-2" aria-label="Kiểm tra trước khi gửi duyệt">
            {checklist.map((item) => {
              const Icon = item.passed ? Check : Circle;
              return (
                <div
                  key={item.key}
                  className={cn(
                    'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
                    item.passed
                      ? 'border-success/30 bg-success/5 text-foreground'
                      : 'border-border bg-muted/30 text-muted-foreground',
                  )}
                >
                  <Icon
                    className={cn('mt-0.5 size-4 shrink-0', item.passed && 'text-success')}
                    aria-hidden
                  />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2" aria-busy={busy}>
          {listing.status === 'draft' && canWrite ? (
            <Button disabled={!ready || busy} onClick={() => submit('submit')}>
              <Send /> Gửi duyệt
            </Button>
          ) : null}
          {listing.status === 'published' && canPublish ? (
            <Button variant="outline" disabled={busy} onClick={() => submit('hide')}>
              <EyeOff /> Ẩn tin đăng
            </Button>
          ) : null}
          {listing.status === 'archived' && canPublish && !adminLocked ? (
            <Button variant="outline" disabled={busy} onClick={() => submit('republish')}>
              <RotateCcw /> Đăng lại
            </Button>
          ) : null}
          {listing.status === 'draft' && !ready ? (
            <p className="text-xs text-muted-foreground">
              Hoàn tất các mục còn thiếu để mở thao tác gửi duyệt.
            </p>
          ) : null}
          {!canWrite && listing.status === 'draft' ? (
            <p className="text-xs text-muted-foreground">Bạn không có quyền gửi duyệt tin này.</p>
          ) : null}
          {!canPublish && ['published', 'archived'].includes(listing.status) ? (
            <p className="text-xs text-muted-foreground">
              Bạn không có quyền thay đổi trạng thái hiển thị của tin này.
            </p>
          ) : null}
          {fetcher.data?.error ? (
            <p className="basis-full text-sm text-destructive" role="alert">
              {fetcher.data.error}
            </p>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
