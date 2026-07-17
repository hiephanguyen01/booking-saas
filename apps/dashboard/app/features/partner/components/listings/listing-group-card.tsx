import { Link } from 'react-router';
import type { ListingGroupResponse, ListingTypeResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Money } from '~/components/money';
import { ListingStatusBadge } from '~/components/status-badge';

/** One listing-group card in the index grid, linking to its workspace. */
export function ListingGroupCard({
  group,
  listingType,
}: {
  group: ListingGroupResponse;
  listingType?: ListingTypeResponse;
}) {
  return (
    <Link
      to={`/partner/listing-groups/${group.id}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">{group.title}</CardTitle>
              <CardDescription>
                {listingType?.name ?? 'Bài đăng'} · {group.listingCount}{' '}
                {listingType?.itemLabel || 'hạng mục'}
              </CardDescription>
            </div>
            <ListingStatusBadge status={group.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {group.description || 'Chưa có mô tả.'}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Giá từ </span>
            {group.priceFrom ? (
              <Money value={group.priceFrom} className="font-medium" />
            ) : (
              <span className="text-muted-foreground">Chưa có giá</span>
            )}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
