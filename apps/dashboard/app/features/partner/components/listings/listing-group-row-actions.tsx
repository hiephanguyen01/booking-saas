import { Link, useFetcher } from 'react-router';
import {
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { ListingGroupResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@booking/ui/components/ui/dropdown-menu';
import { dashboardPaths } from '~/constants/paths';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { ListingsActionResult } from './types';

export function ListingGroupRowActions({
  group,
  canWrite,
  canPublish,
}: {
  group: ListingGroupResponse;
  canWrite: boolean;
  canPublish: boolean;
}) {
  const fetcher = useFetcher<ListingsActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const adminLocked = group.status === 'archived' && group.hiddenBy === 'admin';

  const submit = (intent: string): void => {
    run(() => fetcher.submit({ id: group.id, target: 'group', intent }, { method: 'post' }));
  };

  return (
    <div className="flex items-center justify-end gap-1" aria-busy={busy}>
      {fetcher.data?.error ? (
        <span className="max-w-44 text-right text-xs leading-4 text-destructive" role="alert">
          {fetcher.data.error}
        </span>
      ) : null}
      {canWrite && !adminLocked ? (
        <Button asChild size="icon-sm" variant="outline" title="Sửa bài đăng nhóm">
          <Link to={dashboardPaths.partner.listingGroupEdit(group.id)}>
            <Pencil aria-hidden />
            <span className="sr-only">Sửa {group.title}</span>
          </Link>
        </Button>
      ) : (
        <Button asChild size="icon-sm" variant="outline" title="Quản lý bài đăng nhóm">
          <Link to={dashboardPaths.partner.listingGroup(group.id)}>
            <Eye aria-hidden />
            <span className="sr-only">Quản lý {group.title}</span>
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            title={fetcher.data?.error ?? 'Thao tác khác'}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <MoreHorizontal aria-hidden />
            )}
            <span className="sr-only">Thao tác khác cho {group.title}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link to={dashboardPaths.partner.listingGroup(group.id)}>
              <Eye aria-hidden /> Quản lý hạng mục
            </Link>
          </DropdownMenuItem>
          {group.status === 'draft' && canWrite ? (
            <DropdownMenuItem onSelect={() => submit('submit')}>
              <Send aria-hidden /> Gửi duyệt
            </DropdownMenuItem>
          ) : null}
          {group.status === 'published' && canPublish ? (
            <DropdownMenuItem onSelect={() => submit('hide')}>
              <EyeOff aria-hidden /> Ẩn khỏi cửa hàng
            </DropdownMenuItem>
          ) : null}
          {group.status === 'archived' && canPublish ? (
            adminLocked ? (
              <DropdownMenuItem disabled>
                <Lock aria-hidden /> Bị quản trị viên khóa
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => submit('republish')}>
                <Undo2 aria-hidden /> Đăng lại
              </DropdownMenuItem>
            )
          ) : null}
          {group.status === 'draft' && canWrite ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  if (confirm(`Xóa bài đăng nhóm “${group.title}”?`)) submit('delete');
                }}
              >
                <Trash2 aria-hidden /> Xóa bản nháp
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
