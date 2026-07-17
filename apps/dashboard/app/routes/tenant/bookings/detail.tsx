import { useState } from 'react';
import { data as routeData, Form, Link, useNavigation } from 'react-router';
import { ArrowLeft, Ban, CircleAlert, CircleCheck } from 'lucide-react';
import {
  reasonInputSchema,
  type BookingStatusHistoryResponse,
  type CancelBookingResponse,
  type PartnerResponse,
  type TenantBookingResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import type { Route } from './+types/detail';
import { apiGet, apiPost } from '~/lib/api.server';
import { requireTenant } from '~/features/tenant/server/tenant.server';
import { useTenantArea } from '~/features/tenant/lib/area-context';
import { PageHeader } from '~/components/page-header';
import { BookingDetailCard } from '~/features/bookings/components/booking-detail-card';
import { Money } from '~/components/money';
import { toTimelineEntries } from '~/features/bookings/booking-history';

export function meta(): Route.MetaDescriptors {
  return [{ title: 'Chi tiết đặt chỗ · Tenant · Bookify' }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { auth, can } = await requireTenant(request, 'tenant.bookings.read');
  const bookingRes = await apiGet<TenantBookingResponse>(`/tenant/bookings/${params.bookingId}`, auth);
  if (!bookingRes.ok || !bookingRes.data) {
    throw new Response('Không tìm thấy đặt chỗ.', { status: bookingRes.status === 403 ? 403 : 404 });
  }
  const booking = bookingRes.data;
  const canReadPartners = can('tenant.partners.read');

  // Both are secondary: history degrades to a "failed" panel; the partner name is
  // only for the metadata link. Neither should 500 the page.
  const [historyRes, partnerRes] = await Promise.all([
    apiGet<BookingStatusHistoryResponse[]>(`/tenant/bookings/${params.bookingId}/history`, auth),
    canReadPartners
      ? apiGet<PartnerResponse>(`/tenant/partners/${booking.partnerId}`, auth)
      : Promise.resolve(null),
  ]);

  return {
    booking,
    history: historyRes.ok && historyRes.data ? toTimelineEntries(historyRes.data) : undefined,
    historyFailed: !historyRes.ok,
    partnerName: partnerRes?.ok ? (partnerRes.data?.name ?? null) : null,
    partnerHref: canReadPartners ? `/tenant/partners/${booking.partnerId}` : null,
    canCancel: can('tenant.bookings.cancel'),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { auth } = await requireTenant(request, 'tenant.bookings.cancel');
  const form = await request.formData();
  const reason = String(form.get('reason') ?? '').trim();
  const parsed = reasonInputSchema.safeParse({ reason: reason || undefined });
  if (!parsed.success) return routeData({ error: 'Lý do không hợp lệ.' }, { status: 400 });
  const res = await apiPost<CancelBookingResponse>(
    `/tenant/bookings/${params.bookingId}/cancel`,
    parsed.data,
    auth,
  );
  if (!res.ok || !res.data) {
    return routeData({ error: res.error ?? 'Không huỷ được đặt chỗ.' }, { status: 400 });
  }
  return { ok: true as const, refundAmount: res.data.refundAmount, refundPercent: res.data.refundPercent };
}

export default function TenantBookingDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { booking, history, historyFailed, partnerName, partnerHref, canCancel } = loaderData;
  const { readOnly } = useTenantArea();
  const actionError = actionData && 'error' in actionData ? actionData.error : null;
  const cancelled = actionData && 'ok' in actionData ? actionData : null;
  const cancellable = canCancel && booking.status === 'confirmed' && !readOnly;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/tenant/bookings">
            <ArrowLeft className="size-4" /> Đặt chỗ
          </Link>
        </Button>
        <PageHeader title="Chi tiết đặt chỗ" description="Toàn bộ thông tin của đơn đặt." />
      </div>

      {actionError ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {cancelled ? (
        <Alert>
          <CircleCheck className="size-4" />
          <AlertDescription>
            Đã huỷ đơn · hoàn {cancelled.refundPercent}% cho khách ={' '}
            <Money className="font-medium" value={cancelled.refundAmount} />
          </AlertDescription>
        </Alert>
      ) : null}

      <BookingDetailCard
        audience="tenant"
        booking={booking}
        history={history}
        historyFailed={historyFailed}
        partnerName={partnerName}
        partnerHref={partnerHref}
        actions={cancellable ? <CancelDialog booking={booking} /> : null}
      />
    </div>
  );
}

function CancelDialog({ booking }: { booking: TenantBookingResponse }) {
  const [open, setOpen] = useState(false);
  const nav = useNavigation();
  const busy = nav.state !== 'idle';
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Ban className="size-4" /> Huỷ đặt chỗ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Form method="post" onSubmit={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Huỷ đặt chỗ {booking.code}</DialogTitle>
            <DialogDescription>
              Tenant huỷ luôn hoàn tiền đầy đủ cho khách (§8.2). Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="cancel-reason">Lý do (tuỳ chọn)</Label>
            <Input id="cancel-reason" name="reason" maxLength={500} placeholder="Lý do huỷ đơn…" />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Đóng
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={busy}>
              Huỷ & hoàn tiền cho khách
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
