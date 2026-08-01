import type { QuoteResponse } from '@booking/contracts';

/**
 * The named sale campaigns a quote is actually being discounted by, in the
 * order they first appear.
 *
 * Read from the LINE ITEMS rather than the quote as a whole because that is the
 * only place the name exists: a booking can span hours priced by different
 * rules, so one quote can carry several campaigns. Taking the first line's
 * label would silently hide the rest.
 *
 * The labels are partner-authored text in the tenant's own language — render
 * them as-is, never translate them.
 */
export function campaignLabelsOf(quote: QuoteResponse): string[] {
  const seen = new Set<string>();
  for (const line of quote.lineItems) {
    const label = line.campaignLabel?.trim();
    if (label) seen.add(label);
  }
  return [...seen];
}
