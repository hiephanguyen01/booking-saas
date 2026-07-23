export function paymentPollDelay(attempt: number): number {
  if (attempt < 5) return 3_000;
  if (attempt < 11) return 5_000;
  if (attempt < 17) return 10_000;
  return 30_000;
}
