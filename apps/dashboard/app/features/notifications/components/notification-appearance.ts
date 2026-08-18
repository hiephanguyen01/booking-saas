import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  Handshake,
  LayoutGrid,
  LayoutList,
  ScrollText,
  Share2,
  ShieldAlert,
  Star,
  Store,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationTargetType } from '@booking/contracts';

/** The same five tones `~/components/status-badge` speaks, so a bell row and the
 *  status pill on the screen it links to never disagree about what red means. */
type NotificationTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Tinted icon tile per tone. Colours are the themeable semantic tokens from
 * `@booking/ui` globals.css, each of which already carries its dark-mode value —
 * so no hand-written `dark:` pair, and a palette change lands in one file.
 */
const TONE_TILE: Record<NotificationTone, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  info: 'bg-info/15 text-info',
  neutral: 'bg-muted text-muted-foreground',
};

/**
 * The icon a row wears, keyed by `targetType` — a zod enum, so adding a member
 * to the contract is a COMPILE error here (same guarantee `status-badge.tsx`
 * gives a status) and a new notification kind can never ship as a blank tile.
 */
const TARGET_ICON: Record<NotificationTargetType, LucideIcon> = {
  tenant_partner: Handshake,
  tenant_listing_review: ClipboardCheck,
  tenant_listing_group_review: LayoutGrid,
  tenant_disputes: ShieldAlert,
  tenant_reviews: Star,
  tenant_affiliate: Share2,
  partner_booking: CalendarClock,
  partner_listings: LayoutList,
  partner_revenue: Wallet,
  partner_profile: Store,
  partner_home: ScrollText,
  affiliate_home: ScrollText,
};

/** Where a row sits on the tone scale before the event itself is consulted. A
 *  moderation queue is an action (warning); money that landed is a win. */
const TARGET_TONE: Record<NotificationTargetType, NotificationTone> = {
  tenant_partner: 'info',
  tenant_listing_review: 'warning',
  tenant_listing_group_review: 'warning',
  tenant_disputes: 'danger',
  tenant_reviews: 'info',
  tenant_affiliate: 'info',
  partner_booking: 'info',
  partner_listings: 'info',
  partner_revenue: 'success',
  partner_profile: 'neutral',
  partner_home: 'info',
  affiliate_home: 'info',
};

/**
 * `eventType` is a free string in the contract — it is the OUTBOX event name
 * (`listing.published`, `booking.cancelled`), and the API owns that vocabulary —
 * so the tone it implies is matched by rule, FIRST RULE WINS, with the target's
 * own tone as the fallback. A cancelled booking then reads red and a confirmed
 * one green, while an event this build has never heard of still lands in the
 * right colour family instead of throwing or going grey.
 *
 * The verb rules anchor on the END of the name (`…_approved`, not `approved`
 * anywhere) so `partner.created` stays neutral instead of being dragged into
 * whichever verb happens to appear in its noun. `[._]` accepts both the dotted
 * event name and the underscored template id, since only the former is stored
 * today and the two are trivially confusable.
 */
const EVENT_TONE: Array<[RegExp, NotificationTone]> = [
  // Must precede `published` below: a new terms version is news to sign, not a win.
  [/^legal[._]document/, 'info'],
  // The one create that is a queue rather than a fact: "Lượt đặt mới chờ duyệt".
  [/^booking[._]created$/, 'warning'],
  [/(cancelled|rejected|voided|hidden|suspended|expired)$/, 'danger'],
  [/(submitted|applied|requested|opened)$/, 'warning'],
  [/(approved|confirmed|published|paid|issued|completed|verified)$/, 'success'],
];

export interface NotificationAppearance {
  Icon: LucideIcon;
  /** Background + foreground classes for the icon tile. */
  tile: string;
}

/**
 * Icon + tile colours for one bell row.
 *
 * The maps are keyed by the contract enum, but a row written by a NEWER API than
 * this deployed dashboard carries a `targetType` neither of them has — the same
 * case `notificationTargetPath` returns null for. It falls back to a plain bell
 * rather than rendering `undefined` as an icon and throwing inside the shell.
 */
export function notificationAppearance(
  targetType: NotificationTargetType,
  eventType: string,
): NotificationAppearance {
  const tone =
    EVENT_TONE.find(([pattern]) => pattern.test(eventType))?.[1] ??
    TARGET_TONE[targetType] ??
    'neutral';
  return { Icon: TARGET_ICON[targetType] ?? Bell, tile: TONE_TILE[tone] };
}
