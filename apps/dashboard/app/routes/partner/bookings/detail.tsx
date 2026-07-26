import { useFetcher } from 'react-router';
import type {
  PartnerBookingSettlementResponse,
  BookingStatusHistoryResponse,
  PartnerBookingResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import type { Route } from './+types/detail';
import { apiGet } from '~/lib/api.server';
import { requirePartner } from '~/features/partner/server/partner.server';
import { BackLink } from '~/components/back-link';
import { PageHeader } from '~/components/page-header';
import { BookingDetailCard } from '~/features/bookings/components/booking-detail-card';
import {
  runPartnerBookingAction,
  type PartnerBookingActionResult,
} from '~/features/bookings/server/partner-booking-actions.server';
import { PartnerBookingActions } from '~/features/bookings/components/partner-booking-actions';
import { toTimelineEntries } from '~/features/bookings/lib/booking-history';
import { PartnerBookingSettlementCard } from '~/features/bookings/components/partner-booking-settlement-card';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết lượt đặt · Đối tác · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requirePartner(request, 'partner.bookings.read');
  const bookingRes = await apiGet<PartnerBookingResponse>(
    `/partner/bookings/${params.bookingId}`,
    auth,
  );
  if (!bookingRes.ok || !bookingRes.data) {
    throw new Response('Không tìm thấy lượt đặt.', {
      status: bookingRes.status === 403 ? 403 : 404,
    });
  }
  // Secondary reads degrade independently; neither may blank the booking page.
  const [historyRes, settlementRes] = await Promise.all([
    apiGet<BookingStatusHistoryResponse[]>(`/partner/bookings/${params.bookingId}/history`, auth),
    can('partner.finance.read')
      ? apiGet<PartnerBookingSettlementResponse>(`/partner/finance/settlements/${params.bookingId}`, auth)
      : Promise.resolve(null),
  ]);
  return {
    booking: bookingRes.data,
    history: historyRes.ok && historyRes.data ? toTimelineEntries(historyRes.data) : undefined,
    historyFailed: !historyRes.ok,
    settlement: settlementRes?.ok ? (settlementRes.data ?? null) : null,
    canApprove: can('partner.bookings.approve'),
    canManage: can('partner.bookings.cancel'),
    canWrite: can('partner.bookings.write'),
    actionNow: Date.now(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { auth, can } = await requirePartner(request);
  return runPartnerBookingAction({ request, auth, can });
}

export default function PartnerBookingDetail({ loaderData }: Route.ComponentProps) {
  const {
    booking,
    history,
    historyFailed,
    settlement,
    canApprove,
    canManage,
    canWrite,
    actionNow,
  } = loaderData;
  const canAct = canApprove || canManage || canWrite;

  const footer =
    canAct || canWrite ? (
      <div className="space-y-5">
        {canAct ? (
          <DetailSection title="Thao tác">
            <PartnerBookingActions
              booking={booking}
              canApprove={canApprove}
              canManage={canManage}
              canWrite={canWrite}
              initialNow={actionNow}
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
        <BackLink to="/partner/bookings" label="Lượt đặt" className="mb-2" />
        <PageHeader
          title="Chi tiết lượt đặt"
          description="Toàn bộ thông tin và thao tác cho lượt đặt này."
        />
      </div>
      <BookingDetailCard
        audience="partner"
        booking={booking}
        history={history}
        historyFailed={historyFailed}
        footer={footer}
      />
      {settlement ? <PartnerBookingSettlementCard settlement={settlement} /> : null}
    </div>
  );
}

/** Set/clear the partner's private note (§8.2) inline on the detail page. */
function PartnerNoteEditor({ booking }: { booking: PartnerBookingResponse }) {
  const fetcher = useFetcher<PartnerBookingActionResult>();
  const busy = fetcher.state !== 'idle';
  const result = fetcher.data && fetcher.data.intent === 'set-note' ? fetcher.data : null;

  return (
    <DetailSection
      title="Ghi chú nội bộ"
      description="Chỉ đối tác thấy — không hiển thị cho khách."
    >
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
