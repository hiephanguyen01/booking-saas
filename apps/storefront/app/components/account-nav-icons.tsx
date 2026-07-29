import {
  CircleHelp,
  Eye,
  Heart,
  MessageSquareText,
  NotebookText,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { AccountNavKey } from '~/features/account/lib/account-nav';

/**
 * The account navigation's glyphs, shared by the two surfaces that render it:
 * the account sidebar (`features/account`) and the header dropdown
 * (`features/site-shell`). Both drew the same two custom SVGs, and the review
 * glyph had already drifted to a second viewBox between them.
 */
export type AccountNavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const ACCOUNT_NAV_ICONS: Record<AccountNavKey, AccountNavIcon> = {
  profile: UserRound,
  bookings: AccountBookingsIcon,
  messages: MessageSquareText,
  reviews: AccountReviewsIcon,
  favorites: Heart,
  recent: Eye,
  terms: NotebookText,
  security: ShieldCheck,
  help: CircleHelp,
};
export function AccountBookingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <rect
        x="2.5"
        y="4"
        width="15"
        height="12"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="5.25"
        y="7"
        width="2.5"
        height="2.5"
        rx="0.4"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M10.25 7.75h4.5M10.25 11.5h4.5M5.25 12.25h2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AccountReviewsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.25 5.5h7.25M2.25 10h5M2.25 14.5h6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m14 7.5.95 1.92 2.12.31-1.53 1.49.36 2.11-1.9-1-1.9 1 .36-2.11-1.53-1.49 2.12-.31L14 7.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
