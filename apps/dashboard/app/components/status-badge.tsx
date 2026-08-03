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
 * Colours: `emerald`/`rose`/`sky`/`slate` are status semantics (kept as literal
 * palette per the design rules' success-colour exception); the amber "pending"
 * tone uses the themeable `--warning` token instead of hardcoded amber.
 */
type StatusTone = 'green' | 'warning' | 'rose' | 'sky' | 'slate';

const TONE: Record<StatusTone, string> = {
  green:
    'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning:
    'border-transparent bg-warning/15 text-warning-foreground dark:bg-warning/20 dark:text-warning',
  rose: 'border-transparent bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  sky: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  slate: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
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
    tone: 'slate',
    dot: 'bg-muted-foreground',
    event: 'border-border bg-muted text-muted-foreground',
  },
  pending_approval: {
    label: 'Chờ duyệt',
    tone: 'warning',
    dot: 'bg-warning',
    event: 'border-warning/30 bg-warning/10 text-warning-foreground dark:text-warning',
  },
  pending_payment: {
    label: 'Chờ thanh toán',
    tone: 'warning',
    dot: 'bg-sky-500',
    event: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  confirmed: {
    label: 'Đã xác nhận',
    tone: 'sky',
    dot: 'bg-emerald-500',
    event: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  completed: {
    label: 'Hoàn tất',
    tone: 'green',
    dot: 'bg-teal-500',
    event: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  },
  cancelled: {
    label: 'Đã huỷ',
    tone: 'rose',
    dot: 'bg-muted-foreground',
    event: 'border-border bg-muted/60 text-muted-foreground line-through',
  },
  no_show: {
    label: 'Vắng mặt',
    tone: 'rose',
    dot: 'bg-rose-500',
    event: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  rejected: {
    label: 'Từ chối',
    tone: 'rose',
    dot: 'bg-rose-500',
    event: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  expired: {
    label: 'Hết hạn',
    tone: 'slate',
    dot: 'bg-muted-foreground',
    event: 'border-border bg-muted text-muted-foreground',
  },
  refunded: {
    label: 'Đã hoàn tiền',
    tone: 'slate',
    dot: 'bg-violet-500',
    event: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
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
  draft: { label: 'Nháp', tone: 'slate' },
  pending_review: { label: 'Chờ duyệt', tone: 'warning' },
  published: { label: 'Đang hiển thị', tone: 'green' },
  archived: { label: 'Đã ẩn', tone: 'rose' },
};

export function ListingStatusBadge({ status }: { status: PublishStatus }) {
  const s = PUBLISH[status] ?? { label: 'Không xác định', tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// ── Partner ─────────────────────────────────────────────────────────────────

const PARTNER: Record<PartnerStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Chờ duyệt', tone: 'warning' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  suspended: { label: 'Tạm ngưng', tone: 'rose' },
};

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  const s = PARTNER[status] ?? { label: 'Không xác định', tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const VERIFICATION: Record<PartnerVerificationStatus, { label: string; tone: StatusTone }> = {
  unsubmitted: { label: 'Chưa gửi', tone: 'slate' },
  pending: { label: 'Chờ xác minh', tone: 'warning' },
  verified: { label: 'Đã xác minh', tone: 'green' },
  rejected: { label: 'Bị từ chối', tone: 'rose' },
};

export function PartnerVerificationBadge({ status }: { status: PartnerVerificationStatus }) {
  const s = VERIFICATION[status] ?? { label: 'Không xác định', tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// ── Promotion ───────────────────────────────────────────────────────────────

const PROMO: Record<PromotionStatusDto, { label: string; tone: StatusTone }> = {
  draft: { label: 'Nháp', tone: 'slate' },
  active: { label: 'Đang chạy', tone: 'green' },
  paused: { label: 'Tạm dừng', tone: 'warning' },
  ended: { label: 'Đã kết thúc', tone: 'slate' },
};

export function PromotionStatusBadge({ status }: { status: PromotionStatusDto }) {
  const s = PROMO[status] ?? { label: 'Không xác định', tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

// ── Payout ──────────────────────────────────────────────────────────────────

const PAYOUT: Record<PayoutStatusDto, { label: string; tone: StatusTone }> = {
  pending: { label: 'Chờ chi', tone: 'warning' },
  processing: { label: 'Đang xử lý', tone: 'sky' },
  paid: { label: 'Đã chi', tone: 'green' },
  failed: { label: 'Thất bại', tone: 'rose' },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatusDto }) {
  const s = PAYOUT[status] ?? { label: 'Không xác định', tone: 'slate' as const };
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
      ? 'text-emerald-600 dark:text-emerald-400'
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
  active: 'green',
  suspended: 'rose',
  expired: 'warning',
};

export function TenantStatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={TENANT[status as TenantStatus] ?? 'slate'}>
      {TENANT_STATUS_LABELS[status] ?? 'Không xác định'}
    </Pill>
  );
}

const SUBSCRIPTION: Record<SubscriptionStatus, StatusTone> = {
  trial: 'slate',
  active: 'green',
  past_due: 'warning',
  expired: 'warning',
  cancelled: 'rose',
};

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return (
    <Pill tone={SUBSCRIPTION[status as SubscriptionStatus] ?? 'slate'}>
      {SUBSCRIPTION_STATUS_LABELS[status] ?? 'Không xác định'}
    </Pill>
  );
}
