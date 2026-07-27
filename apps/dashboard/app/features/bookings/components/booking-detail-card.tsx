import * as React from 'react';
import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { BookingMode, PartnerBookingResponse, TenantBookingResponse } from '@booking/contracts';
import { Card, CardContent, CardHeader } from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { BookingStatusBadge } from '~/components/status-badge';
import { BOOKING_MODE_LABEL, PENDING_BOOKING_STATUSES } from '~/constants/booking';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { EntityRef } from '~/components/entity-ref';
import { CopyableCode } from '~/components/copyable-code';
import { EmailLink, PhoneLink } from '~/components/contact-link';
import { Timeline, type TimelineEntry } from '~/components/timeline';
import { formatHoursBefore } from '~/lib/format';
import { StatusTimestamp } from './status-timestamp';
import { describeDuration } from './booking-derive';
import { commissionSummary } from './commission-summary';
import { BookingPaymentSection } from './booking-payment-section';
import { BookingMetaSection } from './booking-meta-section';

interface BookingDetailCardBaseProps {
  /** Route to the listing when the area exposes one; falls back to plain text. */
  listingHref?: string | null;
  /** Mapped status history for the timeline; `undefined` while not fetched. */
  history?: TimelineEntry[];
  /** The history endpoint failed independently — warn instead of blanking. */
  historyFailed?: boolean;
  /** Header-right controls (e.g. the tenant cancel button). */
  actions?: ReactNode;
  /** Full-width block under the card body (partner actions, note editor, results). */
  footer?: ReactNode;
}

/**
 * Read-only booking detail shared by the tenant + partner detail views. The two
 * audiences carry structurally different payloads (the partner one masks the
 * phone, drops the email, and has no affiliate/commission), so the prop is a
 * discriminated union on `audience` and every audience-only field is narrowed
 * behind it — a partner can never be handed a tenant-shaped booking by mistake.
 */
export type BookingDetailCardProps = BookingDetailCardBaseProps &
  (
    | {
        audience: 'tenant';
        booking: TenantBookingResponse;
        /** Resolved partner display name for the metadata link. */
        partnerName?: string | null;
        /** Route to the partner detail (tenant area). */
        partnerHref?: string | null;
      }
    | { audience: 'partner'; booking: PartnerBookingResponse }
  );

