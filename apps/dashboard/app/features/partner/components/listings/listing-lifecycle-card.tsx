import { useFetcher } from 'react-router';
import {
  Check,
  CheckCircle2,
  Circle,
  EyeOff,
  FileClock,
  Info,
  LoaderCircle,
  Lock,
  RotateCcw,
  Send,
} from 'lucide-react';
import type { ChecklistItem, ListingResponse, PublishStatus } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';

type LifecycleActionResult = { ok: boolean; error: string | null };

const STATUS_COPY: Record<PublishStatus, { title: string; description: string }> = {
  draft: {
    title: 'Bản nháp chưa gửi duyệt',
    description: 'Hoàn tất danh sách kiểm tra rồi gửi duyệt để bắt đầu hiển thị.',
  },
  pending_review: {
    title: 'Tin đăng đang chờ duyệt',
    description:
      'Đơn vị quản lý đang xem xét nội dung. Bạn vẫn có thể sửa và cập nhật bản đang chờ.',
  },
  published: {
    title: 'Tin đăng đang hiển thị',
    description: 'Khách hàng có thể tìm thấy và đặt lịch từ tin đăng này.',
  },
  archived: {
    title: 'Tin đăng đang được ẩn',
    description: 'Tin không còn hiển thị với khách hàng. Bạn có thể chỉnh sửa trước khi đăng lại.',
  },
};

const STATUS_SURFACE: Record<PublishStatus, string> = {
  draft: 'border-border bg-muted/20 [&>svg]:text-muted-foreground',
  pending_review: 'border-warning/35 bg-warning/5 [&>svg]:text-warning',
  published: 'border-success/30 bg-success/5 [&>svg]:text-success',
  archived: 'border-destructive/25 bg-destructive/5 [&>svg]:text-destructive',
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
  const pendingIntent = String(fetcher.formData?.get('intent') ?? '');
  const adminLocked = listing.status === 'archived' && listing.hiddenBy === 'admin';
  const copy = STATUS_COPY[listing.status];
  const StatusIcon = adminLocked
    ? Lock
    : listing.status === 'draft'
      ? FileClock
      : listing.status === 'published'
        ? CheckCircle2
        : listing.status === 'archived'
          ? EyeOff
          : Info;
  const actionHelp =
    listing.status === 'draft' && !canWrite
      ? 'Bạn không có quyền gửi duyệt tin này.'
      : listing.status === 'draft' && !ready
        ? 'Hoàn tất các mục còn thiếu để mở thao tác gửi duyệt.'
        : adminLocked
          ? 'Chỉ quản trị viên mới có thể bỏ ẩn tin đăng này.'
          : !canPublish && ['published', 'archived'].includes(listing.status)
            ? 'Bạn không có quyền thay đổi trạng thái hiển thị của tin này.'
            : null;
  const hasLifecycleAction =
    (listing.status === 'draft' && canWrite) ||
    (listing.status === 'published' && canPublish) ||
    (listing.status === 'archived' && canPublish && !adminLocked);
  const submit = (intent: 'submit' | 'hide' | 'republish'): void => {
    run(() => fetcher.submit({ intent }, { method: 'post' }));
  };

  return (
    <Alert
      className={cn(
        'rounded-2xl px-5 py-4 shadow-none',
        adminLocked ? 'border-destructive/35 bg-destructive/10' : STATUS_SURFACE[listing.status],
      )}
    >
      <StatusIcon aria-hidden />
      <AlertTitle className="line-clamp-none font-semibold">
        {adminLocked ? 'Tin đăng bị quản trị viên ẩn' : copy.title}
      </AlertTitle>
      <AlertDescription className="w-full gap-4">
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <p className="max-w-3xl">
            {adminLocked
              ? 'Bạn vẫn có thể chỉnh sửa nội dung, nhưng chỉ quản trị viên mới có thể bỏ ẩn tin đăng.'
              : copy.description}
          </p>

          {hasLifecycleAction || actionHelp ? (
            <div
              className="flex shrink-0 flex-col items-start gap-2 md:items-end"
              aria-busy={busy}
              aria-live="polite"
              aria-atomic="true"
            >
              {listing.status === 'draft' && canWrite ? (
                <Button disabled={!ready || busy} onClick={() => submit('submit')}>
                  {busy && pendingIntent === 'submit' ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <Send aria-hidden />
                  )}
                  {busy && pendingIntent === 'submit' ? 'Đang gửi duyệt…' : 'Gửi duyệt'}
                </Button>
              ) : null}
              {listing.status === 'published' && canPublish ? (
                <Button variant="outline" disabled={busy} onClick={() => submit('hide')}>
                  {busy && pendingIntent === 'hide' ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <EyeOff aria-hidden />
                  )}
                  {busy && pendingIntent === 'hide' ? 'Đang ẩn…' : 'Ẩn tin đăng'}
                </Button>
              ) : null}
              {listing.status === 'archived' && canPublish && !adminLocked ? (
                <Button variant="outline" disabled={busy} onClick={() => submit('republish')}>
                  {busy && pendingIntent === 'republish' ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <RotateCcw aria-hidden />
                  )}
                  {busy && pendingIntent === 'republish' ? 'Đang đăng lại…' : 'Đăng lại'}
                </Button>
              ) : null}
              {actionHelp ? (
                <p className="max-w-xs text-xs text-muted-foreground md:text-right">{actionHelp}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {listing.status === 'draft' ? (
          <div className="flex flex-wrap gap-2" aria-label="Kiểm tra trước khi gửi duyệt">
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

        {fetcher.data?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {fetcher.data.error}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
