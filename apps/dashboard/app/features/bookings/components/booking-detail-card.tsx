import * as React from 'react';
import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { PartnerBookingResponse, TenantBookingResponse } from '@booking/contracts';
import { Card, CardContent, CardHeader } from '@booking/ui/components/ui/card';
import { Separator } from '@booking/ui/components/ui/separator';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailRow, DetailRowTotal } from '@booking/ui/components/detail/detail-row';
import { BookingStatusBadge } from '~/components/status-badge';
import { CHARGE_LABEL, PENDING_BOOKING_STATUSES } from '~/constants/booking';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { EntityRef } from '~/components/entity-ref';
import { CopyableCode } from '~/components/copyable-code';
import { StatusTimestamp } from './status-timestamp';
import { Timeline, type TimelineEntry } from '~/components/timeline';

/** Bookable modes → Vietnamese (§9.4); Phase-3 verticals included defensively. */
const MODE_LABEL: Record<string, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Cho thuê',
  appointment: 'Lịch hẹn',
  class: 'Lớp học',
};

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
  const duration = describeDuration(booking.startUtc, booking.endUtc, booking.bookingMode);
  const remaining = subtractMoney(booking.finalAmount, booking.paidAmount);
  const tiers = booking.cancellationPolicySnapshot ?? [];

  const phoneNode =
    props.audience === 'tenant' ? (
      <PhoneValue phone={props.booking.customer.phone} />
    ) : (
      <PhoneValue phone={props.booking.customer.phone} masked={props.booking.customer.phoneMasked} />
    );
  const commissionRows =
    props.audience === 'tenant' ? commissionSummary(props.booking.commissionSnapshot) : [];

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
              <DetailField
                label="Email"
                value={<EmailValue email={props.booking.customer.email} />}
              />
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
                <EnumValue map={MODE_LABEL} value={booking.bookingMode} fallback={booking.bookingMode} />
              }
            />
            <DetailField label="Thời lượng" value={duration ?? undefined} omitWhenEmpty />
            <DetailField label="Bắt đầu" value={<DateTimeValue iso={booking.startUtc} />} />
            <DetailField label="Kết thúc" value={<DateTimeValue iso={booking.endUtc} />} />
            <DetailField label="Số khách" value={String(booking.guestCount)} />
            {isInventory ? (
              <DetailField label="Số lượng" value={String(booking.quantity)} />
            ) : null}
          </DetailGrid>
        </DetailSection>

        <Separator />

        <DetailSection title="Thanh toán">
          <div className="space-y-1.5">
            <DetailRow label="Tạm tính" value={<Money value={booking.totalAmount} />} />
            {booking.discountAmount !== '0' ? (
              <DetailRow
                label={
                  <>
                    Giảm giá
                    {booking.promoCode ? (
                      <span className="ml-1 font-mono text-xs">{booking.promoCode}</span>
                    ) : null}
                  </>
                }
                value={
                  <>
                    <span aria-hidden>−</span> <Money value={booking.discountAmount} />
                  </>
                }
              />
            ) : null}
            <DetailRowTotal label="Thành tiền" value={<Money value={booking.finalAmount} />} />
          </div>

          {booking.additionalCharges.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Phát sinh thêm
              </p>
              {booking.additionalCharges.map((charge, i) => (
                <DetailRow
                  key={`${charge.type}-${i}`}
                  label={CHARGE_LABEL[charge.type] ?? charge.type}
                  value={
                    <>
                      <span aria-hidden>+</span> <Money value={charge.amount} />
                    </>
                  }
                />
              ))}
            </div>
          ) : null}

          <Separator className="my-3" />

          <div className="space-y-1.5">
            {booking.depositAmount !== '0' ? (
              <DetailRow label="Đặt cọc" value={<Money value={booking.depositAmount} />} />
            ) : null}
            <DetailRow label="Đã thanh toán" value={<Money value={booking.paidAmount} />} />
            {remaining !== null ? (
              <DetailRowTotal label="Còn lại" value={<Money value={remaining} />} />
            ) : null}
          </div>
        </DetailSection>

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
                  value={booking.pickedUpAt ? <DateTimeValue iso={booking.pickedUpAt} /> : undefined}
                />
                <DetailField
                  label="Đã nhận trả"
                  value={booking.returnedAt ? <DateTimeValue iso={booking.returnedAt} /> : undefined}
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

        <DetailSection title="Thông tin khác">
          <DetailGrid columns={2}>
            <DetailField label="Tạo lúc" value={<DateTimeValue iso={booking.createdAt} relative />} />
            <DetailField
              label="Cập nhật"
              value={<DateTimeValue iso={booking.updatedAt} relative />}
            />
            {props.audience === 'tenant' ? (
              <>
                <DetailField
                  label="Đối tác"
                  value={
                    <EntityRef
                      to={props.partnerHref ?? null}
                      name={props.partnerName ?? 'Xem đối tác'}
                      fallback={<span className="text-foreground">{props.partnerName ?? '—'}</span>}
                    />
                  }
                />
                {props.booking.affiliateId ? (
                  <DetailField
                    label="Cộng tác viên giới thiệu"
                    value={
                      <EntityRef
                        to={`/tenant/affiliates/${props.booking.affiliateId}`}
                        name={props.booking.referralCode ?? 'Xem cộng tác viên'}
                      />
                    }
                    hint={
                      props.booking.referralCode ? (
                        <CopyableCode value={props.booking.referralCode} label="mã giới thiệu" />
                      ) : undefined
                    }
                  />
                ) : null}
                {commissionRows.length > 0 ? (
                  <DetailField
                    label="Hoa hồng (đã chốt)"
                    span={2}
                    value={<CommissionRows rows={commissionRows} />}
                  />
                ) : null}
                {booking.partnerNote ? (
                  <DetailField
                    label="Ghi chú nội bộ của đối tác"
                    value={booking.partnerNote}
                    span={2}
                  />
                ) : null}
              </>
            ) : null}
          </DetailGrid>
        </DetailSection>

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

