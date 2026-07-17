import { Link, useFetcher } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { BookingStatusHistoryResponse, PartnerBookingResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import type { Route } from './+types/detail';
import { apiGet } from '~/lib/api.server';
import { requirePartner, canPartner } from '~/features/partner/server/partner.server';
import { PageHeader } from '~/components/page-header';
import { BookingDetailCard } from '~/features/bookings/components/booking-detail-card';
import {
  runPartnerBookingAction,
  type PartnerBookingActionResult,
} from '~/features/bookings/partner-booking-actions.server';
import { PartnerBookingActions } from '~/features/bookings/partner-booking-actions';
import { toTimelineEntries } from '~/features/bookings/booking-history';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết lượt đặt · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, membership } = await requirePartner(request);
  if (!canPartner(membership, 'partner.bookings.read')) {
    throw new Response('Không có quyền xem lượt đặt.', { status: 403 });
  }
  const bookingRes = await apiGet<PartnerBookingResponse>(`/partner/bookings/${params.bookingId}`, auth);
  if (!bookingRes.ok || !bookingRes.data) {
    throw new Response('Không tìm thấy lượt đặt.', { status: bookingRes.status === 403 ? 403 : 404 });
  }
  // Status history is a secondary fetch — degrade to a "failed" panel, never 500.
  const historyRes = await apiGet<BookingStatusHistoryResponse[]>(
    `/partner/bookings/${params.bookingId}/history`,
    auth,
  );
  return {
    booking: bookingRes.data,
    history: historyRes.ok && historyRes.data ? toTimelineEntries(historyRes.data) : undefined,
    historyFailed: !historyRes.ok,
    canApprove: canPartner(membership, 'partner.bookings.approve'),
    canManage: canPartner(membership, 'partner.bookings.cancel'),
    canWrite: canPartner(membership, 'partner.bookings.write'),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, membership } = await requirePartner(request);
  return runPartnerBookingAction({ request, auth, can: (key) => canPartner(membership, key) });
}

export default function PartnerBookingDetail({ loaderData }: Route.ComponentProps) {
  const { booking, history, historyFailed, canApprove, canManage, canWrite } = loaderData;
  const canAct = canApprove || canManage;

  const footer =
    canAct || canWrite ? (
      <div className="space-y-5">
        {canAct ? (
          <DetailSection title="Thao tác">
            <PartnerBookingActions
              booking={booking}
              canApprove={canApprove}
              canManage={canManage}
              size="sm"
              align="start"
              emptyLabel="Không có thao tác nào ở trạng thái hiện tại."
            />
          </DetailSection>
        ) : null}
        {canWrite ? <PartnerNoteEditor booking={booking} /> : null}
      </div>
    ) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/partner/bookings">
            <ArrowLeft className="size-4" /> Lượt đặt
          </Link>
        </Button>
        <PageHeader title="Chi tiết lượt đặt" description="Toàn bộ thông tin và thao tác cho lượt đặt này." />
      </div>
      <BookingDetailCard
        audience="partner"
        booking={booking}
        history={history}
        historyFailed={historyFailed}
        footer={footer}
      />
    </div>
  );
}

/** Set/clear the partner's private note (§8.2) inline on the detail page. */
function PartnerNoteEditor({ booking }: { booking: PartnerBookingResponse }) {
  const fetcher = useFetcher<PartnerBookingActionResult>();
  const busy = fetcher.state !== 'idle';
  const result = fetcher.data && fetcher.data.intent === 'set-note' ? fetcher.data : null;

  return (
    <DetailSection title="Ghi chú nội bộ" description="Chỉ đối tác thấy — không hiển thị cho khách.">
      <fetcher.Form method="post" className="space-y-2">
        <input type="hidden" name="id" value={booking.id} />
        <input type="hidden" name="intent" value="set-note" />
        <Textarea
          key={booking.partnerNote ?? ''}
          name="note"
          rows={3}
          maxLength={1000}
          defaultValue={booking.partnerNote ?? ''}
          placeholder="Ví dụ: khách quen, cần chuẩn bị thêm đèn…"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            Lưu ghi chú
          </Button>
          {result?.ok ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Đã lưu ghi chú.</span>
          ) : null}
          {result && !result.ok ? (
            <span className="text-xs text-destructive">{result.error}</span>
          ) : null}
        </div>
      </fetcher.Form>
    </DetailSection>
  );
}
