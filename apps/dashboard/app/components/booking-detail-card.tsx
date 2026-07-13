import type { ReactNode } from 'react';
import type { BookingResponse } from '@booking/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import { formatVnd as vnd } from '~/routes/tenant/format';
import { BookingStatusBadge } from '~/routes/tenant/components/status';

const TZ = 'Asia/Ho_Chi_Minh';

function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const MODE_LABEL: Record<string, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Cho thuê',
};

/**
 * Read-only booking detail shared by the tenant + partner detail views
 * (Task 1.13/1.14). `title` is the listing title when the route resolved it;
 * `actions` renders area-specific controls (e.g. tenant cancel).
 */
export function BookingDetailCard({
  booking,
  title,
  actions,
}: {
  booking: BookingResponse;
  title?: string | null;
  actions?: ReactNode;
}) {
  const isInventory = booking.bookingMode === 'inventory';
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <span className="font-mono">{booking.code}</span>
            <BookingStatusBadge status={booking.status} />
          </CardTitle>
          {title ? <p className="text-sm text-muted-foreground">{title}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Lịch">
          <Row label="Hình thức" value={MODE_LABEL[booking.bookingMode] ?? booking.bookingMode} />
          <Row label="Bắt đầu" value={dateTime(booking.startUtc)} />
          <Row label="Kết thúc" value={dateTime(booking.endUtc)} />
          <Row label="Số khách" value={String(booking.guestCount)} />
          {isInventory ? <Row label="Số lượng" value={String(booking.quantity)} /> : null}
        </Section>

        <Separator />

        <Section title="Thanh toán">
          <Row label="Tạm tính" value={vnd(booking.totalAmount)} />
          {booking.discountAmount !== '0' ? (
            <Row label="Giảm giá" value={`− ${vnd(booking.discountAmount)}`} />
          ) : null}
          <Row label="Thành tiền" value={vnd(booking.finalAmount)} strong />
          <Row label="Đặt cọc" value={vnd(booking.depositAmount)} />
          <Row label="Đã thanh toán" value={vnd(booking.paidAmount)} />
        </Section>

        {isInventory ? (
          <>
            <Separator />
            <Section title="Thiết bị (cọc)">
              <Row label="Tiền cọc" value={vnd(booking.securityDeposit)} />
              <Row label="Đã giao" value={booking.pickedUpAt ? dateTime(booking.pickedUpAt) : '—'} />
              <Row label="Đã nhận trả" value={booking.returnedAt ? dateTime(booking.returnedAt) : '—'} />
              {booking.damageAmount !== '0' ? (
                <Row label="Khấu trừ hư hỏng" value={vnd(booking.damageAmount)} />
              ) : null}
            </Section>
          </>
        ) : null}

        {booking.customerNote ? (
          <>
            <Separator />
            <Section title="Ghi chú của khách">
              <p className="text-sm text-muted-foreground">{booking.customerNote}</p>
            </Section>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  );
}
