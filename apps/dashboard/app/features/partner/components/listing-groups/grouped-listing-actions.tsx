import { Link, useFetcher } from 'react-router';
import { CalendarDays, Copy, Pencil, Trash2 } from 'lucide-react';
import type { ListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { ConfirmButton } from '~/components/confirm-button';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { GroupActionResult } from '~/features/partner/server/listing-groups.server';

/** Per-child action strip (hours · edit · duplicate · delete) for a grouped listing. */
export function GroupedListingActions({
  groupId,
  listing,
  itemLabel,
  canEdit,
  canManageCalendar,
}: {
  groupId: string;
  listing: ListingResponse;
  itemLabel: string;
  canEdit: boolean;
  canManageCalendar: boolean;
}) {
  const fetcher = useFetcher<GroupActionResult>();
  const { busy, run } = useSubmissionGuard(fetcher.state);

  const submit = (intent: 'duplicate-child' | 'delete-child'): void => {
    run(() => fetcher.submit({ intent, listingId: listing.id }, { method: 'post' }));
  };

  return (
    <div className="flex flex-col items-end gap-1" aria-busy={busy}>
      <div className="flex flex-wrap justify-end gap-1">
        {canManageCalendar ? (
          <Button asChild size="sm" variant="ghost">
            <Link to={`/partner/listings/${listing.id}?tab=calendar`} title="Lịch và giá">
              <CalendarDays /> Lịch và giá
            </Link>
          </Button>
        ) : null}
        {canEdit ? (
          <Button asChild size="sm" variant="ghost">
            <Link
              to={`/partner/listing-groups/${groupId}/listings/${listing.id}/edit`}
              title={`Sửa ${itemLabel}`}
            >
              <Pencil /> Sửa
            </Link>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={!canEdit || busy}
          title={`Nhân bản ${itemLabel}`}
          onClick={() => submit('duplicate-child')}
        >
          <Copy /> Nhân bản
        </Button>
        <ConfirmButton
          trigger={
            <Button
              size="sm"
              variant="ghost"
              disabled={!canEdit || busy}
              className="text-destructive hover:text-destructive"
              title={`Xóa ${itemLabel}`}
            >
              <Trash2 /> Xóa
            </Button>
          }
          title={`Xóa ${itemLabel}?`}
          description="Thao tác này không thể hoàn tác."
          confirmLabel="Xóa"
          busy={busy}
          onConfirm={() => submit('delete-child')}
        />
      </div>
      {fetcher.data?.error ? (
        <p className="max-w-64 text-right text-xs text-destructive" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </div>
  );
}
