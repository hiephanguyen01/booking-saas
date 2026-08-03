import { useFetcher } from 'react-router';
import { EyeOff, Info, LoaderCircle, Lock, RotateCcw, Send, Trash2 } from 'lucide-react';
import type { ListingGroupDetailResponse, PublishStatus } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { ConfirmButton } from '~/components/confirm-button';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { GroupActionResult } from '~/features/partner/server/listing-groups.server';

/** Group publish status → the workspace's status banner copy. */
export const GROUP_STATUS_COPY: Record<
  PublishStatus,
  { label: string; title: string; description: string }
> = {
  draft: {
    label: 'Nháp',
    title: 'Tin đăng đang ở bản nháp',
    description: 'Bạn có thể thêm, sửa, nhân bản hoặc xóa hạng mục trước khi gửi duyệt.',
  },
  pending_review: {
    label: 'Chờ duyệt',
    title: 'Tin đăng đang chờ duyệt',
    description: 'Bạn vẫn sửa được nội dung — mỗi lần lưu sẽ cập nhật bản đang chờ tenant xem xét.',
  },
  published: {
    label: 'Đang hiển thị',
    title: 'Tin đăng đang hiển thị',
    description:
      'Sửa nội dung không làm gián đoạn hiển thị: thay đổi được gửi duyệt, khách vẫn thấy bản đã duyệt cho tới khi tenant chấp nhận.',
  },
  archived: {
    label: 'Đã ẩn',
    title: 'Tin đăng đang được ẩn',
    description: 'Sửa nội dung rồi đăng lại, hoặc đăng lại ngay nội dung đã duyệt trước đó.',
  },
};

/** Hidden by the tenant reviewer — only an admin can un-hide such a group. */
export function isAdminLocked(
  group: Pick<ListingGroupDetailResponse, 'status' | 'hiddenBy'>,
): boolean {
  return group.status === 'archived' && group.hiddenBy === 'admin';
}

/** The status banner: current lifecycle state + the actions it allows. */
export function GroupStatusAlert({
  group,
  canWrite,
  canPublish,
}: {
  group: ListingGroupDetailResponse;
  canWrite: boolean;
  canPublish: boolean;
}) {
  const adminLocked = isAdminLocked(group);
  const statusMeta = GROUP_STATUS_COPY[group.status];
  return (
    <Alert>
      {adminLocked ? <Lock /> : <Info />}
      <AlertTitle>{adminLocked ? 'Tin đăng bị quản trị viên ẩn' : statusMeta.title}</AlertTitle>
      <AlertDescription>
        <p>
          {adminLocked
            ? 'Bạn vẫn có thể chỉnh sửa nội dung và giờ hoạt động, nhưng chỉ quản trị viên mới có thể bỏ ẩn tin đăng.'
            : statusMeta.description}
        </p>
        <GroupLifecycleActions
          group={group}
          canWrite={canWrite}
          canPublish={canPublish}
          adminLocked={adminLocked}
        />
      </AlertDescription>
    </Alert>
  );
}

export function GroupLifecycleActions({
  group,
  canWrite,
  canPublish,
  adminLocked,
}: {
  group: ListingGroupDetailResponse;
  canWrite: boolean;
  canPublish: boolean;
  adminLocked: boolean;
}) {
  const fetcher = useFetcher<GroupActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const pendingIntent = String(fetcher.formData?.get('intent') ?? '');
  const submit = (intent: string): void => {
    run(() => fetcher.submit({ intent }, { method: 'post' }));
  };

  return (
    <div
      className="mt-2 flex flex-wrap gap-2"
      aria-busy={busy}
      aria-live="polite"
      aria-atomic="true"
    >
      {group.status === 'published' && canPublish ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => submit('hide')}>
          {busy && pendingIntent === 'hide' ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <EyeOff aria-hidden />
          )}
          {busy && pendingIntent === 'hide' ? 'Đang ẩn…' : 'Ẩn tin đăng'}
        </Button>
      ) : null}
      {group.status === 'archived' && canPublish && !adminLocked ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => submit('republish')}>
          {busy && pendingIntent === 'republish' ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <RotateCcw aria-hidden />
          )}
          {busy && pendingIntent === 'republish' ? 'Đang đăng lại…' : 'Đăng lại'}
        </Button>
      ) : null}
      {!canPublish && ['published', 'archived'].includes(group.status) ? (
        <p className="basis-full text-xs text-muted-foreground">
          Bạn không có quyền thay đổi trạng thái hiển thị của tin đăng này.
        </p>
      ) : null}
      {adminLocked ? (
        <p className="basis-full text-xs text-muted-foreground">
          Tin đăng chỉ có thể được bỏ ẩn bởi quản trị viên.
        </p>
      ) : null}
      {['draft', 'archived'].includes(group.status) &&
      canWrite &&
      group.listingCount === 0 &&
      !adminLocked ? (
        <ConfirmButton
          trigger={
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 /> Xóa tin đăng
            </Button>
          }
          title="Xóa tin đăng?"
          description="Thao tác này không thể hoàn tác."
          confirmLabel="Xóa tin đăng"
          busy={busy}
          onConfirm={() => submit('delete-group')}
        />
      ) : null}
      {fetcher.data?.error ? (
        <p className="basis-full text-sm text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}

/** "Gửi duyệt" — submits the whole group for tenant review. */
export function SubmitGroupButton({
  disabled,
  disabledReason,
}: {
  disabled: boolean;
  disabledReason?: string;
}) {
  const fetcher = useFetcher<GroupActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  return (
    <div
      className="flex flex-col items-start gap-1"
      aria-busy={busy}
      aria-live="polite"
      aria-atomic="true"
    >
      <Button
        disabled={disabled || busy}
        onClick={() => run(() => fetcher.submit({ intent: 'submit' }, { method: 'post' }))}
      >
        {busy ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden />
        ) : (
          <Send data-icon="inline-start" aria-hidden />
        )}
        {busy ? 'Đang gửi duyệt…' : 'Gửi duyệt'}
      </Button>
      {disabled && disabledReason ? (
        <p className="max-w-56 text-xs leading-4 text-muted-foreground">{disabledReason}</p>
      ) : null}
      {fetcher.data?.error ? (
        <p className="text-xs text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}
