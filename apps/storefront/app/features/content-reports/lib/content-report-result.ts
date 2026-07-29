/**
 * A content report is submitted to the page it was raised from, so its action
 * result lands on that page's route. The dialog reads the outcome straight off
 * `actionData`, and revalidating would discard it — so the pages that host the
 * report dialog skip revalidation for exactly this payload.
 *
 * The owning feature declares the shape here; routes no longer duck-type
 * another feature's response.
 */
export function isContentReportResult(actionResult: unknown): boolean {
  return typeof actionResult === 'object' && actionResult !== null && 'reportOk' in actionResult;
}

export function contentReportShouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: {
  actionResult: unknown;
  defaultShouldRevalidate: boolean;
}): boolean {
  return isContentReportResult(actionResult) ? false : defaultShouldRevalidate;
}
