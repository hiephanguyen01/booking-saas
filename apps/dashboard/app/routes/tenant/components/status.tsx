import type {
  BookingStatus,
  PartnerStatus,
  PartnerVerificationStatus,
  PayoutStatusDto,
  PromotionStatusDto,
  PublishStatus,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/** Tailwind tone classes layered on top of the shadcn Badge for semantic color. */
const TONE = {
  green: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'border-transparent bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  sky: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  slate: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
} as const;

function Pill({ tone, children }: { tone: keyof typeof TONE; children: string }) {
  return <Badge className={TONE[tone]}>{children}</Badge>;
}

const BOOKING: Record<BookingStatus, { label: string; tone: keyof typeof TONE }> = {
  draft: { label: 'Nháp', tone: 'slate' },
  pending_approval: { label: 'Chờ duyệt', tone: 'amber' },
  pending_payment: { label: 'Chờ thanh toán', tone: 'amber' },
  confirmed: { label: 'Đã xác nhận', tone: 'sky' },
  completed: { label: 'Hoàn tất', tone: 'green' },
  cancelled: { label: 'Đã huỷ', tone: 'rose' },
  no_show: { label: 'Không đến', tone: 'rose' },
  rejected: { label: 'Từ chối', tone: 'rose' },
  expired: { label: 'Hết hạn', tone: 'slate' },
  refunded: { label: 'Đã hoàn tiền', tone: 'slate' },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = BOOKING[status] ?? { label: status, tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const PUBLISH: Record<PublishStatus, { label: string; tone: keyof typeof TONE }> = {
  draft: { label: 'Nháp', tone: 'slate' },
  pending_review: { label: 'Chờ duyệt', tone: 'amber' },
  published: { label: 'Đang hiển thị', tone: 'green' },
  archived: { label: 'Đã ẩn', tone: 'rose' },
};

export function ListingStatusBadge({ status }: { status: PublishStatus }) {
  const s = PUBLISH[status] ?? { label: status, tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const PARTNER: Record<PartnerStatus, { label: string; tone: keyof typeof TONE }> = {
  pending: { label: 'Chờ duyệt', tone: 'amber' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  suspended: { label: 'Tạm ngưng', tone: 'rose' },
};

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  const s = PARTNER[status] ?? { label: status, tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const VERIFICATION: Record<PartnerVerificationStatus, { label: string; tone: keyof typeof TONE }> = {
  unsubmitted: { label: 'Chưa gửi', tone: 'slate' },
  pending: { label: 'Chờ xác minh', tone: 'amber' },
  verified: { label: 'Đã xác minh', tone: 'green' },
  rejected: { label: 'Bị từ chối', tone: 'rose' },
};

export function PartnerVerificationBadge({ status }: { status: PartnerVerificationStatus }) {
  const s = VERIFICATION[status] ?? { label: status, tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const PROMO: Record<PromotionStatusDto, { label: string; tone: keyof typeof TONE }> = {
  draft: { label: 'Nháp', tone: 'slate' },
  active: { label: 'Đang chạy', tone: 'green' },
  paused: { label: 'Tạm dừng', tone: 'amber' },
  ended: { label: 'Đã kết thúc', tone: 'slate' },
};

export function PromotionStatusBadge({ status }: { status: PromotionStatusDto }) {
  const s = PROMO[status] ?? { label: status, tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const PAYOUT: Record<PayoutStatusDto, { label: string; tone: keyof typeof TONE }> = {
  pending: { label: 'Chờ chi', tone: 'amber' },
  processing: { label: 'Đang xử lý', tone: 'sky' },
  paid: { label: 'Đã chi', tone: 'green' },
  failed: { label: 'Thất bại', tone: 'rose' },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatusDto }) {
  const s = PAYOUT[status] ?? { label: status, tone: 'slate' as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export { type BadgeVariant };
