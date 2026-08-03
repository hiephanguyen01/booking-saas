import type {
  AffiliateCommissionStatusDto,
  BookingStatus,
  PartnerStatus,
  PartnerVerificationStatus,
  PayoutStatusDto,
  PromotionStatusDto,
  PublishStatus,
  SubscriptionStatus,
  TenantStatus,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { SUBSCRIPTION_STATUS_LABELS, TENANT_STATUS_LABELS } from '~/constants/tenancy';
import { COMMISSION_STATUS_LABEL } from '~/constants/affiliate';

/**
 * The single source of truth for status pills across the whole dashboard
 * (admin · tenant · partner). Each enum has ONE tone map keyed by the zod enum
 * from `@booking/contracts`, so adding a status member is a COMPILE error here
 * — a status can never leak to the UI as a raw slug.
 *
 * Colours come from the themeable semantic tokens in `@booking/ui` globals.css
 * (`--success`/`--warning`/`--destructive`/`--info`/`--muted`), each of which
 * already carries its own dark-mode value — so a tone needs no hand-written
 * `dark:` pair, and a palette change lands in one file for both frontends.
 */
type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<StatusTone, string> = {
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/15 text-warning',
  danger: 'border-transparent bg-destructive/15 text-destructive',
  info: 'border-transparent bg-info/15 text-info',
  neutral: 'border-transparent bg-muted text-muted-foreground',
};

function Pill({ tone, children }: { tone: StatusTone; children: string }) {
  return <Badge className={TONE[tone]}>{children}</Badge>;
}

// ── Booking ───────────────────────────────────────────────────────────────────

export interface BookingStatusMeta {
  /** The one label shown wherever this status appears (badge, calendar, filter). */
  label: string;
  /** Pill tone. */
  tone: StatusTone;
  /** Solid dot colour for legends/calendar chips. */
  dot: string;
  /** Calendar event-chip tint (border + soft bg + text), theme-aware. */
  event: string;
}

/**
 * ONE booking-status map. Reconciles the two former `BookingStatusBadge`
 * implementations (tenant `status.tsx` labels/tones win — e.g. `no_show` is
 * "Không đến", not "Vắng mặt") while carrying the partner calendar's richer
 * `dot`/`event` tints so the master calendar keeps its per-status colours.
 */
const BOOKING: Record<BookingStatus, BookingStatusMeta> = {
  draft: {
    label: 'Nháp',
    tone: 'neutral',
    dot: 'bg-muted-foreground',
    event: 'border-border bg-muted text-muted-foreground',
  },
  pending_approval: {
    label: 'Chờ duyệt',
    tone: 'warning',
    dot: 'bg-warning',
    event: 'border-warning/30 bg-warning/10 text-warning',
  },
  pending_payment: {
    label: 'Chờ thanh toán',
    tone: 'warning',
    dot: 'bg-warning',
    event: 'border-warning/30 bg-warning/10 text-warning',
  },
  confirmed: {
    label: 'Đã xác nhận',
    tone: 'info',
    dot: 'bg-info',
    event: 'border-info/30 bg-info/10 text-info',
  },
  completed: {
    label: 'Hoàn tất',
    tone: 'success',
    dot: 'bg-success',
    event: 'border-success/30 bg-success/10 text-success',
  },
  cancelled: {
    label: 'Đã huỷ',
    tone: 'danger',
    dot: 'bg-muted-foreground',
    event: 'border-border bg-muted/60 text-muted-foreground line-through',
  },
  no_show: {
    label: 'Vắng mặt',
    tone: 'danger',
    dot: 'bg-destructive',
    event: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  rejected: {
    label: 'Từ chối',
    tone: 'danger',
    dot: 'bg-destructive',
    event: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  expired: {
    label: 'Hết hạn',
    tone: 'neutral',
    dot: 'bg-muted-foreground',
    event: 'border-border bg-muted text-muted-foreground',
  },
  refunded: {
    label: 'Đã hoàn tiền',
    tone: 'neutral',
    dot: 'bg-muted-foreground',
    // Distinguished from `expired` by the ring, not a bespoke hue.
    event: 'border-muted-foreground/40 bg-muted text-muted-foreground',
  },
};

/** Full presentation meta for a booking status (label + pill tone + calendar tints). */
export function bookingStatusMeta(status: BookingStatus): BookingStatusMeta {
  return BOOKING[status] ?? BOOKING.draft;
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Pill tone={bookingStatusMeta(status).tone}>{bookingStatusMeta(status).label}</Pill>;
}

// ── Listing / publish ───────────────────────────────────────────────────────

const PUBLISH: Record<PublishStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Nháp', tone: 'neutral' },
  pending_review: { label: 'Chờ duyệt', tone: 'warning' },
  published: { label: 'Đang hiển thị', tone: 'success' },
  archived: { label: 'Đã ẩn', tone: 'danger' },
};

export function ListingStatusBadge({ status }: { status: PublishStatus }) {
  const s = PUBLISH[status] ?? { label: 'Không xác định', tone: 'neutral' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// ── Partner ─────────────────────────────────────────────────────────────────

const PARTNER: Record<PartnerStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Chờ duyệt', tone: 'warning' },
  approved: { label: 'Đã duyệt', tone: 'success' },
  suspended: { label: 'Tạm ngưng', tone: 'danger' },
};

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  const s = PARTNER[status] ?? { label: 'Không xác định', tone: 'neutral' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const VERIFICATION: Record<PartnerVerificationStatus, { label: string; tone: StatusTone }> = {
  unsubmitted: { label: 'Chưa gửi', tone: 'neutral' },
  pending: { label: 'Chờ xác minh', tone: 'warning' },
  verified: { label: 'Đã xác minh', tone: 'success' },
  rejected: { label: 'Bị từ chối', tone: 'danger' },
};

export function PartnerVerificationBadge({ status }: { status: PartnerVerificationStatus }) {
  const s = VERIFICATION[status] ?? { label: 'Không xác định', tone: 'neutral' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// ── Promotion ───────────────────────────────────────────────────────────────

const PROMO: Record<PromotionStatusDto, { label: string; tone: StatusTone }> = {
  draft: { label: 'Nháp', tone: 'neutral' },
  active: { label: 'Đang chạy', tone: 'success' },
  paused: { label: 'Tạm dừng', tone: 'warning' },
  ended: { label: 'Đã kết thúc', tone: 'neutral' },
};

export function PromotionStatusBadge({ status }: { status: PromotionStatusDto }) {
  const s = PROMO[status] ?? { label: 'Không xác định', tone: 'neutral' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// ── Payout ──────────────────────────────────────────────────────────────────

const PAYOUT: Record<PayoutStatusDto, { label: string; tone: StatusTone }> = {
  pending: { label: 'Chờ chi', tone: 'warning' },
  processing: { label: 'Đang xử lý', tone: 'info' },
  paid: { label: 'Đã chi', tone: 'success' },
  failed: { label: 'Thất bại', tone: 'danger' },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatusDto }) {
  const s = PAYOUT[status] ?? { label: 'Không xác định', tone: 'neutral' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// ── Affiliate commission ─────────────────────────────────────────────────────

/**
 * Commission-status tone via semantic text tokens (a text treatment, not a
 * pill — commissions render inside dense tables). One implementation for the
 * tenant affiliate detail + the affiliate portal.
 */
export function CommissionStatusBadge({ status }: { status: AffiliateCommissionStatusDto }) {
  const tone =
    status === 'paid'
      ? 'text-success'
      : status === 'confirmed'
        ? 'text-foreground'
        : status === 'pending'
          ? 'text-muted-foreground'
          : 'text-destructive';
  return (
    <span className={`text-sm font-medium ${tone}`}>
      {COMMISSION_STATUS_LABEL[status] ?? 'Không xác định'}
    </span>
  );
}

// ── Tenant / subscription (platform admin) ────────────────────────────────────
// Platform responses type these as `z.string()`, so the props accept `string`;
// the tone maps stay exhaustive over the enum (a new member is a compile error)
// and labels come from `format.ts`.

const TENANT: Record<TenantStatus, StatusTone> = {
  active: 'success',
  suspended: 'danger',
  expired: 'warning',
};

export function TenantStatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={TENANT[status as TenantStatus] ?? 'neutral'}>
      {TENANT_STATUS_LABELS[status] ?? 'Không xác định'}
    </Pill>
  );
}

const SUBSCRIPTION: Record<SubscriptionStatus, StatusTone> = {
  trial: 'neutral',
  active: 'success',
  past_due: 'warning',
  expired: 'warning',
  cancelled: 'danger',
};

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={SUBSCRIPTION[status as SubscriptionStatus] ?? 'neutral'}>
      {SUBSCRIPTION_STATUS_LABELS[status] ?? 'Không xác định'}
    </Pill>
  );
}
