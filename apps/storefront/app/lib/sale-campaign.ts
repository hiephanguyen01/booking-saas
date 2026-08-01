import type { SaleCampaignSummary } from '@booking/contracts';

/** Below this many days left, the badge counts down instead of naming a date. */
const URGENT_DAYS = 3;

/**
 * Integer percent off, or null when the "sale" is not actually below the regular
 * price. BigInt because VND amounts travel as digit strings and exceed the safe
 * integer range for a whole booking.
 *
 * The single copy: a search card, a slot row and a booking line must never round
 * the same discount to two different numbers.
 */
export function discountPercent(regularPrice: string, salePrice: string): number | null {
  const regular = BigInt(regularPrice);
  const sale = BigInt(salePrice);
  if (regular <= 0n || sale >= regular) return null;
  // Half-up on bigint: add half the divisor before dividing.
  return Math.max(1, Number(((regular - sale) * 100n + regular / 2n) / regular));
}

export type CampaignUrgency =
  | { kind: 'none' }
  | { kind: 'lastDay' }
  | { kind: 'urgent'; days: number }
  | { kind: 'deadline'; date: string };

/**
 * How to phrase a campaign's remaining time.
 *
 * Reads only `daysLeft`, which the API computed from the same clock that decided
 * the campaign is live. Deriving it here from `new Date()` would drift between
 * SSR and hydration and could contradict the badge it sits on.
 */
export function campaignUrgency(campaign: SaleCampaignSummary): CampaignUrgency {
  if (campaign.lastBookingDate === null || campaign.daysLeft === null) return { kind: 'none' };
  if (campaign.daysLeft === 0) return { kind: 'lastDay' };
  if (campaign.daysLeft <= URGENT_DAYS) return { kind: 'urgent', days: campaign.daysLeft };
  return { kind: 'deadline', date: campaign.lastBookingDate };
}

/**
 * The percent to advertise, or null when there is nothing honest to claim.
 *
 * `regularPriceFrom > priceFrom` means the search actually priced a bookable
 * window, so that exact percent wins. Otherwise the only number available is the
 * campaign's deepest discount — a ceiling, not a rate the visitor is guaranteed,
 * which is why the caller renders it as "up to".
 */
export function campaignHeadlinePercent(
  campaign: SaleCampaignSummary | null,
  pricedPercent: number | null,
): { percent: number; exact: boolean } | null {
  if (pricedPercent !== null) return { percent: pricedPercent, exact: true };
  if (campaign && campaign.discountPercent > 0)
    return { percent: campaign.discountPercent, exact: false };
  return null;
}