/** Phone value: a `tel:` link when reachable, a masked read-only value otherwise. */
function PhoneValue({ phone, masked }: { phone: string | null; masked?: boolean }): React.JSX.Element {
  if (!phone) return <span className="text-muted-foreground">—</span>;
  if (masked) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums">{phone}</span>
        <span className="text-xs text-muted-foreground">đã ẩn</span>
      </span>
    );
  }
  return (
    <a
      href={`tel:${phone}`}
      className="rounded-sm font-medium tabular-nums text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {phone}
    </a>
  );
}

/** Email value (tenant only): a `mailto:` link, or an em dash when absent. */
function EmailValue({ email }: { email: string }): React.JSX.Element {
  if (!email) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={`mailto:${email}`}
      className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {email}
    </a>
  );
}

interface CommissionRow {
  label: string;
  value: ReactNode;
}

function CommissionRows({ rows }: { rows: CommissionRow[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {rows.map((row) => (
        <span key={row.label} className="inline-flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">{row.label}:</span>
          <span className="font-medium tabular-nums">{row.value}</span>
        </span>
      ))}
    </div>
  );
}

/** Human duration between two instants; `null` when unparseable or non-positive. */
function describeDuration(startUtc: string, endUtc: string, mode: string): string | null {
  const start = new Date(startUtc).getTime();
  const end = new Date(endUtc).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60_000);
  if (mode === 'hourly' || mode === 'appointment' || mode === 'class') {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} phút`;
    return mins === 0 ? `${hours} giờ` : `${hours} giờ ${mins} phút`;
  }
  const days = Math.max(1, Math.round(minutes / (60 * 24)));
  return `${days} ngày`;
}

/** A cancellation tier's `hoursBefore` as "2 ngày" / "12 giờ". */
function formatHoursBefore(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ngày`;
  }
  return `${hours} giờ`;
}

/** Exact-bigint `a − b` as a digit string; `null` when either side is unparseable. */
function subtractMoney(a: string, b: string): string | null {
  try {
    return (BigInt(a) - BigInt(b)).toString();
  } catch {
    return null;
  }
}

/**
 * Best-effort summary of the opaque `commissionSnapshot` jsonb (§13.1). Reads
 * only the primitive rate fields it recognises; a fixed rate renders as money,
 * a percent rate as `n%`. Anything missing is simply omitted (never guessed).
 */
function commissionSummary(snapshot: Record<string, unknown> | null): CommissionRow[] {
  if (!snapshot) return [];
  const rows: CommissionRow[] = [];
  const platform = readSnapshotAmount(snapshot, 'platformRate');
  if (platform !== null) rows.push({ label: 'Nền tảng', value: `${platform}%` });

  const tenantRate = readSnapshotAmount(snapshot, 'tenantRate');
  if (tenantRate !== null) {
    rows.push({
      label: 'Tenant',
      value:
        snapshot.tenantRateType === 'fixed' ? <Money value={tenantRate} /> : `${tenantRate}%`,
    });
  }

  const affiliateRate = readSnapshotAmount(snapshot, 'affiliateRate');
  if (affiliateRate !== null) {
    rows.push({
      label: 'CTV',
      value:
        snapshot.affiliateRateType === 'fixed' ? (
          <Money value={affiliateRate} />
        ) : (
          `${affiliateRate}%`
        ),
    });
  }
  return rows;
}

/** Read a snapshot key as a non-empty numeric/string amount, else `null`. */
function readSnapshotAmount(snapshot: Record<string, unknown>, key: string): string | null {
  const value = snapshot[key];
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}
