import type { ListingRevisionResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { CircleAlert, Clock3, Undo2 } from 'lucide-react';
import { useFetcher } from 'react-router';
import { REVISION_FIELD_LABEL } from '~/constants/listing-revision';

/**
 * What the partner sees above the edit form once a listing has been reviewed
 * once: the approved version is what customers see, their own edit is either
 * waiting for the tenant or was turned down with a reason. Editing never takes
 * the listing offline, so the banner is the only signal that the form differs
 * from what is public.
 */
export function PendingChangeBanner({
  revision,
  targetLabel = 'tin đăng',
}: {
  revision: ListingRevisionResponse | null;
  /** e.g. "hạng mục" for an item inside a post. */
  targetLabel?: string;
}) {
  const fetcher = useFetcher();
  if (!revision) return null;

  const changed = revision.diff.map((entry) => REVISION_FIELD_LABEL[entry.field] ?? entry.field);
  const submittedAt = new Date(revision.submittedAt).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

  if (revision.status === 'rejected') {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-destructive">Thay đổi chưa được duyệt</p>
          {revision.reviewNote ? <p className="leading-5">Lý do: {revision.reviewNote}</p> : null}
          <p className="text-xs leading-5 text-muted-foreground">
            Nội dung bạn sửa vẫn được giữ trong biểu mẫu — chỉnh lại rồi lưu để gửi duyệt lần nữa.
            Khách vẫn đang thấy bản đã duyệt trước đó.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-sm">
      <Clock3 className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">Thay đổi đang chờ duyệt · gửi lúc {submittedAt}</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Khách vẫn thấy bản đã duyệt của {targetLabel} này. Biểu mẫu bên dưới là bản bạn đã sửa —
          lưu tiếp sẽ cập nhật thay đổi đang chờ.
          {changed.length > 0 ? ` Đang chờ duyệt: ${changed.join(', ')}.` : ''}
        </p>
      </div>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="discard-revision" />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={fetcher.state !== 'idle'}
          className="shrink-0"
        >
          <Undo2 className="size-4" aria-hidden />
          Huỷ thay đổi
        </Button>
      </fetcher.Form>
    </div>
  );
}
