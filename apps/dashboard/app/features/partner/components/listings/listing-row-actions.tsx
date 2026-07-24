import { Link, useFetcher } from 'react-router';
import { Clock, EyeOff, Lock, Pencil, Send, Undo2 } from 'lucide-react';
import type { ListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { usesOpeningHours } from '../../lib/listing-hours';
import type { ListingsActionResult } from './types';

/** Per-row lifecycle actions (hours · edit · submit · hide · republish). */
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

  const submit = (intent: string): void => {
    run(() => fetcher.submit({ id: listing.id, intent }, { method: 'post' }));
  };

  return (
    <div className="flex flex-wrap justify-end gap-1.5" aria-busy={busy}>
      {canAvailability && usesOpeningHours(listing) ? (
        <Button asChild size="xs" variant="ghost" title="Giờ mở cửa">
          <Link to={`/partner/listings/${listing.id}/hours`}>
            <Clock className="size-3.5" aria-hidden /> Giờ mở cửa
          </Link>
        </Button>
      ) : null}

      {canWrite && !adminLocked ? (
        <Button asChild size="xs" variant="ghost" title="Sửa tin đăng">
          <Link to={`/partner/listings/${listing.id}/edit`}>
            <Pencil className="size-3.5" aria-hidden /> Sửa
          </Link>
        </Button>
      ) : null}

      {listing.status === 'draft' && canWrite ? (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('submit')}>
          <Send className="size-3.5" aria-hidden /> Gửi duyệt
        </Button>
      ) : null}
      {listing.status === 'published' && canPublish ? (
        <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('hide')}>
          <EyeOff className="size-3.5" aria-hidden /> Ẩn
        </Button>
      ) : null}
      {listing.status === 'archived' && canPublish ? (
        adminLocked ? (
          <Button size="xs" variant="outline" disabled title="Chỉ quản trị viên mới bỏ ẩn được">
            <Lock className="size-3.5" aria-hidden /> Bị khoá
          </Button>
        ) : (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => submit('republish')}>
            <Undo2 className="size-3.5" aria-hidden /> Đăng lại
          </Button>
        )
      ) : null}
    </div>
  );
}
