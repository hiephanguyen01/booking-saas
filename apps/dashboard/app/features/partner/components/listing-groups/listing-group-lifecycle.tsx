import { useFetcher } from 'react-router';
import { EyeOff, Info, Lock, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import type { ListingGroupDetailResponse, PublishStatus } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import { Button } from '@booking/ui/components/ui/button';
import { ConfirmButton } from '~/components/confirm-button';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { GroupActionResult } from '../../server/listing-groups.server';

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
    description: 'Nội dung tạm thời chỉ đọc trong lúc quản trị viên xem xét.',
  },
  published: {
    label: 'Đang hiển thị',
    title: 'Tin đăng đang hiển thị',
    description:
      'Bạn vẫn có thể quản lý giờ hoạt động. Hãy ẩn tin đăng trước khi sửa nội dung hạng mục.',
  },
  archived: {
    label: 'Đã ẩn',
    title: 'Tin đăng đang được ẩn',
    description: 'Chuyển về bản nháp để sửa hạng mục, hoặc đăng lại nội dung hiện tại.',
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
            ? 'Bạn có thể xem nội dung và quản lý giờ hoạt động, nhưng chỉ quản trị viên mới có thể bỏ ẩn tin đăng.'
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
  const submit = (intent: string): void => {
    run(() => fetcher.submit({ intent }, { method: 'post' }));
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2" aria-busy={busy}>
      {group.status === 'published' && canPublish ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => submit('hide')}>
          <EyeOff /> Ẩn để chỉnh sửa
        </Button>
      ) : null}
      {group.status === 'archived' && canWrite && !adminLocked ? (
        <Button size="sm" disabled={busy} onClick={() => submit('reopen')}>
          <Pencil /> Chuyển về bản nháp
        </Button>
      ) : null}
      {group.status === 'archived' && canPublish && !adminLocked ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => submit('republish')}>
          <RotateCcw /> Đăng lại
        </Button>
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
export function SubmitGroupButton({ disabled }: { disabled: boolean }) {
  const fetcher = useFetcher<GroupActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  return (
    <div className="flex flex-col items-start gap-1" aria-busy={busy}>
      <Button
        disabled={disabled || busy}
        onClick={() => run(() => fetcher.submit({ intent: 'submit' }, { method: 'post' }))}
      >
        <Send data-icon="inline-start" /> Gửi duyệt
      </Button>
      {fetcher.data?.error ? (
        <p className="text-xs text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}
