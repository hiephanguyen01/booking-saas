import { Link, useFetcher } from 'react-router';
import {
  Clock,
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
import type { ListingResponse } from '@booking/contracts';
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
import { usesOpeningHours } from '~/features/partner/lib/listing-hours';
import type { ListingsActionResult } from './types';

/** Compact primary edit action plus an overflow menu for the full lifecycle. */
export function ListingRowActions({
  listing,
  canWrite,
  canPublish,
  canAvailability,
}: {
  listing: ListingResponse;
  canWrite: boolean;
  canPublish: boolean;
  canAvailability: boolean;
}) {
  const fetcher = useFetcher<ListingsActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);
  const adminLocked = listing.status === 'archived' && listing.hiddenBy === 'admin';
  const canEdit = canWrite && !adminLocked;

  const submit = (intent: string): void => {
    run(() => fetcher.submit({ id: listing.id, target: 'listing', intent }, { method: 'post' }));
  };

  const remove = (): void => {
    if (!confirm(`Xóa bản nháp “${listing.title}”? Hành động này không thể hoàn tác.`)) return;
    submit('delete');
  };

  return (
    <div className="flex items-center justify-end gap-1" aria-busy={busy}>
      {fetcher.data?.error ? (
        <span className="max-w-44 text-right text-xs leading-4 text-destructive" role="alert">
          {fetcher.data.error}
        </span>
      ) : null}
      {canEdit ? (
        <Button asChild size="icon-sm" variant="outline" title="Sửa bài đăng">
          <Link to={dashboardPaths.partner.listingEdit(listing.id)}>
            <Pencil aria-hidden />
            <span className="sr-only">Sửa {listing.title}</span>
          </Link>
        </Button>
      ) : (
        <Button asChild size="icon-sm" variant="outline" title="Xem bài đăng">
          <Link to={dashboardPaths.partner.listing(listing.id)}>
            <Eye aria-hidden />
            <span className="sr-only">Xem {listing.title}</span>
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
            <span className="sr-only">Thao tác khác cho {listing.title}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link to={dashboardPaths.partner.listing(listing.id)}>
              <Eye aria-hidden /> Xem chi tiết
            </Link>
          </DropdownMenuItem>
          {canAvailability && usesOpeningHours(listing) ? (
            <DropdownMenuItem asChild>
              <Link to={dashboardPaths.partner.listingHours(listing.id)}>
                <Clock aria-hidden /> Giờ mở cửa
              </Link>
            </DropdownMenuItem>
          ) : null}
          {listing.status === 'draft' && canWrite ? (
            <DropdownMenuItem onSelect={() => submit('submit')}>
              <Send aria-hidden /> Gửi duyệt
            </DropdownMenuItem>
          ) : null}
          {listing.status === 'published' && canPublish ? (
            <DropdownMenuItem onSelect={() => submit('hide')}>
              <EyeOff aria-hidden /> Ẩn khỏi cửa hàng
            </DropdownMenuItem>
          ) : null}
          {listing.status === 'archived' && canPublish ? (
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
          {listing.status === 'draft' && canWrite ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={remove}>
                <Trash2 aria-hidden /> Xóa bản nháp
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
