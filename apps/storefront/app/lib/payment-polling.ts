export type PaymentPollLoader = (href: string) => void | Promise<void>;

export function paymentPollDelay(attempt: number): number {
  if (attempt < 5) return 3_000;
  if (attempt < 11) return 5_000;
  if (attempt < 17) return 10_000;
  return 30_000;
}

/** Payment status polling is best-effort. Route/fetcher state owns the visible
 * error, while this boundary prevents sync throws or rejected load promises
 * from becoming unhandled and stopping future scheduled attempts. */
export async function runPaymentPollLoad(load: PaymentPollLoader, href: string): Promise<void> {
  try {
    await load(href);
  } catch {
    return;
  }
}
