import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { BookingResponse, ListingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import type { Route } from './+types/bookings.$bookingId';
import { apiGet } from '~/lib/api.server';
import { requirePartner, canPartner } from './partner.server';
import { PageHeader } from './components/page-header';
import { BookingDetailCard } from '~/components/booking-detail-card';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết lượt đặt · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.bookings.read')) {
    throw new Response('Không có quyền xem lượt đặt.', { status: 403 });
  }
  const bookingRes = await apiGet<BookingResponse>(`/partner/bookings/${params.bookingId}`, auth);
  if (!bookingRes.ok || !bookingRes.data) {
    throw new Response('Không tìm thấy lượt đặt.', { status: bookingRes.status === 403 ? 403 : 404 });
  }
  const listingRes = await apiGet<ListingResponse>(
    `/partner/listings/${bookingRes.data.listingId}`,
    auth,
  );
  return {
    booking: bookingRes.data,
    listingTitle: listingRes.ok ? (listingRes.data?.title ?? null) : null,
  };
}

export default function PartnerBookingDetail({ loaderData }: Route.ComponentProps) {
  const { booking, listingTitle } = loaderData;
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/partner/bookings">
            <ArrowLeft className="size-4" /> Lượt đặt
          </Link>
        </Button>
        <PageHeader title="Chi tiết lượt đặt" description="Thao tác duyệt/huỷ/giao-trả nằm ở danh sách lượt đặt." />
      </div>
      <BookingDetailCard booking={booking} title={listingTitle} />
    </div>
  );
}
