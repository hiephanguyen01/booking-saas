import { useFetcher } from 'react-router';
import type { ModerationActor, PublishStatus } from '@booking/contracts';
import { Switch } from '@booking/ui/components/ui/switch';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { ListingsActionResult } from './types';

export function ListingVisibilitySwitch({
  id,
  target,
  title,
  status,
  hiddenBy,
  canPublish,
}: {
  id: string;
  target: 'listing' | 'group';
  title: string;
  status: PublishStatus;
  hiddenBy: ModerationActor | null;
  canPublish: boolean;
}) {
  const fetcher = useFetcher<ListingsActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const adminLocked = status === 'archived' && hiddenBy === 'admin';
  const canToggle = canPublish && !adminLocked && (status === 'published' || status === 'archived');
  const error = fetcher.data?.error;

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={status === 'published'}
        disabled={!canToggle || busy}
        aria-label={status === 'published' ? `Ẩn ${title}` : `Hiển thị ${title}`}
        title={
          error ??
          (adminLocked
            ? 'Bài đăng bị quản trị viên khóa'
            : !canToggle
              ? 'Chỉ bài đang hiển thị hoặc đã ẩn mới có thể đổi trạng thái tại đây'
              : undefined)
        }
        className="data-[state=checked]:bg-success"
        onCheckedChange={(checked) => {
          const intent = checked ? 'republish' : 'hide';
          run(() => fetcher.submit({ id, target, intent }, { method: 'post' }));
        }}
      />
      {error ? (
        <span className="max-w-40 text-xs leading-4 text-destructive" role="alert">
          {error}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {busy ? 'Đang cập nhật' : error}
      </span>
    </div>
  );
}