export function BookingDetailCard(props: BookingDetailCardProps): React.JSX.Element {
  const { booking, listingHref, history, historyFailed, actions, footer } = props;
  const isInventory = booking.bookingMode === 'inventory';
  const isPending = PENDING_BOOKING_STATUSES.includes(booking.status);
  const duration = describeDuration(
    booking.startUtc,
    booking.endUtc,
    booking.bookingMode,
    booking.resourceTimezone,
  );
  const tiers = booking.cancellationPolicySnapshot ?? [];

  // The union narrows only on the intact props object, so every audience-only
  // field is plucked here and handed to the sections as explicit values.
  const phoneNode =
    props.audience === 'tenant' ? (
      <PhoneLink phone={props.booking.customer.phone} />
    ) : (
      <PhoneLink phone={props.booking.customer.phone} masked={props.booking.customer.phoneMasked} />
    );
  const tenantMeta =
    props.audience === 'tenant'
      ? {
          partnerName: props.partnerName ?? null,
          partnerHref: props.partnerHref ?? null,
          affiliateId: props.booking.affiliateId,
          referralCode: props.booking.referralCode,
          commissionRows: commissionSummary(props.booking.commissionSnapshot),
          partnerNote: props.booking.partnerNote,
        }
      : undefined;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CopyableCode value={booking.code} label="mã đặt chỗ" />
              <BookingStatusBadge status={booking.status} />
            </div>
            <p className="text-sm">
              <EntityRef
                to={listingHref ?? null}
                name={booking.listingTitle}
                fallback={<span className="text-foreground">{booking.listingTitle}</span>}
              />
            </p>
            {isPending && booking.expiresAt ? (
              <StatusTimestamp label="Hết hạn giữ chỗ" iso={booking.expiresAt} urgent />
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <DetailSection title="Khách hàng">
          <DetailGrid columns={2}>
            <DetailField label="Họ tên" value={booking.customer.fullName} emphasis="strong" />
            <DetailField label="Số điện thoại" value={phoneNode} />
            {props.audience === 'tenant' ? (
              <DetailField label="Email" value={<EmailLink email={props.booking.customer.email} />} />
            ) : null}
            {booking.customerNote ? (
              <DetailField label="Ghi chú của khách" value={booking.customerNote} span={2} />
            ) : null}
          </DetailGrid>
        </DetailSection>

        <Separator />

        <DetailSection title="Lịch">
          <DetailGrid columns={2}>
            <DetailField
              label="Hình thức"
              value={
                <EnumValue
                  map={BOOKING_MODE_LABEL}
                  value={booking.bookingMode as BookingMode}
                  fallback={booking.bookingMode}
                />
              }
            />
            <DetailField label="Thời lượng" value={duration ?? undefined} omitWhenEmpty />
            <DetailField
              label="Bắt đầu"
              value={<DateTimeValue iso={booking.startUtc} timeZone={booking.resourceTimezone} />}
            />
            <DetailField
              label="Kết thúc"
              value={<DateTimeValue iso={booking.endUtc} timeZone={booking.resourceTimezone} />}
            />
            <DetailField label="Số khách" value={String(booking.guestCount)} />
            {isInventory ? <DetailField label="Số lượng" value={String(booking.quantity)} /> : null}
          </DetailGrid>
        </DetailSection>

        <Separator />

        <BookingPaymentSection
          totalAmount={booking.totalAmount}
          discountAmount={booking.discountAmount}
          promoCode={booking.promoCode}
          finalAmount={booking.finalAmount}
          additionalCharges={booking.additionalCharges}
          depositAmount={booking.depositAmount}
          paidAmount={booking.paidAmount}
        />

        {isInventory ? (
          <>
            <Separator />
            <DetailSection title="Thiết bị">
              <DetailGrid columns={2}>
                <DetailField
                  label="Tiền cọc thiết bị"
                  value={<Money value={booking.securityDeposit} />}
                />
                <DetailField
                  label="Đã giao"
                  value={
                    booking.pickedUpAt ? (
                      <DateTimeValue iso={booking.pickedUpAt} timeZone={booking.resourceTimezone} />
                    ) : undefined
                  }
                />
                <DetailField
                  label="Đã nhận trả"
                  value={
                    booking.returnedAt ? (
                      <DateTimeValue iso={booking.returnedAt} timeZone={booking.resourceTimezone} />
                    ) : undefined
                  }
                />
                {booking.damageAmount !== '0' ? (
                  <DetailField
                    label="Khấu trừ hư hỏng"
                    value={<Money value={booking.damageAmount} />}
                  />
                ) : null}
              </DetailGrid>
            </DetailSection>
          </>
        ) : null}

        {tiers.length > 0 ? (
          <>
            <Separator />
            <DetailSection
              title="Điều khoản huỷ"
              description="Áp dụng khi khách tự huỷ. Tenant/đối tác huỷ luôn hoàn tiền đầy đủ."
            >
              <ul className="space-y-1.5 text-sm">
                {tiers.map((tier, i) => (
                  <li key={i} className="flex items-center justify-between gap-4">
                    <span className="min-w-0 text-muted-foreground">
                      Huỷ trước {formatHoursBefore(tier.hoursBefore)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      hoàn {tier.refundPercent}%
                    </span>
                  </li>
                ))}
              </ul>
            </DetailSection>
          </>
        ) : null}

        {history !== undefined || historyFailed ? (
          <>
            <Separator />
            <DetailSection
              title="Lịch sử"
              emptyMessage={historyFailed ? undefined : 'Chưa có lịch sử chuyển trạng thái.'}
            >
              {historyFailed ? (
                <p className="inline-flex items-center gap-1.5 text-sm text-warning">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                  Không tải được lịch sử.
                </p>
              ) : (
                <Timeline entries={history ?? []} />
              )}
            </DetailSection>
          </>
        ) : null}

        <Separator />

        <BookingMetaSection
          createdAt={booking.createdAt}
          updatedAt={booking.updatedAt}
          tenant={tenantMeta}
        />

        {footer ? (
          <>
            <Separator />
            {footer}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
