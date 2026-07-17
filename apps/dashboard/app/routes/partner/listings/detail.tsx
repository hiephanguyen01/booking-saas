import { Link } from 'react-router';
import { Pencil } from 'lucide-react';
import type { ListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import type { Route } from './+types/detail';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { Money } from '~/components/money';
import { ListingStatusBadge } from '~/components/status-badge';
import {
  CANCELLATION_SOURCE_LABEL,
  CancellationTiers,
} from '~/components/cancellation-tiers';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { dashboardPaths } from '~/constants/paths';
import { listingPriceFrom } from '~/lib/listing-price';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết tin đăng · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.listings.read');
  const res = await apiGet<ListingResponse>(`/partner/listings/${params.listingId}`, auth);
  if (!res.ok || !res.data) {
    throw new Response('Không tìm thấy tin đăng.', { status: res.status === 403 ? 403 : 404 });
  }
  return { listing: res.data, canWrite: can('partner.listings.write') };
}

export default function PartnerListingDetail({ loaderData }: Route.ComponentProps) {
  const { listing, canWrite } = loaderData;
  const price = listingPriceFrom(listing);
  const source = listing.effectiveCancellationPolicySource;
  const inherited = source !== null && source !== 'listing';

  return (
    <div className="space-y-5">
      <div>
        <BackLink to={dashboardPaths.partner.listings} label="Tin đăng" className="mb-2" />
        <PageHeader
          title={listing.title}
          description={`/${listing.slug}`}
          actions={
            canWrite ? (
              <Button asChild size="sm" variant="outline">
                <Link to={dashboardPaths.partner.listing(listing.id) + '/edit'}>
                  <Pencil className="size-4" /> Sửa
                </Link>
              </Button>
            ) : null
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid columns={3}>
            <DetailField label="Trạng thái" value={<ListingStatusBadge status={listing.status} />} />
            <DetailField
              label="Hình thức"
              value={listing.bookingModes
                .map((m) => BOOKING_MODE_LABEL[m] ?? m)
                .join(', ')}
            />
            <DetailField
              label="Giá từ"
              value={price ? <Money value={price} /> : 'Chưa có giá'}
            />
            <DetailField label="Đặt cọc" value={`${listing.depositPercent}%`} />
          </DetailGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chính sách huỷ</CardTitle>
          <CardDescription>
            Chính sách hoàn tiền đang áp dụng cho tin đăng này (ưu tiên: riêng listing → mặc định của
            bạn → mặc định hệ thống).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DetailSection title="Đang áp dụng" emptyMessage="Chưa có chính sách huỷ nào áp dụng.">
            {listing.effectiveCancellationPolicy ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {listing.effectiveCancellationPolicy.name}
                  {source ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({CANCELLATION_SOURCE_LABEL[source]})
                    </span>
                  ) : null}
                </p>
                <CancellationTiers rules={listing.effectiveCancellationPolicy.rules} />
              </div>
            ) : null}
          </DetailSection>
          {inherited ? (
            <p className="text-xs text-muted-foreground">
              Tin đăng này chưa gắn chính sách riêng — đang dùng {CANCELLATION_SOURCE_LABEL[source]}.
              Sửa tin đăng để gắn một chính sách riêng.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
