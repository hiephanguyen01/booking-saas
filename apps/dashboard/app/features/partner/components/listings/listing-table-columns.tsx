import { Lock } from 'lucide-react';
import type { ListingResponse } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import type { DataTableColumn } from '@booking/ui/components/data-table/data-table';
import { Money } from '~/components/money';
import { EnumValue } from '~/components/enum-value';
import { ListingStatusBadge } from '~/components/status-badge';
import { formatDate } from '~/lib/format';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { listingPriceFrom } from '~/lib/listing-price';
import { ListingRowActions } from './listing-row-actions';

/** Table columns for the standalone (ungrouped) listings index. */
export function buildListingColumns(opts: {
  canWrite: boolean;
  canPublish: boolean;
  canAvailability: boolean;
}): DataTableColumn<ListingResponse>[] {
  const { canWrite, canPublish, canAvailability } = opts;
  return [
    {
      header: 'Tin đăng',
      cell: (l) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{l.title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">/{l.slug}</p>
        </div>
      ),
    },
    {
      header: 'Hình thức',
      cell: (l) => (
        <div className="flex flex-wrap gap-1">
          {l.bookingModes.map((m) => (
            <Badge key={m} variant="outline" className="font-normal">
              <EnumValue map={BOOKING_MODE_LABEL} value={m} />
            </Badge>
          ))}
        </div>
      ),
    },
    {
      header: 'Giá từ',
      cell: (l) => {
        const price = listingPriceFrom(l);
        return price ? (
          <Money value={price} />
        ) : (
          <span className="text-sm text-muted-foreground">Chưa có giá</span>
        );
      },
    },
    {
      header: 'Cập nhật',
      cell: (l) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(l.updatedAt)}
        </span>
      ),
    },
    {
      header: 'Trạng thái',
      cell: (l) => {
        const adminLocked = l.status === 'archived' && l.hiddenBy === 'admin';
        return (
          <div className="flex items-center gap-1.5">
            <ListingStatusBadge status={l.status} />
            {adminLocked ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-warning"
                title="Bị quản trị viên ẩn"
              >
                <Lock className="size-3" aria-hidden /> Khoá
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      header: '',
      headClassName: 'text-right',
      className: 'text-right',
      cell: (l) => (
        <ListingRowActions
          listing={l}
          canWrite={canWrite}
          canPublish={canPublish}
          canAvailability={canAvailability}
        />
      ),
    },
  ];
}
